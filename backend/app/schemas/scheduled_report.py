"""Schemas for scheduled report generation."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ScheduleFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ScheduledReportCreate(BaseModel):
    """Request body for creating or updating a schedule."""

    dataset_id: str = Field(..., min_length=1)
    frequency: ScheduleFrequency
    hour: int = Field(default=8, ge=0, le=23, description="UTC hour to run (0–23).")
    day_of_week: Optional[int] = Field(
        default=None,
        ge=0,
        le=6,
        description="Required for weekly. 0=Monday … 6=Sunday.",
    )
    day_of_month: Optional[int] = Field(
        default=None,
        ge=1,
        le=28,
        description="Required for monthly. 1–28 (28 avoids month-end edge cases).",
    )
    questions: list[str] = Field(default_factory=list)
    enabled: bool = True


class ScheduledReport(BaseModel):
    """A persisted schedule record."""

    schedule_id: str
    dataset_id: str
    dataset_filename: str
    frequency: ScheduleFrequency
    hour: int
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    questions: list[str]
    owner_sub: str
    created_at: datetime
    last_run_at: Optional[datetime] = None
    next_run_at: datetime
    enabled: bool


class ScheduledReportListResponse(BaseModel):
    count: int = Field(..., ge=0)
    schedules: list[ScheduledReport] = Field(default_factory=list)
