"""Filesystem persistence for saved queries.

Storage layout (inside ``SAVED_QUERIES_DIR``):
    <hex32>.json   — serialised SavedQuery

Follows the same pattern as DashboardStore: one JSON file per record,
keyed by a hex32 ID generated at save time, atomic tmp→rename write,
and 404 (not 403) for resources owned by others.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.saved_query import SavedQuery, SaveSavedQueryRequest

logger = logging.getLogger(__name__)


class SavedQueryNotFoundError(Exception):
    """Raised when a saved query does not exist or does not belong to the caller."""


class SavedQueryStore:
    """Read/write SavedQuery JSON files on the local filesystem."""

    def __init__(self, saved_queries_dir: Path) -> None:
        self._dir = saved_queries_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Write
    # ------------------------------------------------------------------ #

    def save(self, request: SaveSavedQueryRequest, owner_sub: str) -> SavedQuery:
        """Persist a new saved query and return it with a generated ID."""
        query_id = secrets.token_hex(16)
        query = SavedQuery(
            query_id=query_id,
            name=request.name,
            dataset_id=request.dataset_id,
            dataset_filename=request.dataset_filename,
            question=request.question,
            owner_sub=owner_sub,
            created_at=datetime.now(timezone.utc),
        )

        path = self._dir / f"{query_id}.json"
        tmp = path.with_suffix(".tmp")
        try:
            tmp.write_text(query.model_dump_json(), encoding="utf-8")
            tmp.rename(path)
        except OSError as exc:
            logger.error("SavedQueryStore.save: failed to write %s: %s", path, exc)
            raise

        logger.info(
            "SavedQueryStore: saved query %s ('%s') for user %.8s",
            query_id,
            request.name,
            owner_sub,
        )
        return query

    def rename(self, query_id: str, owner_sub: str, new_name: str) -> SavedQuery:
        """Update the name field of an existing saved query."""
        query = self.get(query_id, owner_sub)
        updated = query.model_copy(update={"name": new_name})

        path = self._dir / f"{query_id}.json"
        tmp = path.with_suffix(".tmp")
        try:
            tmp.write_text(updated.model_dump_json(), encoding="utf-8")
            tmp.rename(path)
        except OSError as exc:
            logger.error("SavedQueryStore.rename: failed to write %s: %s", path, exc)
            raise

        return updated

    def delete(self, query_id: str, owner_sub: str) -> None:
        """Delete a saved query. Raises SavedQueryNotFoundError if not found / not owned."""
        query = self.get(query_id, owner_sub)  # ownership check
        path = self._dir / f"{query.query_id}.json"
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            logger.error("SavedQueryStore.delete: failed to delete %s: %s", path, exc)
            raise

    # ------------------------------------------------------------------ #
    # Read
    # ------------------------------------------------------------------ #

    def get(self, query_id: str, owner_sub: str) -> SavedQuery:
        """Return the saved query matching ``query_id``.

        Raises:
            SavedQueryNotFoundError: if the file does not exist or the caller
                does not own it (404, not 403, to avoid enumeration).
        """
        path = self._dir / f"{query_id}.json"
        if not path.exists():
            raise SavedQueryNotFoundError(f"Saved query '{query_id}' not found.")

        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            query = SavedQuery(**raw)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            logger.error(
                "SavedQueryStore.get: could not deserialise %s: %s", path, exc
            )
            raise SavedQueryNotFoundError(
                f"Saved query '{query_id}' is corrupt."
            ) from exc

        if query.owner_sub and query.owner_sub != owner_sub:
            raise SavedQueryNotFoundError(f"Saved query '{query_id}' not found.")

        return query

    def list_for_user(self, owner_sub: str) -> list[SavedQuery]:
        """Return all saved queries owned by ``owner_sub``, newest first."""
        results: list[SavedQuery] = []
        for path in self._dir.glob("*.json"):
            if path.suffix == ".tmp":
                continue
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                query = SavedQuery(**raw)
            except (OSError, json.JSONDecodeError, ValueError):
                continue
            if query.owner_sub and query.owner_sub != owner_sub:
                continue
            results.append(query)
        results.sort(key=lambda q: q.created_at, reverse=True)
        return results
