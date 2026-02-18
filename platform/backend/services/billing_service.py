import structlog
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.models.billing import BillingRecord, BillingType, Subscription, SubscriptionTier, TIER_LIMITS
from backend.models.session import DevSession
from backend.models.user import User
from backend.config import settings

logger = structlog.get_logger()


class BillingService:

    @staticmethod
    async def get_or_create_subscription(db: AsyncSession, user_id: str) -> Subscription:
        result = await db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        sub = result.scalar_one_or_none()

        if not sub:
            sub = Subscription(
                user_id=user_id,
                tier=SubscriptionTier.FREE,
                is_active=True,
                current_period_start=datetime.now(timezone.utc),
            )
            db.add(sub)
            await db.flush()

        return sub

    @staticmethod
    async def get_usage_summary(db: AsyncSession, user_id: str) -> dict:
        sub = await BillingService.get_or_create_subscription(db, user_id)
        limits = TIER_LIMITS[sub.tier]

        total_spent_result = await db.execute(
            select(func.sum(BillingRecord.amount_cents)).where(
                BillingRecord.user_id == user_id,
                BillingRecord.billing_type == BillingType.SESSION_CHARGE,
            )
        )
        total_spent = total_spent_result.scalar() or 0

        total_sessions_result = await db.execute(
            select(func.count(DevSession.id)).where(DevSession.user_id == user_id)
        )
        total_sessions = total_sessions_result.scalar() or 0

        total_minutes_result = await db.execute(
            select(func.sum(DevSession.duration_seconds)).where(
                DevSession.user_id == user_id,
                DevSession.duration_seconds.is_not(None),
            )
        )
        total_seconds = total_minutes_result.scalar() or 0

        return {
            "subscription": {
                "tier": sub.tier.value,
                "is_active": sub.is_active,
                "minutes_used_this_period": round(sub.minutes_used_this_period, 1),
                "minutes_limit": limits["minutes_per_month"],
                "max_concurrent_sessions": limits["max_concurrent_sessions"],
                "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
                "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
            },
            "totals": {
                "total_spent_cents": total_spent,
                "total_sessions": total_sessions,
                "total_minutes": round(total_seconds / 60, 1) if total_seconds else 0,
            },
        }

    @staticmethod
    async def get_billing_history(
        db: AsyncSession,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[BillingRecord]:
        result = await db.execute(
            select(BillingRecord)
            .where(BillingRecord.user_id == user_id)
            .order_by(BillingRecord.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    @staticmethod
    async def upgrade_subscription(
        db: AsyncSession,
        user_id: str,
        tier: SubscriptionTier,
        stripe_subscription_id: Optional[str] = None,
    ) -> Subscription:
        sub = await BillingService.get_or_create_subscription(db, user_id)
        sub.tier = tier
        sub.stripe_subscription_id = stripe_subscription_id
        sub.current_period_start = datetime.now(timezone.utc)
        sub.minutes_used_this_period = 0
        await db.flush()

        logger.info("subscription_upgraded", user_id=user_id, tier=tier.value)
        return sub

    @staticmethod
    async def reset_period_usage(db: AsyncSession) -> int:
        result = await db.execute(select(Subscription).where(Subscription.is_active == True))
        subs = list(result.scalars().all())
        count = 0
        for sub in subs:
            sub.minutes_used_this_period = 0
            sub.current_period_start = datetime.now(timezone.utc)
            count += 1
        await db.flush()
        return count
