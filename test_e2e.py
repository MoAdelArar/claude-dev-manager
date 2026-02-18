"""
End-to-end test for AdelBot backend.
Creates a test user directly in DB, then tests every API endpoint.
"""
import asyncio
import sys
import httpx

BASE = "http://localhost:8000"
API = f"{BASE}/api/v1"

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}: {detail}")


async def setup_test_user() -> str:
    """Insert a test user directly into DB and return a JWT."""
    from backend.config.database import AsyncSessionLocal
    from backend.models.user import User
    from backend.models.billing import Subscription, SubscriptionTier
    from backend.models.repository import Repository
    from backend.models.session import DevSession, SessionEvent, SessionStatus, EventType
    from backend.middleware.auth import create_access_token
    from datetime import datetime, timezone

    async with AsyncSessionLocal() as db:
        user = User(
            github_id=99999,
            github_username="testuser",
            github_access_token="ghp_fake_token",
            email="test@adelbot.dev",
            avatar_url="https://avatars.githubusercontent.com/u/1?v=4",
            display_name="Test User",
            is_active=True,
            is_admin=True,
        )
        db.add(user)
        await db.flush()

        sub = Subscription(
            user_id=user.id,
            tier=SubscriptionTier.PRO,
            is_active=True,
            current_period_start=datetime.now(timezone.utc),
            minutes_used_this_period=12.5,
        )
        db.add(sub)

        repo = Repository(
            user_id=user.id,
            github_repo_id=123456,
            full_name="testuser/test-repo",
            name="test-repo",
            description="A test repository for E2E testing",
            default_branch="main",
            language="Python",
            is_private=False,
            clone_url="https://github.com/testuser/test-repo.git",
        )
        db.add(repo)
        await db.flush()

        session = DevSession(
            user_id=user.id,
            repository_id=repo.id,
            task_description="Add unit tests for the auth module",
            branch="main",
            status=SessionStatus.COMPLETED,
            started_at=datetime.now(timezone.utc),
            ended_at=datetime.now(timezone.utc),
            duration_seconds=180.5,
            cost_cents=3,
            tokens_used=15000,
            commit_sha="abc1234567890",
            commit_message="[AdelBot] Add unit tests for auth",
            files_changed=5,
        )
        db.add(session)
        await db.flush()

        for i, (evt, content) in enumerate([
            (EventType.STATUS_CHANGE, "Session created"),
            (EventType.STATUS_CHANGE, "Container ready"),
            (EventType.AGENT_MESSAGE, "Analyzing codebase..."),
            (EventType.AGENT_ACTION, "[Bash] pytest tests/"),
            (EventType.COMMAND_OUTPUT, "4 passed, 0 failed"),
            (EventType.GIT_OPERATION, "Pushed to main: abc1234"),
        ]):
            event = SessionEvent(
                session_id=session.id,
                event_type=evt,
                content=content,
                sequence=i,
            )
            db.add(event)

        await db.commit()

        token = create_access_token(user.id)
        return token, user.id, repo.id, session.id


