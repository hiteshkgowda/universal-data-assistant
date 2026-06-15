# AI Executive Dashboard Generator — Architecture
**Status:** Awaiting approval
**Author:** Staff AI Engineer / BI Platform Architect
**Date:** 2026-06-14
**Branch target:** `fresh-deploy` (builds on top of stabilization-recovery)

---

## 0. Scope and Constraints

This document proposes the architecture for an AI Executive Dashboard Generator.
It **does not modify any existing route, service, or schema** beyond the minimal
additions required for wiring (config field, dependency factory, router
registration, storage volume). No existing features are changed.

**Security constraints (carried forward from stabilization):**
- No `eval()` anywhere
- No raw LLM-generated SQL
- No LLM-generated Plotly specs — all chart specs are built deterministically
- All dashboards scoped by `owner_sub` (JWT sub)
- No unsafe chart data sourced from LLM output

---

## 1. User Flow

```
User (on /datasets/:id/dashboard):

  Step 1 — Enter prompt: "Create a CEO Dashboard"
           ↓
  Step 2 — Backend analyses dataset (deterministic, ~200ms)
           ↓ KPI Selection Engine
           ↓ Chart Recommendation Engine
           ↓ Layout Recommendation Engine
           ↓ Dashboard Scoring Engine
           ↓ (Optional) LLM: dashboard name + narrative recommendations
           ↓
  Step 3 — Frontend receives DashboardConfig JSON
           ↓ Renders: KPI cards (animated) + Plotly charts + recommendations
           ↓
  Step 4 — User optionally edits title
           ↓
  Step 5 — User clicks "Save Dashboard"
           → POST /api/v1/dashboards/save
           → Persisted as dashboards/{id}.json
```

**Full JSON output contract:**

```json
{
  "dashboard_id": "a3f2c1...",
  "dashboard_name": "CEO Revenue Dashboard — Q4 2025",
  "dataset_id": "b9e1f4...",
  "kpis": [
    {
      "id": "kpi_0",
      "label": "Total Revenue",
      "column": "revenue",
      "aggregation": "sum",
      "value": 2450000.0,
      "formatted_value": "$2.45M",
      "change_pct": 12.3,
      "trend": "up"
    }
  ],
  "charts": [
    {
      "id": "chart_0",
      "title": "Revenue Over Time",
      "chart_type": "line",
      "x_field": "date",
      "y_field": "revenue",
      "chart_spec": { "...": "plotly figure JSON" },
      "width": "half"
    }
  ],
  "layout": {
    "kpi_row": ["kpi_0", "kpi_1", "kpi_2", "kpi_3"],
    "rows": [
      [{"id": "chart_0", "width": "half"}, {"id": "chart_1", "width": "half"}],
      [{"id": "chart_2", "width": "full"}]
    ]
  },
  "recommendations": [
    "Revenue is up 12% — investigate top driver categories.",
    "Customer count growth suggests acquisition is outpacing churn."
  ],
  "score": 84,
  "generation_time_ms": 1240.0,
  "cache_hit": false,
  "created_at": "2026-06-14T10:23:45Z",
  "owner_sub": "google-sub-abc"
}
```

---

## 2. System Architecture Diagram

```
Browser Tab
  └─ DashboardGeneratorWorkspace (Client Component)
       │  (prompt input + generate button)
       │
       │  POST /api/v1/dashboards/generate
       │  GET  /api/v1/dashboards/{id}
       │  POST /api/v1/dashboards/save
       ▼
FastAPI Backend  (/api/v1/dashboards/*)
  └─ DashboardRouter
       └─ DashboardGeneratorService
            │
            ├─ DatasetService.load_dataframe()       ← existing
            │   (loads the dataset into pandas)
            │
            ├─ KPISelectionEngine                    ← NEW, deterministic
            │   (scores numeric cols → top-N KPI metrics)
            │
            ├─ ChartRecommendationEngine             ← NEW, deterministic
            │   (col types + cardinality → chart type + Plotly spec)
            │   reuses ChartType enum (chart.py)
            │   reuses _build_figure logic (VisualizationService pattern)
            │
            ├─ LayoutRecommendationEngine            ← NEW, deterministic
            │   (arranges KPI + chart panels into a grid layout)
            │
            ├─ DashboardScoringEngine                ← NEW, deterministic
            │   (0–100 quality score)
            │
            └─ LLM (Groq/Ollama, optional)          ← name + recommendations only
                 (short prompt: column context + prompt → dashboard name)
                 (short prompt: KPI findings → 2-4 recommendation strings)

Storage
  └─ dashboards/{hex32}.json  ← DashboardConfig JSON (new volume)
```

