import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.database import get_db, AsyncSessionLocal
from backend.middleware.auth import get_current_user
from backend.models.user import User
from backend.services.session_service import SessionService
from backend.api.schemas import (
    CreateSessionRequest,
    SessionResponse,
    SessionEventResponse,
    SessionListResponse,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


async def _run_session_pipeline(session_id: str, user_id: str):
    """Background task: provision container, run agent, push, finalize."""
    async with AsyncSessionLocal() as db:
        try:
            from sqlalchemy import select
            from backend.models.session import DevSession
            from backend.models.user import User as UserModel

            result = await db.execute(select(DevSession).where(DevSession.id == session_id))
            session = result.scalar_one()

            user_result = await db.execute(select(UserModel).where(UserModel.id == user_id))
            user = user_result.scalar_one()

            session = await SessionService.start_session(db, session, user)
            await db.commit()

            session = await SessionService.run_agent(db, session)
            await db.commit()

            session = await SessionService.finalize_session(db, session)
            await db.commit()

        except Exception as e:
            import structlog
            logger = structlog.get_logger()
            logger.error("session_pipeline_failed", session_id=session_id, error=str(e))
            try:
                from backend.models.session import SessionStatus
                result = await db.execute(select(DevSession).where(DevSession.id == session_id))
                session = result.scalar_one_or_none()
                if session:
                    session.status = SessionStatus.FAILED
                    session.error_message = str(e)
                    await db.commit()
                    await SessionService.finalize_session(db, session)
                    await db.commit()
            except Exception:
                pass


@router.post("/", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        session = await SessionService.create_session(
            db=db,
            user=user,
            repository_id=request.repository_id,
            task_description=request.task_description,
            branch=request.branch,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    background_tasks.add_task(_run_session_pipeline, session.id, user.id)
    return SessionResponse.model_validate(session)


@router.get("/", response_model=SessionListResponse)
async def list_sessions(
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sessions = await SessionService.get_user_sessions(db, user.id, limit, offset)
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions],
        total=len(sessions),
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await SessionService.get_session(db, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse.model_validate(session)


@router.get("/{session_id}/events", response_model=list[SessionEventResponse])
async def get_session_events(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await SessionService.get_session(db, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    events = await SessionService.get_session_events(db, session_id)
    return [SessionEventResponse.model_validate(e) for e in events]


@router.post("/{session_id}/cancel", response_model=SessionResponse)
async def cancel_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await SessionService.get_session(db, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session = await SessionService.cancel_session(db, session)
    return SessionResponse.model_validate(session)
