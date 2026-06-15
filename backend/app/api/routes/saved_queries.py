"""Saved Queries routes.

POST   /api/v1/saved-queries              — save a new named query
GET    /api/v1/saved-queries              — list saved queries for the current user
PATCH  /api/v1/saved-queries/{id}/rename  — rename a saved query
DELETE /api/v1/saved-queries/{id}         — delete a saved query

Re-run is handled entirely on the frontend by calling the existing
POST /api/v1/chart endpoint — no new re-run route is needed here.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_saved_query_store
from app.core.auth import get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.saved_query import (
    RenameSavedQueryRequest,
    SavedQuery,
    SavedQueryListResponse,
    SaveSavedQueryRequest,
)
from app.services.saved_query_store import SavedQueryNotFoundError, SavedQueryStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/saved-queries", tags=["saved-queries"])


@router.post(
    "",
    response_model=SavedQuery,
    status_code=status.HTTP_201_CREATED,
    summary="Save a named query",
)
async def create_saved_query(
    request: SaveSavedQueryRequest,
    store: SavedQueryStore = Depends(get_saved_query_store),
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedQuery:
    """Persist a new saved query for the current user.

    ``owner_sub`` is always stamped from the JWT — it cannot be supplied in
    the request body, preventing cross-user saves.
    """
    return store.save(request, owner_sub=current_user.sub)


@router.get(
    "",
    response_model=SavedQueryListResponse,
    summary="List saved queries for the current user",
)
async def list_saved_queries(
    store: SavedQueryStore = Depends(get_saved_query_store),
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedQueryListResponse:
    """Return all saved queries owned by the current user, newest first."""
    queries = store.list_for_user(current_user.sub)
    return SavedQueryListResponse(count=len(queries), queries=queries)


@router.patch(
    "/{query_id}/rename",
    response_model=SavedQuery,
    summary="Rename a saved query",
)
async def rename_saved_query(
    query_id: str,
    request: RenameSavedQueryRequest,
    store: SavedQueryStore = Depends(get_saved_query_store),
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedQuery:
    """Update the name of a saved query.

    Raises:
        HTTP 404: Query not found or not owned by the current user.
    """
    try:
        return store.rename(query_id, current_user.sub, request.name)
    except SavedQueryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@router.delete(
    "/{query_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved query",
)
async def delete_saved_query(
    query_id: str,
    store: SavedQueryStore = Depends(get_saved_query_store),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Delete a saved query.

    Raises:
        HTTP 404: Query not found or not owned by the current user.
    """
    try:
        store.delete(query_id, current_user.sub)
    except SavedQueryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
