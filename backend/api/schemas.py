from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class GitHubAuthRequest(BaseModel):
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    github_username: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    display_name: Optional[str] = None
    is_admin: bool = False
    is_active: bool = True

    class Config:
        from_attributes = True


class RepositoryResponse(BaseModel):
    id: str
    github_repo_id: int
    full_name: str
    name: str
    description: Optional[str] = None
    default_branch: str
    language: Optional[str] = None
    is_private: bool
    clone_url: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreateSessionRequest(BaseModel):
    repository_id: str
    task_description: str
    branch: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    repository_id: str
    status: str
    branch: str
    task_description: str
    container_id: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    cost_cents: int = 0
    tokens_used: int = 0
    commit_sha: Optional[str] = None
    commit_message: Optional[str] = None
    files_changed: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionEventResponse(BaseModel):
    id: str
    session_id: str
    event_type: str
    sequence: int
    content: str
    metadata_json: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total: int


class UsageSummaryResponse(BaseModel):
    subscription: dict
    totals: dict


class BillingRecordResponse(BaseModel):
    id: str
    billing_type: str
    amount_cents: int
    description: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserMessageRequest(BaseModel):
    message: str


class AgentEventMessage(BaseModel):
    event_type: str
    content: str
    session_id: str
    timestamp: str


TokenResponse.model_rebuild()
