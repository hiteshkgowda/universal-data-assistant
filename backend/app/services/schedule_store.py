"""Filesystem-backed store for ScheduledReport records.

One JSON file per schedule: ``<scheduled_reports_dir>/<schedule_id>.json``.
Follows the same pattern used by ConnectionService and DashboardStore.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.core.exceptions import DataAssistantError
from app.schemas.scheduled_report import ScheduledReport

logger = logging.getLogger(__name__)


class ScheduleNotFoundError(DataAssistantError):
    pass


class ScheduleStore:
    def __init__(self, schedules_dir: Path) -> None:
        self._dir = schedules_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Write operations
    # ------------------------------------------------------------------ #

    def save(self, schedule: ScheduledReport) -> None:
        path = self._dir / f"{schedule.schedule_id}.json"
        path.write_text(schedule.model_dump_json(), encoding="utf-8")

    def delete(self, schedule_id: str, owner_sub: str) -> None:
        schedule = self._load_raw(schedule_id)
        if schedule.owner_sub != owner_sub:
            raise ScheduleNotFoundError(f"Schedule {schedule_id!r} not found.")
        path = self._dir / f"{schedule_id}.json"
        path.unlink(missing_ok=True)

    # ------------------------------------------------------------------ #
    # Read operations
    # ------------------------------------------------------------------ #

    def get(self, schedule_id: str, owner_sub: str) -> ScheduledReport:
        schedule = self._load_raw(schedule_id)
        if schedule.owner_sub != owner_sub:
            raise ScheduleNotFoundError(f"Schedule {schedule_id!r} not found.")
        return schedule

    def list_for_user(self, owner_sub: str) -> list[ScheduledReport]:
        results: list[ScheduledReport] = []
        for path in self._dir.glob("*.json"):
            try:
                s = ScheduledReport(**json.loads(path.read_text(encoding="utf-8")))
                if s.owner_sub == owner_sub:
                    results.append(s)
            except Exception:
                logger.warning("Skipping malformed schedule file: %s", path)
        return sorted(results, key=lambda s: s.created_at, reverse=True)

    def list_due(self) -> list[ScheduledReport]:
        """Return all enabled schedules whose next_run_at is in the past."""
        now = datetime.now(timezone.utc)
        due: list[ScheduledReport] = []
        for path in self._dir.glob("*.json"):
            try:
                s = ScheduledReport(**json.loads(path.read_text(encoding="utf-8")))
                if s.enabled and s.next_run_at <= now:
                    due.append(s)
            except Exception:
                logger.warning("Skipping malformed schedule file: %s", path)
        return due

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _load_raw(self, schedule_id: str) -> ScheduledReport:
        path = self._dir / f"{schedule_id}.json"
        if not path.exists():
            raise ScheduleNotFoundError(f"Schedule {schedule_id!r} not found.")
        try:
            return ScheduledReport(**json.loads(path.read_text(encoding="utf-8")))
        except Exception as exc:
            raise ScheduleNotFoundError(
                f"Schedule {schedule_id!r} could not be read: {exc}"
            ) from exc
