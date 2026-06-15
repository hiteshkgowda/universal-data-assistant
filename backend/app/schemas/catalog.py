"""Schemas for the Data Catalog feature.

These are the only new schemas needed.  All column and connection types
reuse the existing schemas from app.schemas.connection.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.schemas.connection import TableColumn


class ForeignKeyInfo(BaseModel):
    """A foreign-key constraint discovered via SQLAlchemy inspect()."""

    name: Optional[str] = None
    constrained_columns: list[str]
    referred_schema: Optional[str] = None
    referred_table: str
    referred_columns: list[str]


class TableSchemaResponse(BaseModel):
    """Column list + foreign keys for a single database table.

    Returned by GET /connections/{id}/describe?table=X&schema=Y.
    Reuses the existing TableColumn schema so callers share one type.
    """

    table: str
    schema_name: Optional[str] = None
    columns: list[TableColumn]
    foreign_keys: list[ForeignKeyInfo]
