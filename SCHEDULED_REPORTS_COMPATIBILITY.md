# Scheduled Reports — Compatibility Report

> Generated before any code changes. Describes reuse, new additions, and impact.

---

## 1. Existing Services Reused (zero duplication)

| Service | How it is reused |
|---|---|
| `ReportService.generate(request, owner_sub)` | Called directly by the schedule runner for every due schedule. No new report logic. |
| `DatasetService.get_metadata(dataset_id)` | Used at schedule-creation time to validate the dataset exists and capture `dataset_filename`. |
| `app/core/config.py` Settings | Two new fields added (`scheduled_reports_dir`, `schedule_runner_poll_seconds`). Same `_STORAGE_FIELDS` fan-out pattern. |
| `app/core/storage.py` StorageManager | New volume `("scheduled_reports", settings.scheduled_reports_dir)` added to existing `_volumes` list. |
| `app/core/auth.get_current_user` | Reused as-is on all four new routes. |
| `app/api/params.HexId` | Reused for `schedule_id` path parameter. |
| `app/api/dependencies.py` | Two new `@lru_cache` singletons added following the existing provider pattern. |
| Filesystem JSON store pattern | `ScheduleStore` follows the same `{id}.json` pattern used by `ConnectionService` and `DashboardStore`. |
| `lifespan()` in `main.py` | Runner is started inside the existing lifespan context; stopped in `finally` alongside `client.aclose()`. |

---

## 2. New Files Required

### Backend (4 new files)

| File | Purpose |
|---|---|
| `backend/app/schemas/scheduled_report.py` | Pydantic schemas: `ScheduledReportCreate`, `ScheduledReport`, `ScheduledReportListResponse` |
| `backend/app/services/schedule_store.py` | Filesystem JSON store: save, get, list, delete, list_due |
| `backend/app/services/schedule_runner.py` | asyncio background task: polls every 60 s, calls `ReportService.generate()` for due schedules, computes `next_run_at` |
| `backend/app/api/routes/scheduled_reports.py` | 5 REST routes: create, list, get, update, delete |

### Frontend (6 new files)

| File | Purpose |
|---|---|
| `frontend-next/src/lib/api/scheduled-reports.ts` | API client functions |
| `frontend-next/src/hooks/use-scheduled-reports.ts` | TanStack Query hooks |
| `frontend-next/src/app/reports/scheduled/page.tsx` | Route shell (server component) |
| `frontend-next/src/components/reports/ScheduledReportsWorkspace.tsx` | Main client workspace |
| `frontend-next/src/components/reports/ScheduleForm.tsx` | Create / edit form |
| `frontend-next/src/components/reports/ScheduleCard.tsx` | Card for listing a schedule |

---

## 3. Files Modified

### Backend

| File | Change |
|---|---|
| `backend/app/core/config.py` | Add `scheduled_reports_dir: Path = Path("scheduled_reports")` to `_STORAGE_FIELDS` and `Settings`; add `schedule_runner_poll_seconds: int = 60` |
| `backend/app/core/storage.py` | Add `("scheduled_reports", settings.scheduled_reports_dir)` to `_volumes` list |
| `backend/app/api/dependencies.py` | Add `get_schedule_store()` and `get_schedule_runner()` singletons |
| `backend/app/main.py` | Import + register `scheduled_reports` router; start/stop `ScheduleRunner` in lifespan |

### Frontend

| File | Change |
|---|---|
| `frontend-next/src/lib/api/types.ts` | Add `ScheduleFrequency`, `ScheduledReport`, `ScheduledReportCreate`, `ScheduledReportListResponse` types |
| `frontend-next/src/components/layout/Sidebar.tsx` | Add "Scheduled" nav link under Reports section |

---

## 4. New REST API

All routes under `/api/v1/reports/scheduled`. Require Bearer JWT.

| Method | Path | Description |
|---|---|---|
| `POST` | `/reports/scheduled` | Create a schedule |
| `GET` | `/reports/scheduled` | List schedules for authenticated user |
| `GET` | `/reports/scheduled/{schedule_id}` | Get one schedule |
| `PUT` | `/reports/scheduled/{schedule_id}` | Update a schedule (frequency, hour, questions, enabled) |
| `DELETE` | `/reports/scheduled/{schedule_id}` | Delete a schedule |

### Request schema (`POST` / `PUT`)

```json
{
  "dataset_id": "abc123",
  "frequency": "weekly",
  "hour": 8,
  "day_of_week": 1,
  "day_of_month": null,
  "questions": [],
  "enabled": true
}
```

### Response schema

```json
{
  "schedule_id": "hex32",
  "dataset_id": "abc123",
  "dataset_filename": "sales.csv",
  "frequency": "weekly",
  "hour": 8,
  "day_of_week": 1,
  "day_of_month": null,
  "questions": [],
  "owner_sub": "google|...",
  "created_at": "2026-06-15T08:00:00Z",
  "last_run_at": null,
  "next_run_at": "2026-06-16T08:00:00Z",
  "enabled": true
}
```

---

## 5. New Database / Storage

No new database. One new filesystem directory:

```
scheduled_reports/
└── {hex32}.json    ← one file per ScheduledReport
```

Same pattern as `connections/`, `dashboards/`. No SQLAlchemy, no SQLite, no migrations.

---

## 6. New Dependencies

**None.** The scheduler uses `asyncio.create_task` + `asyncio.sleep` — already available in Python 3.11. No APScheduler, Celery, or Redis required.

---

## 7. Impact on Current Report System

| Area | Impact |
|---|---|
| `POST /reports` | Unchanged. Scheduled reports call this service method internally, not the HTTP route. |
| `GET /reports` | Unchanged. Scheduled-report-generated PDFs appear in the standard report list (same `reports/` directory, same `ReportMetadata` shape). |
| `GET /reports/{id}/download` | Unchanged. |
| `ReportService` | Read-only reuse of `generate()`. No modifications. |
| Existing tests | No breakage. New routes are additive. |
| Rate limiting | Scheduled runner calls the service layer directly, bypassing HTTP — so it does not consume the user's rate limit quota. |

---

## 8. Scheduling Logic (no third-party library)

`next_run_at` is computed at creation and updated after every run:

| Frequency | Rule |
|---|---|
| `daily` | Next occurrence of `hour:00 UTC` after now |
| `weekly` | Next occurrence of `(day_of_week, hour:00 UTC)` — 0=Monday |
| `monthly` | Next occurrence of `(day_of_month, hour:00 UTC)` — capped at day 28 to avoid month-end edge cases |

The runner polls every `SCHEDULE_RUNNER_POLL_SECONDS` (default 60). If a run fails, the error is logged and `next_run_at` advances normally so the next occurrence still fires.

---

## Summary

| Category | Count |
|---|---|
| Existing services reused | 8 |
| New backend files | 4 |
| New frontend files | 6 |
| Backend files modified | 4 |
| Frontend files modified | 2 |
| New pip dependencies | 0 |
| New npm dependencies | 0 |
| Breaking changes to existing API | 0 |
