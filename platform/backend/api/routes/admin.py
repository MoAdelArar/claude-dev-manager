from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_
from typing import Optional
from datetime import datetime, timezone, timedelta

from backend.config.database import get_db
from backend.middleware.auth import get_admin_user
from backend.models.user import User
from backend.models.session import DevSession, SessionStatus
from backend.models.repository import Repository
from backend.models.billing import BillingRecord, BillingType, Subscription, SubscriptionTier
from backend.services.container_service import container_service
from backend.services.session_service import SessionService

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── System Overview ───────────────────────────────────────────────

@router.get("/stats")
async def get_system_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )).scalar() or 0

    total_sessions = (await db.execute(select(func.count(DevSession.id)))).scalar() or 0
    active_sessions = (await db.execute(
        select(func.count(DevSession.id)).where(
            DevSession.status.in_([
                SessionStatus.RUNNING, SessionStatus.AGENT_WORKING, SessionStatus.PROVISIONING
            ])
        )
    )).scalar() or 0
    completed_sessions = (await db.execute(
        select(func.count(DevSession.id)).where(DevSession.status == SessionStatus.COMPLETED)
    )).scalar() or 0
    failed_sessions = (await db.execute(
        select(func.count(DevSession.id)).where(DevSession.status == SessionStatus.FAILED)
    )).scalar() or 0

    total_repos = (await db.execute(select(func.count(Repository.id)))).scalar() or 0

    total_revenue = (await db.execute(
        select(func.sum(BillingRecord.amount_cents)).where(
            BillingRecord.billing_type == BillingType.SESSION_CHARGE
        )
    )).scalar() or 0

    total_minutes = (await db.execute(
        select(func.sum(DevSession.duration_seconds)).where(
            DevSession.duration_seconds.is_not(None)
        )
    )).scalar() or 0

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    new_users_30d = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= thirty_days_ago)
    )).scalar() or 0
    sessions_30d = (await db.execute(
        select(func.count(DevSession.id)).where(DevSession.created_at >= thirty_days_ago)
    )).scalar() or 0
    revenue_30d = (await db.execute(
        select(func.sum(BillingRecord.amount_cents)).where(
            and_(
                BillingRecord.billing_type == BillingType.SESSION_CHARGE,
                BillingRecord.created_at >= thirty_days_ago,
            )
        )
    )).scalar() or 0

    seven_days_ago = now - timedelta(days=7)
    sessions_7d = (await db.execute(
        select(func.count(DevSession.id)).where(DevSession.created_at >= seven_days_ago)
    )).scalar() or 0

    sub_counts = {}
    for tier in SubscriptionTier:
        count = (await db.execute(
            select(func.count(Subscription.id)).where(Subscription.tier == tier)
        )).scalar() or 0
        sub_counts[tier.value] = count

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "new_30d": new_users_30d,
        },
        "sessions": {
            "total": total_sessions,
            "active": active_sessions,
            "completed": completed_sessions,
            "failed": failed_sessions,
            "last_30d": sessions_30d,
            "last_7d": sessions_7d,
        },
        "repositories": {"total": total_repos},
        "billing": {
            "total_revenue_cents": total_revenue,
            "revenue_30d_cents": revenue_30d,
            "total_minutes": round((total_minutes or 0) / 60, 1),
        },
        "subscriptions": sub_counts,
    }


# ─── User Management ──────────────────────────────────────────────