async def main():
    global passed, failed

    print("\n🔧 Setting up test data...\n")
    token, user_id, repo_id, session_id = await setup_test_user()
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=10) as client:

        # ─── Public ────────────────────────
        print("📡 Public Endpoints")
        r = await client.get(f"{BASE}/")
        check("GET /", r.status_code == 200 and r.json()["status"] == "running")

        r = await client.get(f"{BASE}/health")
        check("GET /health", r.status_code == 200 and r.json()["status"] == "healthy")

        # ─── Auth ──────────────────────────
        print("\n🔐 Auth Endpoints")
        r = await client.get(f"{API}/auth/github/url")
        check("GET /auth/github/url", r.status_code == 200 and "url" in r.json())

        r = await client.get(f"{API}/auth/me", headers=headers)
        check("GET /auth/me", r.status_code == 200 and r.json()["github_username"] == "testuser", r.text[:200])

        r = await client.post(f"{API}/auth/refresh", headers=headers)
        check("POST /auth/refresh", r.status_code == 200 and "access_token" in r.json(), r.text[:200])

        r = await client.get(f"{API}/auth/me")
        check("GET /auth/me (no token) → 403", r.status_code == 403)

        # ─── Repositories ──────────────────
        print("\n📁 Repository Endpoints")
        r = await client.get(f"{API}/repositories/", headers=headers)
        check("GET /repositories/", r.status_code == 200 and len(r.json()) >= 1, r.text[:200])

        r = await client.get(f"{API}/repositories/{repo_id}", headers=headers)
        check("GET /repositories/:id", r.status_code == 200 and r.json()["name"] == "test-repo", r.text[:200])

        r = await client.get(f"{API}/repositories/nonexistent", headers=headers)
        check("GET /repositories/:bad_id → 404", r.status_code == 404)

        # ─── Sessions ─────────────────────
        print("\n⚡ Session Endpoints")
        r = await client.get(f"{API}/sessions/", headers=headers)
        check("GET /sessions/", r.status_code == 200 and r.json()["total"] >= 1, r.text[:200])

        r = await client.get(f"{API}/sessions/{session_id}", headers=headers)
        data = r.json()
        check("GET /sessions/:id", r.status_code == 200 and data["status"] == "completed", r.text[:200])
        check("  └─ has duration", data.get("duration_seconds") == 180.5)
        check("  └─ has commit", data.get("commit_sha") == "abc1234567890")
        check("  └─ has cost", data.get("cost_cents") == 3)

        r = await client.get(f"{API}/sessions/{session_id}/events", headers=headers)
        events = r.json()
        check("GET /sessions/:id/events", r.status_code == 200 and len(events) == 6, f"got {len(events)} events")
        check("  └─ events ordered", events[0]["sequence"] == 0 and events[-1]["sequence"] == 5)

        # Test create session (will stay PENDING since no Docker container will actually be started by the background task)
        r = await client.post(f"{API}/sessions/", headers=headers, json={
            "repository_id": repo_id,
            "task_description": "E2E test: add a README",
            "branch": "main",
        })
        check("POST /sessions/ (create)", r.status_code == 200 and r.json()["status"] == "pending", r.text[:200])
        new_session_id = r.json()["id"]

        r = await client.get(f"{API}/sessions/{new_session_id}", headers=headers)
        check("GET new session", r.status_code == 200 and r.json()["task_description"] == "E2E test: add a README")

        # ─── Billing ──────────────────────
        print("\n💳 Billing Endpoints")
        r = await client.get(f"{API}/billing/usage", headers=headers)
        check("GET /billing/usage", r.status_code == 200 and "subscription" in r.json() and "totals" in r.json(), r.text[:200])
        usage = r.json()
        check("  └─ tier is pro", usage["subscription"]["tier"] == "pro")
        check("  └─ minutes tracked", usage["subscription"]["minutes_used_this_period"] == 12.5)

        r = await client.get(f"{API}/billing/history", headers=headers)
        check("GET /billing/history", r.status_code == 200)

        r = await client.get(f"{API}/billing/plans", headers=headers)
        plans = r.json()
        check("GET /billing/plans", r.status_code == 200 and len(plans) == 4, r.text[:200])
        check("  └─ has free tier", any(p["tier"] == "free" for p in plans))
        check("  └─ has enterprise", any(p["tier"] == "enterprise" for p in plans))

        r = await client.get(f"{API}/billing/subscription", headers=headers)
        check("GET /billing/subscription", r.status_code == 200 and r.json()["tier"] == "pro", r.text[:200])

        # ─── Admin ─────────────────────────
        print("\n🛡️  Admin Endpoints")
        r = await client.get(f"{API}/admin/stats", headers=headers)
        stats = r.json()
        check("GET /admin/stats", r.status_code == 200 and "users" in stats, r.text[:200])
        check("  └─ user count", stats["users"]["total"] >= 1)
        check("  └─ session count", stats["sessions"]["total"] >= 1)
        check("  └─ repo count", stats["repositories"]["total"] >= 1)

        r = await client.get(f"{API}/admin/users", headers=headers)
        users = r.json()
        check("GET /admin/users", r.status_code == 200 and users["total"] >= 1, r.text[:200])
        check("  └─ has tier info", "tier" in users["users"][0])
        check("  └─ has session_count", "session_count" in users["users"][0])

        r = await client.get(f"{API}/admin/users?search=testuser", headers=headers)
        check("GET /admin/users?search", r.status_code == 200 and r.json()["total"] >= 1)

        r = await client.get(f"{API}/admin/users/{user_id}", headers=headers)
        detail = r.json()
        check("GET /admin/users/:id", r.status_code == 200 and detail["github_username"] == "testuser", r.text[:200])
        check("  └─ has stats", detail["stats"]["total_sessions"] >= 1)
        check("  └─ has recent_sessions", len(detail["recent_sessions"]) >= 1)

        r = await client.patch(f"{API}/admin/users/{user_id}", headers=headers, json={"tier": "team"})
        check("PATCH /admin/users/:id (change tier)", r.status_code == 200 and r.json()["ok"])

        r = await client.get(f"{API}/admin/users/{user_id}", headers=headers)
        check("  └─ tier actually changed", r.json()["subscription"]["tier"] == "team")

        r = await client.patch(f"{API}/admin/users/{user_id}", headers=headers, json={"tier": "pro"})
        check("  └─ revert tier back", r.status_code == 200)

        r = await client.get(f"{API}/admin/sessions", headers=headers)
        check("GET /admin/sessions", r.status_code == 200 and r.json()["total"] >= 1, r.text[:200])

        r = await client.get(f"{API}/admin/sessions?status_filter=completed", headers=headers)
        check("GET /admin/sessions?status=completed", r.status_code == 200 and r.json()["total"] >= 1)

        r = await client.get(f"{API}/admin/sessions?status_filter=running", headers=headers)
        check("GET /admin/sessions?status=running", r.status_code == 200)

        r = await client.get(f"{API}/admin/containers", headers=headers)
        check("GET /admin/containers", r.status_code == 200)

        r = await client.get(f"{API}/admin/billing/overview?days=30", headers=headers)
        check("GET /admin/billing/overview", r.status_code == 200 and "revenue_cents" in r.json(), r.text[:200])

    # ─── Summary ──────────────────────
    total = passed + failed
    print(f"\n{'='*50}")
    print(f"  Results: {passed}/{total} passed, {failed} failed")
    print(f"{'='*50}\n")
    return failed == 0


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
