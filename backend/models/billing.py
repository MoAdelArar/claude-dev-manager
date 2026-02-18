import enum
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Float, ForeignKey, Text, DateTime, Enum as SAEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, generate_uuid


class BillingType(str, enum.Enum):
    SESSION_CHARGE = "session_charge"
    CREDIT_PURCHASE = "credit_purchase"
    SUBSCRIPTION = "subscription"
    REFUND = "refund"


class SubscriptionTier(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    TEAM = "team"
    ENTERPRISE = "enterprise"


TIER_LIMITS = {
    SubscriptionTier.FREE: {"minutes_per_month": 60, "max_concurrent_sessions": 1, "price_cents": 0},
    SubscriptionTier.PRO: {"minutes_per_month": 600, "max_concurrent_sessions": 3, "price_cents": 1999},
    SubscriptionTier.TEAM: {"minutes_per_month": 3000, "max_concurrent_sessions": 10, "price_cents": 7999},
    SubscriptionTier.ENTERPRISE: {"minutes_per_month": -1, "max_concurrent_sessions": -1, "price_cents": -1},
}


class BillingRecord(Base, TimestampMixin):
    __tablename__ = "billing_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    session_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("dev_sessions.id"), nullable=True)

    billing_type: Mapped[BillingType] = mapped_column(SAEnum(BillingType), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    stripe_payment_intent_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_invoice_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="billing_records")


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)

    tier: Mapped[SubscriptionTier] = mapped_column(
        SAEnum(SubscriptionTier), default=SubscriptionTier.FREE, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    current_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    minutes_used_this_period: Mapped[float] = mapped_column(Float, default=0.0)

    user = relationship("User", back_populates="subscription")
