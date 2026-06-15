# Saved Queries — Compatibility Report

## Feature scope
- Save a named query (dataset_id + question + user-chosen name)
- Rename a saved query
- Re-run a saved query against the original dataset
- Frontend page at `/saved-queries` with list, inline rename, and re-run

---

## Existing infrastructure reused

### Backend

| Existing asset | Reused as |
|---|---|
| `POST /api/v1/chart` route | Re-run endpoint — saved query calls this unchanged |
| `DashboardStore` pattern | Template for `SavedQueryStore`: hex32 ID, atomic tmp→rename write, owner_sub guard, list scan |
| `_STORAGE_FIELDS` tuple in `config.py` | Add `"saved_queries_dir"` — follows established fan-out pattern |
| `StorageManager._volumes` in `storage.py` | Add `("saved_queries", settings.saved_queries_dir)` |
| `dependencies.py` `@lru_cache(maxsize=1)` factories | Add `get_saved_query_store()` |
| `main.py` `app.include_router(...)` | Register saved_queries router |
| Auth pattern (`owner_sub` from JWT, 404 for wrong owner) | Applied identically to all saved-query routes |

### Frontend

| Existing asset | Reused as |
|---|---|
| `askQuestion()` in `lib/api/chart.ts` | Re-run mutation calls this directly — zero new query logic |
| `ChartResponse` type in `types.ts` | Result type for re-run display |
| `PlotlyChart` component | Renders chart_spec from re-run result inline |
| `DatasetListResponse` / `listDatasets()` | Dataset picker for re-run (if dataset not found) |
| TanStack Query v5 `useQuery`/`useMutation` | Data fetching and mutation patterns |
| Framer Motion / Tailwind patterns | Consistent styling |
| Sidebar nav group pattern | Add "Saved Queries" under Analysis group |

---

## Backend changes

### New files (3)

| File | Purpose |
|---|---|
| `backend/app/schemas/saved_query.py` | `SavedQuery`, `SaveSavedQueryRequest`, `RenameSavedQueryRequest`, `SavedQueryListResponse` |
| `backend/app/services/saved_query_store.py` | Filesystem CRUD: save, get, list_for_user, rename, delete |
| `backend/app/api/routes/saved_queries.py` | 4 routes: POST /saved-queries, GET /saved-queries, PATCH /saved-queries/{id}/rename, DELETE /saved-queries/{id} |

### Modified files (4)

| File | Change |
|---|---|
| `backend/app/core/config.py` | Add `saved_queries_dir: Path = Path("saved_queries")` + `"saved_queries_dir"` to `_STORAGE_FIELDS` |
| `backend/app/core/storage.py` | Add `("saved_queries", settings.saved_queries_dir)` to `self._volumes` |
| `backend/app/api/dependencies.py` | Add `get_saved_query_store() -> SavedQueryStore` factory |
| `backend/app/main.py` | Import and register `saved_queries` router |

---

## Schema definitions

```python
class SavedQuery(BaseModel):
    query_id: str                          # hex32, generated at save time
    name: str                              # user-given display name
    dataset_id: str
    dataset_filename: str                  # stored for display
    question: str                          # the NL question
    owner_sub: str
    created_at: datetime
    last_run_at: Optional[datetime]        # updated on each re-run (client-side only)

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
```

---

## API routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/saved-queries` | Save a new query; stamps `owner_sub` from JWT |
| `GET` | `/api/v1/saved-queries` | List all saved queries for current user (newest first) |
| `PATCH` | `/api/v1/saved-queries/{id}/rename` | Rename a saved query |
| `DELETE` | `/api/v1/saved-queries/{id}` | Delete a saved query |

Re-run is **not** a new backend route. The frontend calls the existing `POST /api/v1/chart`
with `{dataset_id, question}` from the saved query.

---

## Frontend changes

### New files (3)

| File | Purpose |
|---|---|
| `src/lib/api/saved-queries.ts` | `saveQuery()`, `listSavedQueries()`, `renameQuery()`, `deleteQuery()` |
| `src/components/saved-queries/SavedQueriesWorkspace.tsx` | List view + inline rename + re-run with result panel |
| `src/app/saved-queries/page.tsx` | Next.js App Router page |

### Modified files (2)

| File | Change |
|---|---|
| `src/lib/api/types.ts` | Append `SavedQuery`, `SavedQueryListResponse` |
| `src/components/layout/Sidebar.tsx` | Add `{ href: "/saved-queries", label: "Saved", icon: Bookmark }` under Analysis |

---

## Re-run data flow

```
User clicks "Re-run" on a saved query
    │
    ▼
useMutation(askQuestion({ dataset_id, question }))  ← existing function in chart.ts
    │
    ▼
POST /api/v1/chart  ← existing route, unchanged
    │
    ▼
ChartResponse { answer, table_data, chart_type, chart_spec, ... }
    │
    ▼
Inline result panel in SavedQueriesWorkspace:
  - answer text
  - PlotlyChart (if chart_spec present)
  - table summary (first 5 rows)
```

---

## Save flow (from existing Ask workspace)

The Save action can be triggered from two places:
1. **Directly on `/saved-queries`**: user types a question + dataset + name → saves without running
2. **From the Ask workspace** (future): an optional "Save" button on any result turn

For this implementation, save is done from the `/saved-queries` page itself (save form at top).
The existing Ask workspace is **not modified** (Rule 4 — do not refactor unrelated code).

---

## Storage layout

```
saved_queries/
├── a3f2c1d2e5f6a7b8c9d0e1f2a3b4c5d6.json   ← SavedQuery JSON
├── b9e1f4c7d8e9f0a1b2c3d4e5f6a7b8c9.json
└── ...
```

Follows the identical pattern as `dashboards/`, `connections/`, `reports/`.

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Dataset deleted after query saved | Low | Re-run returns 404; show "Dataset no longer available" in UI |
| `SavedQueryStore` corrupts JSON on crash | Low | Atomic write (`.tmp` → rename), same as `DashboardStore` |
| Large question text exceeds display | None | `max_length=2000` on question; line-clamp in UI |
| User saves duplicate questions | None | No dedup enforced — user controls their saved list |
| `last_run_at` not persisted server-side | None | Tracked client-side only (sufficient for display) |
