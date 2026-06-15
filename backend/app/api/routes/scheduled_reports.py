"""Scheduled report routes: create, list, get, update, delete."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_dataset_service, get_schedule_store
from app.api.params import HexId
from app.core.auth import get_current_user
from app.core.exceptions import DatasetNotFoundError
from app.schemas.auth import CurrentUser
from app.schemas.scheduled_report import (
    ScheduledReport,
    ScheduledReportCreate,
    ScheduledReportListResponse,
)
from app.services.dataset_service import DatasetService
from app.services.schedule_runner import compute_next_run
from app.services.schedule_store import ScheduleNotFoundError, ScheduleStore

router = APIRouter(prefix="/reports/scheduled", tags=["scheduled-reports"])


def _build_schedule(
    body: ScheduledReportCreate,
    dataset_filename: str,
    owner_sub: str,
    schedule_id: Optional[str] = None,
    created_at: Optional[datetime] = None,
    last_run_at: Optional[datetime] = None,
) -> ScheduledReport:
    """Build a ScheduledReport from a create/update request."""
    now = datetime.now(timezone.utc)
    draft = ScheduledReport(
        schedule_id=schedule_id or uuid.uuid4().hex,
        dataset_id=body.dataset_id,
        dataset_filename=dataset_filename,
        frequency=body.frequency,
        hour=body.hour,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
        questions=body.questions,
        owner_sub=owner_sub,
        created_at=created_at or now,
        last_run_at=last_run_at,
        next_run_at=now,  # placeholder; overwritten below
        enabled=body.enabled,
    )
    draft = draft.model_copy(update={"next_run_at": compute_next_run(draft)})
    return draft


@router.post(
    "",
    response_model=ScheduledReport,
    status_code=status.HTTP_201_CREATED,
    summary="Create a scheduled report",
)
async def create_schedule(
    body: ScheduledReportCreate,
    store: ScheduleStore = Depends(get_schedule_store),
    datasets: DatasetService = Depends(get_dataset_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> ScheduledReport:
    try:
        meta = datasets.get_metadata(body.dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if meta.owner_sub and meta.owner_sub != current_user.sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dataset not found.")

    schedule = _build_schedule(body, meta.filename, current_user.sub)
    store.save(schedule)
    return schedule


@router.get(
    "",
    response_model=ScheduledReportListResponse,
    summary="List scheduled reports",
)
async def list_schedules(
    store: ScheduleStore = Depends(get_schedule_store),
    current_user: CurrentUser = Depends(get_current_user),
) -> ScheduledReportListResponse:
    schedules = store.list_for_user(current_user.sub)
    return ScheduledReportListResponse(count=len(schedules), schedules=schedules)


@router.get(
    "/{schedule_id}",
    response_model=ScheduledReport,
    summary="Get a scheduled report",
)
async def get_schedule(
    schedule_id: HexId,
    store: ScheduleStore = Depends(get_schedule_store),
    current_user: CurrentUser = Depends(get_current_user),
) -> ScheduledReport:
    try:
        return store.get(schedule_id, current_user.sub)
    except ScheduleNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put(
    "/{schedule_id}",
    response_model=ScheduledReport,
    summary="Update a scheduled report",
)
async def update_schedule(
    schedule_id: HexId,
    body: ScheduledReportCreate,
    store: ScheduleStore = Depends(get_schedule_store),
    datasets: DatasetService = Depends(get_dataset_service),
    current_user: CurrentUser = Depends(get_current_user),
) -> ScheduledReport:
    try:
        existing = store.get(schedule_id, current_user.sub)
    except ScheduleNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        meta = datasets.get_metadata(body.dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if meta.owner_sub and meta.owner_sub != current_user.sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dataset not found.")

    updated = _build_schedule(
        body,
        meta.filename,
        current_user.sub,
        schedule_id=existing.schedule_id,
        created_at=existing.created_at,
        last_run_at=existing.last_run_at,
    )
    store.save(updated)
    return updated


@router.delete(
    "/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a scheduled report",
)
async def delete_schedule(
    schedule_id: HexId,
    store: ScheduleStore = Depends(get_schedule_store),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    try:
        store.delete(schedule_id, current_user.sub)
    except ScheduleNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