@router.get("/users")
async def list_users(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    tier: Optional[str] = None,
    sort: str = "created_at",
    order: str = "desc",
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(User)

    if search:
        query = query.where(
            User.github_username.ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%") |
            User.display_name.ilike(f"%{search}%")
        )
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    sort_col = getattr(User, sort, User.created_at)
    query = query.order_by(desc(sort_col) if order == "desc" else sort_col)
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    users = list(result.scalars().all())

    count_query = select(func.count(User.id))
    if search:
        count_query = count_query.where(
            User.github_username.ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%")
        )
    total = (await db.execute(count_query)).scalar() or 0

    user_list = []
    for u in users:
        sub_result = await db.execute(
            select(Subscription).where(Subscription.user_id == u.id)
        )
        sub = sub_result.scalar_one_or_none()

        session_count = (await db.execute(
            select(func.count(DevSession.id)).where(DevSession.user_id == u.id)
        )).scalar() or 0

        user_list.append({
            "id": u.id,
            "github_username": u.github_username,
            "email": u.email,
            "avatar_url": u.avatar_url,
            "display_name": u.display_name,
            "is_active": u.is_active,
            "is_admin": u.is_admin,
            "created_at": u.created_at.isoformat(),
            "updated_at": u.updated_at.isoformat(),
            "tier": sub.tier.value if sub else "free",
            "session_count": session_count,
        })

    return {"users": user_list, "total": total}


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sub_result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    sub = sub_result.scalar_one_or_none()

    sessions = await SessionService.get_user_sessions(db, user_id, limit=10)
    session_count = (await db.execute(
        select(func.count(DevSession.id)).where(DevSession.user_id == user_id)
    )).scalar() or 0

    total_spent = (await db.execute(
        select(func.sum(BillingRecord.amount_cents)).where(
            BillingRecord.user_id == user_id,
            BillingRecord.billing_type == BillingType.SESSION_CHARGE,
        )
    )).scalar() or 0

    total_minutes = (await db.execute(
        select(func.sum(DevSession.duration_seconds)).where(
            DevSession.user_id == user_id,
            DevSession.duration_seconds.is_not(None),
        )
    )).scalar() or 0

    return {
        "id": user.id,
        "github_id": user.github_id,
        "github_username": user.github_username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
        "subscription": {
            "tier": sub.tier.value if sub else "free",
            "is_active": sub.is_active if sub else True,
            "minutes_used": round(sub.minutes_used_this_period, 1) if sub else 0,
        },
        "stats": {
            "total_sessions": session_count,
            "total_spent_cents": total_spent,
            "total_minutes": round((total_minutes or 0) / 60, 1),
        },
        "recent_sessions": [
            {
                "id": s.id,
                "status": s.status.value,
                "task_description": s.task_description,
                "created_at": s.created_at.isoformat(),
                "duration_seconds": s.duration_seconds,
                "cost_cents": s.cost_cents,
            }
            for s in sessions
        ],
    }


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    updates: dict,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_fields = {"is_active", "is_admin"}
    for key, value in updates.items():
        if key in allowed_fields:
            setattr(user, key, value)

    if "tier" in updates:
        sub_result = await db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        sub = sub_result.scalar_one_or_none()
        if sub:
            sub.tier = SubscriptionTier(updates["tier"])
        else:
            sub = Subscription(
                user_id=user_id,
                tier=SubscriptionTier(updates["tier"]),
                is_active=True,
                current_period_start=datetime.now(timezone.utc),
            )
            db.add(sub)

    await db.flush()
    return {"ok": True}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    user.is_active = False
    await db.flush()
    return {"ok": True}


# ─── Session Management ───────────────────────────────────────────

@router.get("/sessions")
async def list_all_sessions(
    status_filter: Optional[str] = None,
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "created_at",
    order: str = "desc",
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(DevSession)

    if status_filter:
        try:
            query = query.where(DevSession.status == SessionStatus(status_filter))
        except ValueError:
            pass
    if user_id:
        query = query.where(DevSession.user_id == user_id)
    if search:
        query = query.where(DevSession.task_description.ilike(f"%{search}%"))

    sort_col = getattr(DevSession, sort, DevSession.created_at)
    query = query.order_by(desc(sort_col) if order == "desc" else sort_col)
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    sessions = list(result.scalars().all())

    count_query = select(func.count(DevSession.id))
    if status_filter:
        try:
            count_query = count_query.where(DevSession.status == SessionStatus(status_filter))
        except ValueError:
            pass
    if user_id:
        count_query = count_query.where(DevSession.user_id == user_id)
    total = (await db.execute(count_query)).scalar() or 0

    session_list = []
    for s in sessions:
        user_result = await db.execute(select(User).where(User.id == s.user_id))
        user = user_result.scalar_one_or_none()
        session_list.append({
            "id": s.id,
            "user_id": s.user_id,
            "username": user.github_username if user else "unknown",
            "avatar_url": user.avatar_url if user else None,
            "repository_id": s.repository_id,
            "status": s.status.value,
            "branch": s.branch,
            "task_description": s.task_description,
            "container_id": s.container_id,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "duration_seconds": s.duration_seconds,
            "cost_cents": s.cost_cents,
            "tokens_used": s.tokens_used,
            "commit_sha": s.commit_sha,
            "files_changed": s.files_changed,
            "error_message": s.error_message,
            "created_at": s.created_at.isoformat(),
        })

    return {"sessions": session_list, "total": total}


@router.post("/sessions/{session_id}/cancel")
async def admin_cancel_session(
    session_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DevSession).where(DevSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session = await SessionService.cancel_session(db, session)
    return {"ok": True, "status": session.status.value}


# ─── Container Management ─────────────────────────────────────────

@router.get("/containers")
async def list_containers(
    admin: User = Depends(get_admin_user),
):
    try:
        containers = container_service.client.containers.list(
            filters={"label": "adelbot.session_id"}
        )
        result = []
        for c in containers:
            result.append({
                "id": c.id[:12],
                "name": c.name,
                "status": c.status,
                "image": c.image.tags[0] if c.image.tags else "unknown",
                "session_id": c.labels.get("adelbot.session_id", ""),
                "created_at": c.labels.get("adelbot.created_at", ""),
            })
        return {"containers": result, "total": len(result)}
    except Exception as e:
        return {"containers": [], "total": 0, "error": str(e)}


@router.delete("/containers/{container_id}")
async def kill_container(
    container_id: str,
    admin: User = Depends(get_admin_user),
):
    try:
        await container_service.destroy_container(container_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/containers/cleanup")
async def cleanup_containers(
    admin: User = Depends(get_admin_user),
):
    cleaned = await container_service.cleanup_expired_containers()
    return {"cleaned": cleaned}


# ─── Billing Overview ─────────────────────────────────────────────

@router.get("/billing/overview")
async def billing_overview(
    days: int = 30,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    revenue = (await db.execute(
        select(func.sum(BillingRecord.amount_cents)).where(
            BillingRecord.billing_type == BillingType.SESSION_CHARGE,
            BillingRecord.created_at >= since,
        )
    )).scalar() or 0

    record_count = (await db.execute(
        select(func.count(BillingRecord.id)).where(BillingRecord.created_at >= since)
    )).scalar() or 0

    records_result = await db.execute(
        select(BillingRecord)
        .where(BillingRecord.created_at >= since)
        .order_by(desc(BillingRecord.created_at))
        .limit(50)
    )
    records = list(records_result.scalars().all())

    return {
        "period_days": days,
        "revenue_cents": revenue,
        "record_count": record_count,
        "recent_records": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "session_id": r.session_id,
                "billing_type": r.billing_type.value,
                "amount_cents": r.amount_cents,
                "description": r.description,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ],
    }
