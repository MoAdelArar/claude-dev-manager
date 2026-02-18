from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, Integer, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, generate_uuid


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    github_username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    github_access_token: Mapped[str] = mapped_column(String(512), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    free_minutes_used: Mapped[float] = mapped_column(Float, default=0.0)
    balance_cents: Mapped[int] = mapped_column(Integer, default=0)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    repositories = relationship("Repository", back_populates="user", lazy="selectin")
    sessions = relationship("DevSession", back_populates="user", lazy="selectin")
    billing_records = relationship("BillingRecord", back_populates="user", lazy="selectin")
    subscription = relationship("Subscription", back_populates="user", uselist=False, lazy="selectin")
