"""Background asyncio task that fires scheduled reports when they are due.

The runner polls the ScheduleStore every ``poll_interval`` seconds, calls
ReportService.generate() for each due schedule, then advances next_run_at.
It runs as a single asyncio Task started from FastAPI's lifespan() and
cancelled on shutdown — no external scheduler library required.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.schemas.scheduled_report import ScheduleFrequency, ScheduledReport
from app.services.report_service import ReportService
from app.services.schedule_store import ScheduleStore
from app.schemas.report import ReportRequest

logger = logging.getLogger(__name__)


def compute_next_run(schedule: ScheduledReport, after: Optional[datetime] = None) -> datetime:
    """Return the next UTC datetime this schedule should fire."""
    now = after or datetime.now(timezone.utc)
    base = now.replace(minute=0, second=0, microsecond=0)

    if schedule.frequency == ScheduleFrequency.DAILY:
        candidate = base.replace(hour=schedule.hour)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    if schedule.frequency == ScheduleFrequency.WEEKLY:
        dow = schedule.day_of_week or 0
        days_ahead = dow - now.weekday()
        if days_ahead < 0 or (days_ahead == 0 and now.hour >= schedule.hour):
            days_ahead += 7
        candidate = (now + timedelta(days=days_ahead)).replace(
            hour=schedule.hour, minute=0, second=0, microsecond=0
        )
        return candidate

    # Monthly
    dom = schedule.day_of_month or 1
    try:
        candidate = now.replace(day=dom, hour=schedule.hour, minute=0, second=0, microsecond=0)
    except ValueError:
        # day out of range for this month — use day 1 of next month
        candidate = now.replace(day=1, hour=schedule.hour, minute=0, second=0, microsecond=0)
    if candidate <= now:
        # Advance by one month
        month = now.month % 12 + 1
        year = now.year + (1 if now.month == 12 else 0)
        try:
            candidate = candidate.replace(year=year, month=month)
        except ValueError:
            candidate = candidate.replace(year=year, month=month, day=1)
    return candidate


class ScheduleRunner:
    """Poll and fire due scheduled reports."""

    def __init__(
        self,
        store: ScheduleStore,
        report_service: ReportService,
        poll_interval: int = 60,
    ) -> None:
        self._store = store
        self._report_service = report_service
        self._poll_interval = poll_interval
        self._task: Optional[asyncio.Task] = None  # type: ignore[type-arg]

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name="schedule_runner")
        logger.info("ScheduleRunner started (poll every %ds).", self._poll_interval)

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("ScheduleRunner stopped.")

    # ------------------------------------------------------------------ #
    # Internal
    # ------------------------------------------------------------------ #

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(self._poll_interval)
            try:
                await self._tick()
            except Exception:
                logger.exception("ScheduleRunner tick error.")

    async def _tick(self) -> None:
        due = self._store.list_due()
        if not due:
            return
        logger.info("ScheduleRunner: %d schedule(s) due.", len(due))
        for schedule in due:
            await self._fire(schedule)

    async def _fire(self, schedule: ScheduledReport) -> None:
        logger.info(
            "Firing scheduled report: schedule_id=%s dataset_id=%s owner=%s",
            schedule.schedule_id,
            schedule.dataset_id,
            schedule.owner_sub,
        )
        try:
            request = ReportRequest(
                dataset_id=schedule.dataset_id,
                questions=schedule.questions,
            )
            await self._report_service.generate(request, owner_sub=schedule.owner_sub)
            logger.info("Scheduled report generated: schedule_id=%s", schedule.schedule_id)
        except Exception:
            logger.exception(
                "Scheduled report failed: schedule_id=%s", schedule.schedule_id
            )
        finally:
            # Always advance next_run_at so this schedule doesn't re-fire immediately.
            now = datetime.now(timezone.utc)
            updated = schedule.model_copy(
                update={
                    "last_run_at": now,
                    "next_run_at": compute_next_run(schedule, after=now),
                }
            )
            try:
                self._store.save(updated)
            except Exception:
                logger.exception(
                    "Failed to advance next_run_at: schedule_id=%s", schedule.schedule_id
                )
