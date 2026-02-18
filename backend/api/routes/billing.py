from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.database import get_db
from backend.middleware.auth import get_current_user
from backend.models.user import User
from backend.services.billing_service import BillingService
from backend.api.schemas import UsageSummaryResponse, BillingRecordResponse

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/usage", response_model=UsageSummaryResponse)
async def get_usage(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    summary = await BillingService.get_usage_summary(db, user.id)
    return UsageSummaryResponse(**summary)


@router.get("/history", response_model=list[BillingRecordResponse])
async def get_billing_history(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    records = await BillingService.get_billing_history(db, user.id, limit, offset)
    return [BillingRecordResponse.model_validate(r) for r in records]


@router.get("/subscription")
async def get_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sub = await BillingService.get_or_create_subscription(db, user.id)
    return {
        "id": sub.id,
        "tier": sub.tier.value,
        "is_active": sub.is_active,
        "minutes_used_this_period": round(sub.minutes_used_this_period, 1),
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


@router.get("/plans")
async def get_available_plans():
    from backend.models.billing import TIER_LIMITS, SubscriptionTier

    plans = []
    for tier in SubscriptionTier:
        limits = TIER_LIMITS[tier]
        plans.append({
            "tier": tier.value,
            "price_cents_monthly": limits["price_cents"],
            "minutes_per_month": limits["minutes_per_month"],
            "max_concurrent_sessions": limits["max_concurrent_sessions"],
        })
    return plans