---

## 3. Four Deterministic Engines

All four engines are pure pandas/numpy. No LLM output reaches any of them.
They are implemented as simple classes with a single public method.

### 3.1 KPI Selection Engine

**Input:** `pd.DataFrame`, column metadata (dtypes)
**Output:** `list[KPIMetric]` (up to 6)

**Algorithm (fully deterministic):**

```
for each numeric column:
  1. keyword_score = match column name against:
       HIGH (2pts): revenue, sales, profit, income, earnings, arr, mrr, gmv
       MED  (1pt):  users, customers, orders, count, total, amount, rate,
                    conversion, retention, churn, growth, cost, spend
       LOW  (0pt):  everything else

  2. variance_score = 1 if coefficient_of_variation > 0.01 else 0
     (filters out constant columns)

  3. null_penalty = -1 if null_ratio > 0.3 else 0

  4. total_score = keyword_score + variance_score + null_penalty

select top-6 columns by total_score (tie-break: column index order)

for each selected column:
  aggregation = "sum" if keyword_score >= 1 else "mean"
  current_value = df[col].agg(aggregation)
  trend_value = compute_change_pct(df, col)  ← (last 50% vs first 50% of rows)
  trend = "up" | "down" | "flat"
  formatted_value = auto_format(value)       ← $, %, K/M/B suffix
```

**No LLM call.** Runs in < 50ms on datasets up to 10K rows.

### 3.2 Chart Recommendation Engine

**Input:** `pd.DataFrame`, `list[KPIMetric]` (the selected KPIs)
**Output:** `list[ChartPanel]` (up to 6), each with a Plotly `chart_spec`

**Decision rules (deterministic, precedence order):**

| Condition | Chart type | X field | Y field |
|---|---|---|---|
| datetime col exists AND numeric col | `line` | datetime col | numeric col |
| string/object col with ≤ 20 unique values AND numeric col | `bar` | string col | numeric col |
| 2 numeric cols with no datetime/string | `scatter` | col_a | col_b |
| single numeric col | `bar` | DataFrame index (row number) | numeric col |

