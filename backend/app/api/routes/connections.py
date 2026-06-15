"""Database connection routes: create/list/delete, test, discover, register."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_connection_service, get_dataset_service
from app.api.params import HexId
from app.core.auth import get_current_user
from app.core.exceptions import (
    ConnectionNotFoundError,
    DatabaseError,
    ValidationError,
)
from app.schemas.auth import CurrentUser
from app.schemas.catalog import TableSchemaResponse
from app.schemas.connection import (
    ConnectionCreate,
    ConnectionMetadata,
    ConnectionTestResult,
    RegisterTableRequest,
    TableListResponse,
)
from app.schemas.dataset import DatasetMetadata
from app.services.connection_service import ConnectionService
from app.services.dataset_service import DatasetService

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post(
    "",
    response_model=ConnectionMetadata,
    status_code=status.HTTP_201_CREATED,
    summary="Create a database connection",
)
async def create_connection(
    request: ConnectionCreate,
    service: ConnectionService = Depends(get_connection_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> ConnectionMetadata:
    try:
        return await run_in_threadpool(service.create_connection, request, current_user.sub)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "",
    response_model=list[ConnectionMetadata],
    summary="List database connections",
)
async def list_connections(
    service: ConnectionService = Depends(get_connection_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[ConnectionMetadata]:
    return await run_in_threadpool(service.list_connections, current_user.sub)


def _assert_connection_owner(
    service: ConnectionService, connection_id: str, owner_sub: str
) -> None:
    """Raise 404 if the connection doesn't exist or belongs to another user."""
    try:
        record = service._read_record(connection_id)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if record.owner_sub and record.owner_sub != owner_sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Connection '{connection_id}' not found.")


@router.delete(
    "/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a database connection",
)
async def delete_connection(
    connection_id: HexId,
    service: ConnectionService = Depends(get_connection_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await run_in_threadpool(_assert_connection_owner, service, connection_id, current_user.sub)
    try:
        await run_in_threadpool(service.delete_connection, connection_id)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/{connection_id}/test",
    response_model=ConnectionTestResult,
    summary="Test a database connection",
)
async def test_connection(
    connection_id: HexId,
    service: ConnectionService = Depends(get_connection_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> ConnectionTestResult:
    await run_in_threadpool(_assert_connection_owner, service, connection_id, current_user.sub)
    try:
        return await run_in_threadpool(service.test_connection, connection_id)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/{connection_id}/tables",
    response_model=TableListResponse,
    summary="Discover tables in a connection",
)
async def list_tables(
    connection_id: HexId,
    service: ConnectionService = Depends(get_connection_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> TableListResponse:
    await run_in_threadpool(_assert_connection_owner, service, connection_id, current_user.sub)
    try:
        tables = await run_in_threadpool(service.list_tables, connection_id)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return TableListResponse(count=len(tables), tables=tables)


@router.get(
    "/{connection_id}/describe",
    response_model=TableSchemaResponse,
    summary="Describe a table: columns and foreign keys",
)
async def describe_table(
    connection_id: HexId,
    table: str = Query(..., min_length=1, description="Table name."),
    schema: Optional[str] = Query(None, description="Schema/namespace (optional)."),
    service: ConnectionService = Depends(get_connection_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> TableSchemaResponse:
    """Return column definitions and foreign-key constraints for a single table.

    Used by the Data Catalog to populate the detail panel without registering
    the table as a dataset first.  Raises 404 if the connection is not found
    or is not owned by the current user, and 502 if the database is unreachable.
    """
    await run_in_threadpool(_assert_connection_owner, service, connection_id, current_user.sub)
    try:
        columns = await run_in_threadpool(
            service.describe_table, connection_id, schema, table
        )
        foreign_keys = await run_in_threadpool(
            service.get_foreign_keys, connection_id, schema, table
        )
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return TableSchemaResponse(
        table=table,
        schema_name=schema,
        columns=columns,
        foreign_keys=foreign_keys,
    )


@router.post(
    "/{connection_id}/datasets",
    response_model=DatasetMetadata,
    status_code=status.HTTP_201_CREATED,
    summary="Register a table as a dataset",
)
async def register_table(
    connection_id: HexId,
    request: RegisterTableRequest,
    connections: ConnectionService = Depends(get_connection_service),
    datasets: DatasetService = Depends(get_dataset_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> DatasetMetadata:
    await run_in_threadpool(_assert_connection_owner, connections, connection_id, current_user.sub)
    try:
        await run_in_threadpool(connections.get_engine, connection_id)
        return await run_in_threadpool(
            datasets.register_table, connection_id, request, current_user.sub
        )
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
