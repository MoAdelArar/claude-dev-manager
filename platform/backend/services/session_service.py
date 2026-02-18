import json
import structlog
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.models.session import DevSession, SessionEvent, SessionStatus, EventType
from backend.models.repository import Repository
from backend.models.user import User
from backend.models.billing import BillingRecord, BillingType, Subscription, SubscriptionTier, TIER_LIMITS
from backend.services.container_service import container_service
from backend.services.agent_service import agent_service
from backend.config import settings

logger = structlog.get_logger()


class SessionService:

    @staticmethod
    async def create_session(
        db: AsyncSession,
        user: User,
        repository_id: str,
        task_description: str,
        branch: Optional[str] = None,
        execution_mode: str = "claude",
    ) -> DevSession:
        result = await db.execute(
            select(Repository).where(
                Repository.id == repository_id,
                Repository.user_id == user.id,
            )
        )
        repo = result.scalar_one_or_none()
        if not repo:
            raise ValueError("Repository not found")

        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not configured on server. Claude Code requires it.")

        if execution_mode not in ("claude", "cdm"):
            raise ValueError("execution_mode must be 'claude' or 'cdm'")

        tier_check = await SessionService._check_tier_limits(db, user)
        if not tier_check["allowed"]:
            raise ValueError(tier_check["reason"])

        session = DevSession(
            user_id=user.id,
            repository_id=repository_id,
            task_description=task_description,
            branch=branch or repo.default_branch,
            execution_mode=execution_mode,
            status=SessionStatus.PENDING,
        )
        db.add(session)
        await db.flush()

        await SessionService._add_event(
            db, session.id, EventType.STATUS_CHANGE, "Session created", sequence=0
        )

        logger.info(
            "session_created",
            session_id=session.id,
            user=user.github_username,
            repo=repo.full_name,
        )
        return session

    @staticmethod
    async def start_session(db: AsyncSession, session: DevSession, user: User) -> DevSession:
        result = await db.execute(
            select(Repository).where(Repository.id == session.repository_id)
        )
        repo = result.scalar_one()

        session.status = SessionStatus.PROVISIONING
        session.started_at = datetime.now(timezone.utc)
        await db.flush()

        await SessionService._add_event(
            db, session.id, EventType.STATUS_CHANGE,
            "Provisioning container with Claude Code...", sequence=1
        )

        try:
            container_info = await container_service.create_dev_container(
                session_id=session.id,
                repo_clone_url=repo.clone_url,
                branch=session.branch,
                github_token=user.github_access_token,
                anthropic_api_key=settings.ANTHROPIC_API_KEY,
                language=repo.language,
            )

            session.container_id = container_info["container_id"]
            session.container_image = container_info["image"]
            session.status = SessionStatus.RUNNING
            await db.flush()

            mode_label = "CDM Pipeline" if session.execution_mode == "cdm" else "Claude Code"
            await SessionService._add_event(
                db, session.id, EventType.STATUS_CHANGE,
                f"Container ready: {container_info['container_name']} | {mode_label}",
                sequence=2,
            )

        except Exception as e:
            session.status = SessionStatus.FAILED
            session.error_message = str(e)
            await db.flush()
            raise

        return session

    @staticmethod
    async def run_agent(
        db: AsyncSession,
        session: DevSession,
        on_event: Optional[callable] = None,
    ) -> DevSession:
        if not session.container_id:
            raise ValueError("Session has no container")

        session.status = SessionStatus.AGENT_WORKING
        await db.flush()

        await SessionService._add_event(
            db, session.id, EventType.STATUS_CHANGE,
            "Claude Code agent started", sequence=5
        )

        event_counter = [10]

        async def track_event(event_type_str: str, content: str):
            event_type_map = {
                "agent_message": EventType.AGENT_MESSAGE,
                "agent_action": EventType.AGENT_ACTION,
                "file_change": EventType.FILE_CHANGE,
                "command_output": EventType.COMMAND_OUTPUT,
                "error": EventType.ERROR,
            }
            evt_type = event_type_map.get(event_type_str, EventType.AGENT_MESSAGE)
            await SessionService._add_event(
                db, session.id, evt_type, content, sequence=event_counter[0]
            )
            event_counter[0] += 1

            if on_event:
                await on_event(event_type_str, content)

        try:
            result = await agent_service.run_task(
                container_id=session.container_id,
                task_description=session.task_description,
                session_id=session.id,
                execution_mode=session.execution_mode,
                on_event=track_event,
            )

            session.tokens_used = result.get("tokens_used", 0)

            if result.get("success"):
                session.status = SessionStatus.PUSHING
                await db.flush()

                await SessionService._add_event(
                    db, session.id, EventType.STATUS_CHANGE,
                    "Committing and pushing changes to GitHub...",
                    sequence=event_counter[0],
                )
                event_counter[0] += 1

                try:
                    push_result = await container_service.git_commit_and_push(
                        container_id=session.container_id,
                        commit_message=f"[AdelBot/Claude Code] {session.task_description[:80]}",
                        branch=session.branch,
                    )

                    session.commit_sha = push_result.get("commit_sha")
                    session.commit_message = f"[AdelBot/Claude Code] {session.task_description[:80]}"
                    session.files_changed = push_result.get("files_changed", 0)
                    session.status = SessionStatus.COMPLETED

                    await SessionService._add_event(
                        db, session.id, EventType.GIT_OPERATION,
                        f"Pushed to {session.branch}: {push_result.get('commit_sha', '')[:7]} "
                        f"({push_result.get('files_changed', 0)} files changed)",
                        sequence=event_counter[0],
                    )
                except Exception as push_err:
                    nothing_to_commit = "nothing to commit" in str(push_err).lower()
                    if nothing_to_commit:
                        session.status = SessionStatus.COMPLETED
                        await SessionService._add_event(
                            db, session.id, EventType.GIT_OPERATION,
                            "No changes to commit — task may have been analysis-only",
                            sequence=event_counter[0],
                        )
                    else:
                        raise push_err
            else:
                session.status = SessionStatus.FAILED
                session.error_message = result.get("summary", "Claude Code task failed")

        except Exception as e:
            session.status = SessionStatus.FAILED
            session.error_message = str(e)
            logger.error("claude_code_run_failed", session_id=session.id, error=str(e))

        session.ended_at = datetime.now(timezone.utc)
        if session.started_at:
            session.duration_seconds = (session.ended_at - session.started_at).total_seconds()

        await db.flush()
        return session

    @staticmethod
    async def finalize_session(db: AsyncSession, session: DevSession) -> DevSession:
        if session.container_id:
            try:
                await container_service.destroy_container(session.container_id)
            except Exception as e:
                logger.error("container_cleanup_failed", error=str(e))

        if session.duration_seconds and session.duration_seconds > 0:
            duration_minutes = session.duration_seconds / 60
            cost_cents = int(duration_minutes * settings.RATE_PER_MINUTE * 100)
            session.cost_cents = cost_cents

            billing = BillingRecord(
                user_id=session.user_id,
                session_id=session.id,
                billing_type=BillingType.SESSION_CHARGE,
                amount_cents=cost_cents,
                description=f"Claude Code session: {duration_minutes:.1f} min — {session.task_description[:50]}",
            )
            db.add(billing)

            sub_result = await db.execute(
                select(Subscription).where(Subscription.user_id == session.user_id)
            )
            subscription = sub_result.scalar_one_or_none()
            if subscription:
                subscription.minutes_used_this_period += duration_minutes

        if not session.ended_at:
            session.ended_at = datetime.now(timezone.utc)

        await db.flush()
        logger.info(
            "session_finalized",
            session_id=session.id,
            duration=session.duration_seconds,
            cost_cents=session.cost_cents,
        )
        return session

    @staticmethod
    async def cancel_session(db: AsyncSession, session: DevSession) -> DevSession:
        session.status = SessionStatus.CANCELLED
        session.ended_at = datetime.now(timezone.utc)
        if session.started_at:
            session.duration_seconds = (session.ended_at - session.started_at).total_seconds()
        await db.flush()
        return await SessionService.finalize_session(db, session)

    @staticmethod
    async def get_user_sessions(
        db: AsyncSession, user_id: str, limit: int = 20, offset: int = 0,
    ) -> list[DevSession]:
        result = await db.execute(
            select(DevSession)
            .where(DevSession.user_id == user_id)
            .order_by(desc(DevSession.created_at))
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_session(db: AsyncSession, session_id: str, user_id: str) -> Optional[DevSession]:
        result = await db.execute(
            select(DevSession).where(
                DevSession.id == session_id,
                DevSession.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_session_events(db: AsyncSession, session_id: str) -> list[SessionEvent]:
        result = await db.execute(
            select(SessionEvent)
            .where(SessionEvent.session_id == session_id)
            .order_by(SessionEvent.sequence)
        )
        return list(result.scalars().all())

    @staticmethod
    async def _add_event(
        db: AsyncSession,
        session_id: str,
        event_type: EventType,
        content: str,
        sequence: int,
        metadata: Optional[dict] = None,
    ):
        event = SessionEvent(
            session_id=session_id,
            event_type=event_type,
            content=content,
            sequence=sequence,
            metadata_json=json.dumps(metadata) if metadata else None,
        )
        db.add(event)
        await db.flush()

    @staticmethod
    async def _check_tier_limits(db: AsyncSession, user: User) -> dict:
        sub_result = await db.execute(
            select(Subscription).where(Subscription.user_id == user.id)
        )
        subscription = sub_result.scalar_one_or_none()

        tier = subscription.tier if subscription else SubscriptionTier.FREE
        limits = TIER_LIMITS[tier]

        if limits["minutes_per_month"] > 0:
            minutes_used = subscription.minutes_used_this_period if subscription else 0
            if minutes_used >= limits["minutes_per_month"]:
                return {
                    "allowed": False,
                    "reason": f"Monthly limit of {limits['minutes_per_month']} minutes reached. Please upgrade your plan.",
                }

        active_result = await db.execute(
            select(DevSession).where(
                DevSession.user_id == user.id,
                DevSession.status.in_([
                    SessionStatus.RUNNING,
                    SessionStatus.AGENT_WORKING,
                    SessionStatus.PROVISIONING,
                ]),
            )
        )
        active_sessions = list(active_result.scalars().all())

        if limits["max_concurrent_sessions"] > 0:
            if len(active_sessions) >= limits["max_concurrent_sessions"]:
                return {
                    "allowed": False,
                    "reason": f"Max concurrent sessions ({limits['max_concurrent_sessions']}) reached.",
                }

        return {"allowed": True}
