import enum
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Float, ForeignKey, Text, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, generate_uuid


class SessionStatus(str, enum.Enum):
    PENDING = "pending"
    PROVISIONING = "provisioning"
    RUNNING = "running"
    AGENT_WORKING = "agent_working"
    PUSHING = "pushing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class EventType(str, enum.Enum):
    USER_MESSAGE = "user_message"
    AGENT_MESSAGE = "agent_message"
    AGENT_ACTION = "agent_action"
    FILE_CHANGE = "file_change"
    COMMAND_EXEC = "command_exec"
    COMMAND_OUTPUT = "command_output"
    GIT_OPERATION = "git_operation"
    ERROR = "error"
    STATUS_CHANGE = "status_change"
    CONTAINER_LOG = "container_log"


class DevSession(Base, TimestampMixin):
    __tablename__ = "dev_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id"), nullable=False)

    status: Mapped[SessionStatus] = mapped_column(
        SAEnum(SessionStatus), default=SessionStatus.PENDING, nullable=False
    )
    branch: Mapped[str] = mapped_column(String(255), default="main")
    task_description: Mapped[str] = mapped_column(Text, nullable=False)
    execution_mode: Mapped[str] = mapped_column(String(20), default="claude")  # "claude" or "cdm"

    container_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    container_image: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)

    commit_sha: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    commit_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    files_changed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="sessions")
    repository = relationship("Repository", back_populates="sessions")
    events = relationship("SessionEvent", back_populates="session", lazy="selectin", order_by="SessionEvent.sequence")


class SessionEvent(Base):
    __tablename__ = "session_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("dev_sessions.id"), nullable=False)

    event_type: Mapped[EventType] = mapped_column(SAEnum(EventType), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    session = relationship("DevSession", back_populates="events")
