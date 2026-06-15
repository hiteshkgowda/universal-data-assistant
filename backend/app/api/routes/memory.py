"""Conversational memory routes.

GET  /memory/context   — return full session context
DELETE /memory/clear   — wipe a session from all storage layers
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_memory_service
from app.core.auth import get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.memory import ConversationContext, MemoryClearResponse, QueryHistoryResponse
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get(
    "/context",
    response_model=ConversationContext,
    summary="Retrieve full conversation context for a session",
)
async def get_context(
    session_id: str = Query(..., min_length=1, description="Client-generated session UUID"),
    memory: MemoryService = Depends(get_memory_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> ConversationContext:
    """Return all stored turns and a human-readable summary for the session.

    The session is scoped to the authenticated user — you cannot retrieve
    another user's session even if you know the session_id.
    """
    return await memory.get_context(session_id=session_id, user_sub=current_user.sub)


@router.get(
    "/history",
    response_model=QueryHistoryResponse,
    summary="List all query turns across all sessions for the current user",
)
async def get_history(
    search: Optional[str] = Query(None, description="Substring match on question text"),
    turn_types: Optional[list[str]] = Query(None, description="Filter by turn type(s)"),
    dataset_id: Optional[str] = Query(None, description="Filter by dataset ID"),
    limit: int = Query(50, ge=1, le=200, description="Max turns to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    memory: MemoryService = Depends(get_memory_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> QueryHistoryResponse:
    """Return all recorded turns for the authenticated user across all sessions.

    Supports substring search on question text, turn-type filtering, and
    offset-based pagination. Heavy fields (chart_spec, table_data) are excluded
    from the response to keep payloads small.
    """
    return await memory.get_history(
        user_sub=current_user.sub,
        search=search,
        turn_types=turn_types,
        dataset_id=dataset_id,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/clear",
    response_model=MemoryClearResponse,
    summary="Clear all turns from a conversation session",
)
async def clear_session(
    session_id: str = Query(..., min_length=1, description="Session to clear"),
    memory: MemoryService = Depends(get_memory_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> MemoryClearResponse:
    """Delete all turns for the session from L1 cache, Redis, and SQLite.

    The session is scoped to the authenticated user.
    """
    return await memory.clear_session(
        session_id=session_id, user_sub=current_user.sub
    )
