"""Pydantic schemas for the Saved Queries feature."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class SavedQuery(BaseModel):
    query_id: str
    name: str
    dataset_id: str
    dataset_filename: str
    question: str
    owner_sub: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SaveSavedQueryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    dataset_id: str = Field(..., min_length=1)
    dataset_filename: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=2000)


class RenameSavedQueryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class SavedQueryListResponse(BaseModel):
    count: int
    queries: list[SavedQuery]
