# Query History — Compatibility Report

## Feature scope
- `/history` page showing all previous queries, answers, and analysis turns
- Search across question text
- Filter by turn type and dataset
- Re-run any prior query/chart/forecast directly from history
- No new storage — reuses `conversation_turns` SQLite table

---

## Existing storage audit

### `conversation_turns` table (already exists)

```sql
CREATE TABLE IF NOT EXISTS conversation_turns (
    turn_id          TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL,
    user_sub         TEXT NOT NULL,         -- owner, JWT sub claim
    created_at       TEXT NOT NULL,         -- ISO 8601, sortable
    turn_type        TEXT NOT NULL,         -- query | chart | forecast | ...
    dataset_id       TEXT,
    question         TEXT,
    answer           TEXT,
    table_data       TEXT,                  -- JSON (not needed for history list)
    chart_spec       TEXT,                  -- JSON (not needed for history list)
    insights         TEXT,
    anomalies        TEXT,
    forecast         TEXT,
    recommendations  TEXT,
    metadata         TEXT
);

-- Already-existing index — perfect for cross-session user history
CREATE INDEX idx_conv_user_created ON conversation_turns (user_sub, created_at DESC);
```

`idx_conv_user_created` covers exactly what query history needs: all turns for a user, sorted newest-first, across all sessions. **No new index or table required.**

---

## What is already recorded in `conversation_turns`

| Turn type | Recorded by | Fields populated |
|---|---|---|
| `query` | `routes/query.py` after analytics | `question`, `answer`, `table_data` |
| `chart` | `routes/chart.py` after chart gen | `question`, `answer`, `chart_spec`, `table_data` |
| `forecast` | `routes/forecast.py` | `question`, `answer`, `chart_spec`, `forecast` |
| `anomaly` | `routes/anomalies.py` | `answer`, `anomalies` |
| `insight` | `routes/insights.py` | `question`, `answer`, `insights` |
| `recommendation` | `routes/recommendations.py` | `answer`, `recommendations` |
| `report` | `routes/reports.py` | `answer`, `metadata` |
| `agent` | `routes/agent.py` | `question`, `answer`, `metadata` |

All required history fields (`turn_id`, `session_id`, `created_at`, `turn_type`, `dataset_id`, `question`, `answer`) are already written and indexed.

---

## Gap: no cross-session user history read path

Existing reads are all scoped to `(session_id, user_sub)`:

| Existing endpoint | Scope |
|---|---|
| `GET /memory/context?session_id=X` | One session |
| `DELETE /memory/clear?session_id=X` | One session |

**Missing:** a read path that queries ALL turns for `user_sub` across sessions, with optional search and filter.

---

## Backend changes required (minimal)

| File | Change type | Description |
|---|---|---|
| `backend/app/schemas/memory.py` | Add 2 models | `HistoryTurn` (lightweight — no heavy JSON fields), `QueryHistoryResponse` |
| `backend/memory/conversation_store.py` | Add 1 method | `load_user_history(user_sub, search, turn_types, dataset_id, limit, offset)` → `(total, turns)` |
| `backend/app/services/memory_service.py` | Add 1 method | `get_history(user_sub, ...)` → `QueryHistoryResponse` |
| `backend/app/api/routes/memory.py` | Add 1 route | `GET /memory/history` with query params: `search`, `turn_types[]`, `dataset_id`, `limit`, `offset` |

No new schema files, no new services, no new storage volumes, no new tables.

---

## Frontend changes required

### New API file

| File | Purpose |
|---|---|
| `src/lib/api/memory.ts` | `getQueryHistory(params)`, `getSessionContext(id)`, `clearSession(id)` |

### Types additions (in `src/lib/api/types.ts`)

```typescript
export interface HistoryTurn {
  turn_id: string;
  session_id: string;
  created_at: string;
  turn_type: string;
  dataset_id: string | null;
  question: string | null;
  answer: string | null;
}

export interface QueryHistoryResponse {
  total: number;
  turns: HistoryTurn[];
}
```

### New files (2)

| File | Purpose |
|---|---|
| `src/components/history/HistoryWorkspace.tsx` | Full history UI: search, filter chips, paginated list, re-run panel |
| `src/app/history/page.tsx` | Server component wrapper |

### Modified files (1)

| File | Change |
|---|---|
| `src/components/layout/Sidebar.tsx` | Add `History` icon + `/history` nav item under "Analysis" group |

### Existing API functions reused for re-run (no changes)

| Function | Used when |
|---|---|
| `askQuestion` (chart.ts) | Re-run a `query` or `chart` turn |
| `runForecast` (forecast.ts) | Re-run a `forecast` turn |

---

## Data flow

```
User visits /history
    │
    ▼
GET /api/v1/memory/history?limit=50&offset=0
    │   SELECT turn_id, session_id, created_at, turn_type, dataset_id,
    │          question, answer
    │   FROM conversation_turns
    │   WHERE user_sub = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    │
    └─ Returns HistoryTurn[] (lightweight — no chart_spec or table_data)

User types in search box (300ms debounce)
    │
    ▼
GET /memory/history?search=revenue&...
    │   WHERE ... AND question LIKE '%revenue%'

User clicks "Re-run" on a query/chart turn
    │
    ▼
POST /api/v1/chart { dataset_id, question }
    └─ Shows new answer + optional chart inline below the history item

User clicks "Re-run" on a forecast turn
    │
    ▼
POST /api/v1/forecast { dataset_id, question }
    └─ Shows new answer inline
```

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| User has no history yet | None | Empty state message shown |
| SQLite LIKE scan on large history | Low | `idx_conv_user_created` on `user_sub` — SQLite scans only the user's rows |
| Heavy JSON columns (chart_spec, table_data) slow list | None | History query SELECTs only lightweight columns (turn_id, session_id, created_at, turn_type, dataset_id, question, answer) |
| Re-run on deleted dataset | Low | API returns 404 — shown as error message inline |
| Route `/memory/history` conflicts with existing `/memory/context` | None | Different path segments, no conflict |

---

## No-duplicate guarantee

`conversation_turns` already stores every query turn written by query.py, chart.py, forecast.py, etc. The history feature adds only a new **read path** into the same table. No parallel storage, no mirroring, no second table.

---

## Implementation order

1. `backend/app/schemas/memory.py` — add types
2. `backend/memory/conversation_store.py` — add `load_user_history`
3. `backend/app/services/memory_service.py` — add `get_history`
4. `backend/app/api/routes/memory.py` — add route
5. `frontend-next/src/lib/api/types.ts` — add frontend types
6. `frontend-next/src/lib/api/memory.ts` — new API file
7. `frontend-next/src/components/history/HistoryWorkspace.tsx` — new component
8. `frontend-next/src/app/history/page.tsx` — page wrapper
9. `frontend-next/src/components/layout/Sidebar.tsx` — nav item