**One chart per KPI metric** (x-field chosen by the above rules applied to that
metric's column). Duplicate x/y pairs are deduplicated — at most one chart per
(x_field, y_field) combination.

**Plotly spec generation:** Mirror `VisualizationService._build_figure()` exactly.
The `_build_figure()` method in `dashboard_generator.py` is a private static method
that accepts `(df, chart_type, x_field, y_field) → dict`. It uses the same
`plotly.graph_objects` calls as the existing service — no new Plotly dependency,
no new chart library.

**Security:** The chart_spec is built server-side from validated column names
sourced from DatasetMetadata. No column name or value from the LLM is used.

### 3.3 Layout Recommendation Engine

**Input:** `list[KPIMetric]`, `list[ChartPanel]`
**Output:** `LayoutConfig`

**Algorithm:**

```
kpi_row = [kpi.id for kpi in kpis]          ← all KPIs across top row (4-col grid)

charts_remaining = charts[:]
rows = []
while charts_remaining:
  if len(charts_remaining) == 1:
    rows.append([{"id": chart.id, "width": "full"}])
    charts_remaining = []
  else:
    pair = charts_remaining[:2]
    rows.append([{"id": c.id, "width": "half"} for c in pair])
    charts_remaining = charts_remaining[2:]

return LayoutConfig(kpi_row=kpi_row, rows=rows)
```

Width semantics for frontend: `"half"` = `md:col-span-6`, `"full"` = `col-span-12`.

### 3.4 Dashboard Scoring Engine

**Input:** `list[KPIMetric]`, `list[ChartPanel]`, `pd.DataFrame`
**Output:** `int` (0–100)

```
kpi_score     = min(len(kpis), 5) * 5          # 0–25 pts
chart_score   = min(len(charts), 5) * 5        # 0–25 pts
coverage_pct  = len(kpis) / max(numeric_cols, 1)
coverage_score= int(min(coverage_pct, 1.0) * 25)  # 0–25 pts
data_quality  = row_quality_score(df)           # 0–25 pts
  where:
    row_pts  = 15 if rows >= 100 else (10 if rows >= 20 else 5)
    null_pts = 10 if mean_null_ratio < 0.05 else (5 if < 0.20 else 0)

score = kpi_score + chart_score + coverage_score + data_quality
```

---

## 4. LLM Usage (Optional, Lightweight)

The LLM is used for exactly **two** small tasks, both optional with deterministic
fallbacks. All data passed to the LLM is structured text derived from column
names and KPI values — no raw dataset rows, no user-originated SQL.

### 4.1 Dashboard Name Generation

**When:** Always attempted if GROQ_API_KEY or Ollama is available.
**Fallback:** `f"{prompt.title()} — {dataset_filename}"`

```
Prompt:
  System: "You are a dashboard naming assistant. Return only a concise
           dashboard title (max 8 words). No explanation."
  User:   "Dataset columns: {column_names_csv}
           User request: {prompt}
           Top KPIs: {kpi_labels_csv}"
```

### 4.2 Recommendations Generation

**When:** Always attempted.
**Fallback:** Rule-based strings from KPI trends (e.g., `"revenue is up 12%"`)

```
Prompt:
  System: "You are a BI analyst. Return 2-4 actionable insights as a
           JSON array of strings. Only reference facts from the KPI data.
           Do not invent metrics not present in the input."
  User:   "KPI findings: {kpi_findings_json}"
```

The LLM response is parsed as a `list[str]`. If parsing fails, the fallback
trend-based strings are used. No LLM output ever affects KPI values, chart
types, chart specs, or layout.

---

## 5. New Files — Complete List

### Backend (9 files)

| File | Type | Description |
|---|---|---|
| `backend/app/schemas/dashboard.py` | NEW | Pydantic models: `KPIMetric`, `ChartPanel`, `LayoutRow`, `LayoutConfig`, `DashboardConfig`, `DashboardMetadata`, `GenerateDashboardRequest`, `GenerateDashboardResponse`, `SaveDashboardRequest`, `SaveDashboardResponse`, `DashboardListResponse` |
| `backend/app/services/dashboard_generator.py` | NEW | `KPISelectionEngine`, `ChartRecommendationEngine`, `LayoutRecommendationEngine`, `DashboardScoringEngine`, `DashboardGeneratorService` |
| `backend/app/services/dashboard_store.py` | NEW | `DashboardStore` — filesystem CRUD for `dashboards/` directory |
| `backend/app/api/routes/dashboards.py` | NEW | 4 endpoints (generate, get, save, list) |
| `backend/tests/test_dashboard_generator.py` | NEW | 20-test suite covering all 4 engines + HTTP endpoints |
| `backend/app/core/config.py` | MODIFY | Add `dashboards_dir: Path = Path("dashboards")` field + `"dashboards_dir"` to `_STORAGE_FIELDS` tuple |
| `backend/app/core/storage.py` | MODIFY | Add `("dashboards", settings.dashboards_dir)` to `self._volumes` |
| `backend/app/api/dependencies.py` | MODIFY | Add `get_dashboard_service() -> DashboardGeneratorService` factory + `@lru_cache` |
| `backend/app/main.py` | MODIFY | `from app.api.routes import dashboards` + `app.include_router(dashboards.router, prefix=API_PREFIX)` |

### Frontend (6 files)

| File | Type | Description |
|---|---|---|
| `frontend-next/src/lib/api/dashboards.ts` | NEW | `generateDashboard()`, `getDashboard()`, `saveDashboard()`, `listDashboards()` |
| `frontend-next/src/lib/api/types.ts` | MODIFY | Append `DashboardKPI`, `DashboardChart`, `LayoutRow`, `DashboardLayout`, `DashboardConfig`, `GenerateDashboardRequest`, `GenerateDashboardResponse`, `SaveDashboardRequest`, `SaveDashboardResponse` |
| `frontend-next/src/components/dashboard/DashboardGeneratorWorkspace.tsx` | NEW | Full generator UI (prompt → generate → KPI cards + charts → save) |
| `frontend-next/src/app/datasets/[id]/dashboard/page.tsx` | NEW | Next.js App Router server component wrapping `DashboardGeneratorWorkspace` |
| `frontend-next/src/components/datasets/MetaPanel.tsx` | MODIFY | Add `LayoutDashboard` quick-action link to `/datasets/{id}/dashboard` |
| `frontend-next/src/components/layout/Topbar.tsx` | MODIFY | Extend `getPageTitle()` with `/dashboard` → `"Executive Dashboard"` |

---

## 6. API Specification

### `POST /api/v1/dashboards/generate`

Generate a dashboard config from a dataset and a natural-language prompt.

**Request:**
```json
{
  "dataset_id": "b9e1f4...",
  "prompt": "Create a CEO Dashboard",
  "max_kpis": 6,
  "max_charts": 6
}
```

**Response:** `DashboardGenerateResponse`
```json
{
  "dashboard_id": null,
  "dashboard_name": "CEO Revenue Dashboard — Q4 2025",
  "dataset_id": "b9e1f4...",
  "kpis": [...],
  "charts": [...],
  "layout": {...},
  "recommendations": [...],
  "score": 84,
  "generation_time_ms": 1240.0,
  "cache_hit": false
}
```

**Auth:** Bearer JWT required (same `get_current_user` dependency as all other routes)
**Timeout:** 60s (LLM name generation is a short call; deterministic path is < 200ms)
**Cache:** TTL 300s, keyed by `sha256(dataset_id | prompt | owner_sub)`

---

### `GET /api/v1/dashboards/{id}`

Retrieve a saved dashboard.

**Path param:** `id` — 32-char hex (HexId, same validation as dataset_id)
**Response:** `DashboardConfig` (full object from filesystem)
**Auth:** Bearer JWT + owner_sub check (404 if not owner)

---

### `POST /api/v1/dashboards/save`

Persist a generated dashboard to disk.

**Request:**
```json
{
  "dashboard_config": { "...": "the full DashboardConfig from /generate" },
  "dashboard_name": "CEO Revenue Dashboard"
}
```

**Response:** `SaveDashboardResponse`
```json
{
  "dashboard_id": "a3f2c1...",
  "dashboard_name": "CEO Revenue Dashboard",
  "created_at": "2026-06-14T10:23:45Z",
  "message": "Dashboard saved successfully."
}
```

**Auth:** Bearer JWT. `owner_sub` is stamped from JWT, never from request body.

---

### `GET /api/v1/dashboards`

List all saved dashboards for the current user.

**Response:** `DashboardListResponse`
```json
{
  "count": 3,
  "dashboards": [
    {
      "dashboard_id": "a3f2c1...",
      "dashboard_name": "CEO Revenue Dashboard",
      "dataset_id": "b9e1f4...",
      "score": 84,
      "created_at": "2026-06-14T10:23:45Z"
    }
  ]
}
```

---

## 7. Schema Definitions

### `backend/app/schemas/dashboard.py`

```python
class KPIMetric(BaseModel):
    id: str                          # "kpi_0", "kpi_1", ...
    label: str                       # human-readable column label
    column: str                      # source column name
    aggregation: str                 # "sum" | "mean" | "count" | "max" | "min"
    value: float
    formatted_value: str             # "$2.45M", "32%", "1,234"
    change_pct: Optional[float]      # % change (None if < 4 rows)
    trend: str                       # "up" | "down" | "flat"

class ChartPanel(BaseModel):
    id: str                          # "chart_0", "chart_1", ...
    title: str
    chart_type: str                  # "bar" | "line" | "pie" | "scatter"
    x_field: str
    y_field: str
    chart_spec: dict[str, Any]       # Plotly figure JSON (server-built)
    width: str                       # "half" | "full"

class LayoutCell(BaseModel):
    id: str                          # chart_id
    width: str                       # "half" | "full"

class LayoutConfig(BaseModel):
    kpi_row: list[str]               # list of kpi_ids
    rows: list[list[LayoutCell]]     # chart rows

class DashboardConfig(BaseModel):
    dashboard_id: Optional[str]
    dashboard_name: str
    dataset_id: str
    owner_sub: str
    kpis: list[KPIMetric]
    charts: list[ChartPanel]
    layout: LayoutConfig
    recommendations: list[str]
    score: int                       # 0–100
    generation_time_ms: float
    cache_hit: bool
    created_at: datetime

class DashboardMetadata(BaseModel):
    dashboard_id: str
    dashboard_name: str
    dataset_id: str
    score: int
    created_at: datetime

class GenerateDashboardRequest(BaseModel):
    dataset_id: str
    prompt: str = Field(default="Create an executive dashboard", max_length=500)
    max_kpis: int = Field(default=6, ge=1, le=10)
    max_charts: int = Field(default=6, ge=1, le=10)

class SaveDashboardRequest(BaseModel):
    dashboard_config: DashboardConfig
    dashboard_name: Optional[str]    # overrides dashboard_config.dashboard_name if set

class SaveDashboardResponse(BaseModel):
    dashboard_id: str
    dashboard_name: str
    created_at: datetime
    message: str

class DashboardListResponse(BaseModel):
    count: int
    dashboards: list[DashboardMetadata]
```

---

## 8. Service Architecture

### `DashboardGeneratorService`

```python
class DashboardGeneratorService:
    def __init__(
        self,
        dataset_service: DatasetService,
        settings: Settings,
        cache_ttl: float = 300.0,
        cache_max_entries: int = 30,
    ): ...

    async def generate(
        self,
        request: GenerateDashboardRequest,
        owner_sub: str,
    ) -> DashboardConfig:
        # 1. Cache check (sha256 key)
        # 2. Load dataset (DatasetService.load_dataframe)
        # 3. Run KPISelectionEngine.select(df, max_kpis)
        # 4. Run ChartRecommendationEngine.recommend(df, kpis, max_charts)
        # 5. Run LayoutRecommendationEngine.arrange(kpis, charts)
        # 6. Run DashboardScoringEngine.score(kpis, charts, df)
        # 7. LLM name + recommendations (try/except → fallback)
        # 8. Build DashboardConfig
        # 9. Cache result
        # 10. Return
```

### `DashboardStore`

```python
class DashboardStore:
    def __init__(self, dashboards_dir: Path): ...

    def save(self, config: DashboardConfig, owner_sub: str) -> DashboardMetadata:
        dashboard_id = secrets.token_hex(16)
        path = self._dashboards_dir / f"{dashboard_id}.json"
        path.write_text(config.model_dump_json())
        return DashboardMetadata(...)

    def get(self, dashboard_id: str, owner_sub: str) -> DashboardConfig:
        # Load JSON, verify owner_sub, return DashboardConfig
        # Raises DashboardNotFoundError (404) if missing or wrong owner

    def list_for_user(self, owner_sub: str) -> list[DashboardMetadata]:
        # Scan dashboards_dir/*.json, filter by owner_sub
        # Return sorted by created_at desc
```

---

## 9. Frontend Architecture

### `DashboardGeneratorWorkspace.tsx`

**State machine:**

```
idle
  ↓ user clicks "Generate"
generating (spinner + progress steps)
  ↓ POST /dashboards/generate returns
ready (KPI cards + charts rendered)
  ↓ user clicks "Save"
saving (button spinner)
  ↓ POST /dashboards/save returns
saved (success toast + dashboard_id URL param updated)
```

**Layout structure:**

```
<AppShell>
  ─── Header ─────────────────────────────────────────────────────
  ArrowLeft (→ dataset)  |  LayoutDashboard icon  |  "Executive Dashboard"
  Score badge  |  Cache badge  |  [Save Dashboard] button (disabled until ready)

  ─── Prompt bar ─────────────────────────────────────────────────
  TextArea: "Describe the dashboard you want..."
  [Generate Dashboard] button

  ─── KPI Row (4-column grid) ────────────────────────────────────
  {kpis.map(kpi => <KPICard ... />)}
  Skeleton × 4 while generating

  ─── Charts Grid (12-col) ───────────────────────────────────────
  {layout.rows.map(row =>
    row.map(cell =>
      cell.width === "half"
        ? <div className="md:col-span-6"> <ChartPanel /> </div>
        : <div className="col-span-12"> <ChartPanel /> </div>
    )
  )}
  Skeleton × 2 while generating

  ─── Recommendations ────────────────────────────────────────────
  {recommendations.map(r => <RecommendationItem />)}

  ─── Footer meta ────────────────────────────────────────────────
  Score gauge  |  Generation time  |  Dataset name
</AppShell>
```

**Chart rendering:** Reuse `<PlotlyChart spec={chart.chart_spec} />` from
`components/ask/PlotlyChart.tsx`. No new chart library introduced.

**KPI cards:** Use the existing `KpiCard` pattern from `Dashboard.tsx` adapted
with `change_pct` and trend arrows. The local component is defined inside
`DashboardGeneratorWorkspace.tsx` — no modification to `Dashboard.tsx`.

---

## 10. Storage Layout

```
dashboards/                             ← NEW volume (mirrors reports/)
├── a3f2c1d2e5f6....json               ← full DashboardConfig JSON
├── b9e1f4c7....json
└── ...
```

Storage is filesystem-based, consistent with all other persisted data in this
project (`reports/`, `connections/`, `uploads/`). The `dashboards_dir` field
follows the same `STORAGE_BASE_DIR` fan-out pattern as all other storage paths.

---

## 11. Configuration Changes

Two additions to `backend/app/core/config.py`:

```python
# In _STORAGE_FIELDS tuple (line 18):
_STORAGE_FIELDS: tuple[str, ...] = (
    ...
    "memory_store_dir",
    "dashboards_dir",          # ← ADD
)

# In Settings class:
dashboards_dir: Path = Path("dashboards")          # ← ADD

# Dashboard generator cache
dashboard_cache_ttl_seconds: float = 300.0         # ← ADD
dashboard_cache_max_entries: int = 30              # ← ADD
```

One addition to `backend/app/core/storage.py`:

```python
# In __init__ self._volumes list:
("dashboards", settings.dashboards_dir),           # ← ADD
```

---

## 12. Dependency Injection

One addition to `backend/app/api/dependencies.py`:

```python
@lru_cache(maxsize=1)
def get_dashboard_service() -> DashboardGeneratorService:
    from app.services.dashboard_store import DashboardStore   # noqa: PLC0415
    settings = get_settings()
    store = DashboardStore(settings.dashboards_dir)
    return DashboardGeneratorService(
        dataset_service=get_dataset_service(),
        settings=settings,
        store=store,
        cache_ttl=settings.dashboard_cache_ttl_seconds,
        cache_max_entries=settings.dashboard_cache_max_entries,
    )
```

---

## 13. Memory Integration

The `/dashboards/generate` route records a turn (fire-and-forget) of type
`TurnType.AGENT` so the conversational memory indicator shows dashboard
generation in the session history:

```python
asyncio.ensure_future(
    memory.record_turn(
        session_id=x_session_id,
        user_sub=current_user.sub,
        dataset_id=request.dataset_id,
        turn_type=TurnType.AGENT,
        question=request.prompt,
        answer=result.dashboard_name,
        metadata={"score": result.score, "kpi_count": len(result.kpis)},
    )
)
```

This follows the identical pattern used in all 8 existing memory-recording routes.

---

## 14. Test Plan

**`backend/tests/test_dashboard_generator.py`** — 20 tests:

| Class | Tests | Coverage |
|---|---|---|
| `TestKPISelectionEngine` | 5 | keyword scoring, variance filter, null penalty, top-N cap, empty DataFrame |
| `TestChartRecommendationEngine` | 5 | datetime→line, low-cardinality→bar, 2 numeric→scatter, fallback→bar, Plotly spec structure |
| `TestLayoutEngine` | 3 | single chart → full, two charts → half pair, odd count → last full |
| `TestScoringEngine` | 3 | perfect score, empty dataset, partial columns |
| `TestDashboardHTTP` | 4 | POST generate → 200, GET {id} → 200, GET wrong owner → 404, POST save → 200 |

---

## 15. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `DashboardStore` corrupts JSON on crash | Low | Atomic write pattern (write to `.tmp`, rename) |
| LLM name call fails | Low | `try/except` fallback to `f"{prompt.title()} — {filename}"` |
| LLM injects column names not in schema | N/A | LLM output is used only for `dashboard_name: str` and `recommendations: list[str]` — no column names, no chart types, no values from LLM |
| Large dataset OOMs during KPI engine | Low | Sample cap: `df.head(5000)` before passing to engines |
| Chart spec with 25K data points crashes Plotly | Low | Downsample to 500 points for scatter; 50 categories for bar |
| `DashboardConfig` grows too large for JSON | Low | `max_charts=10` limit; chart_spec capped at 500 data points |
| Filesystem listing is slow with 1000+ dashboards | Low | Acceptable at current scale; add index file if needed later |

---

## 16. What Is NOT In Scope

The following are explicitly excluded from this implementation:

- Dashboard sharing (no multi-user access)
- Dashboard versioning / history
- Scheduled dashboard refresh
- Custom chart colors or themes
- Drag-and-drop layout editor
- Dashboard export (PDF or image)
- Dashboard embedding (iframe/token)
- Database-backed dashboards (only file-based datasets for now; connection datasets are listed as a known gap)

---

## 17. Execution Order

If approved, implementation proceeds in this order to avoid import errors:

```
1. backend/app/schemas/dashboard.py          (no deps)
2. backend/app/core/config.py                (add dashboards_dir)
3. backend/app/core/storage.py               (needs config field from step 2)
4. backend/app/services/dashboard_store.py   (needs schema from step 1)
5. backend/app/services/dashboard_generator.py (needs schema, store, dataset_service)
6. backend/app/api/routes/dashboards.py      (needs service, schema)
7. backend/app/api/dependencies.py           (needs service from step 5)
8. backend/app/main.py                       (needs route from step 6)
9. backend/tests/test_dashboard_generator.py (needs all above)
10. frontend-next/src/lib/api/types.ts       (TypeScript types)
11. frontend-next/src/lib/api/dashboards.ts  (needs types from step 10)
12. frontend-next/src/components/dashboard/DashboardGeneratorWorkspace.tsx
13. frontend-next/src/app/datasets/[id]/dashboard/page.tsx
14. frontend-next/src/components/datasets/MetaPanel.tsx (add link)
15. frontend-next/src/components/layout/Topbar.tsx (add page title)
```

---

## 18. Open Questions for Approver

Before implementation starts, please confirm:

1. **Database-backed datasets:** Should `/dashboards/generate` support `DatasetSource.TABLE`
   (connection-backed datasets) or only file uploads? File uploads are straightforward.
   Table datasets go through `DatasetService.load_dataframe()` the same way — so both
   work identically at the service level. **Recommended: support both.**

2. **Max KPIs/charts default:** Architecture proposes `max_kpis=6, max_charts=6`.
   Should these be configurable by the user in the UI, or are they fixed?
   **Recommended: expose as UI controls (number inputs, range 1–10).**

3. **LLM for name/recommendations:** The architecture uses a single short LLM call
   for dashboard name and recommendations. If you want **fully deterministic output
   (no LLM)**, the fallbacks are already specified and I can remove the LLM call
   entirely. **Recommended: keep LLM for better names/recommendations.**

4. **Save vs. Auto-save:** Should the dashboard auto-save after generation, or
   only on explicit "Save" click? **Recommended: explicit save button** (consistent
   with reports workflow, avoids filesystem clutter from discarded generations).

---

## Approval

To proceed with implementation, reply: **"Approved — proceed with implementation"**
or provide feedback on any of the open questions above.

Do not start coding until this document is approved.
