import json
import asyncio
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy import select

from backend.config.database import AsyncSessionLocal
from backend.middleware.auth import decode_token
from backend.models.user import User
from backend.models.session import DevSession, SessionStatus, SessionEvent, EventType

logger = structlog.get_logger()

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            dead = []
            for ws in self.active_connections[session_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active_connections[session_id].remove(ws)


manager = ConnectionManager()


@router.websocket("/ws/session/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    user_id = decode_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DevSession).where(
                DevSession.id == session_id,
                DevSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            await websocket.close(code=4004, reason="Session not found")
            return

    await manager.connect(session_id, websocket)
    logger.info("ws_connected", session_id=session_id, user_id=user_id)

    try:
        last_sequence = 0

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
                msg = json.loads(data)

                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("type") == "get_status":
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(DevSession).where(DevSession.id == session_id)
                        )
                        session = result.scalar_one_or_none()
                        if session:
                            await websocket.send_json({
                                "type": "status",
                                "status": session.status.value,
                                "started_at": session.started_at.isoformat() if session.started_at else None,
                            })

            except asyncio.TimeoutError:
                pass

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(SessionEvent)
                    .where(
                        SessionEvent.session_id == session_id,
                        SessionEvent.sequence > last_sequence,
                    )
                    .order_by(SessionEvent.sequence)
                )
                new_events = list(result.scalars().all())

                for event in new_events:
                    await websocket.send_json({
                        "type": "event",
                        "event_type": event.event_type.value,
                        "content": event.content,
                        "sequence": event.sequence,
                        "timestamp": event.timestamp.isoformat(),
                    })
                    last_sequence = event.sequence

                result = await db.execute(
                    select(DevSession).where(DevSession.id == session_id)
                )
                session = result.scalar_one_or_none()
                if session and session.status in (
                    SessionStatus.COMPLETED,
                    SessionStatus.FAILED,
                    SessionStatus.CANCELLED,
                ):
                    await websocket.send_json({
                        "type": "session_ended",
                        "status": session.status.value,
                        "commit_sha": session.commit_sha,
                        "duration_seconds": session.duration_seconds,
                        "cost_cents": session.cost_cents,
                        "error_message": session.error_message,
                    })
                    break

    except WebSocketDisconnect:
        logger.info("ws_disconnected", session_id=session_id)
    except Exception as e:
        logger.error("ws_error", session_id=session_id, error=str(e))
    finally:
        manager.disconnect(session_id, websocket)
