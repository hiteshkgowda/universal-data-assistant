# Autonomous Dataset Analysis — Architecture
**Status:** Awaiting approval
**Author:** Principal AI Engineer
**Date:** 2026-06-14
**Branch target:** `fresh-deploy` (builds on top of dashboard feature)

---

## 0. Scope and Constraints

This document proposes the architecture for a fully automated dataset analysis
pipeline that triggers without any user question. Every constraint from the
project is carried forward:

**Security constraints (never relaxed):**
- No `eval()` anywhere in the new code
- No raw LLM-generated SQL
- No LLM output reaches chart specs, column selection, or data aggregation
- All results scoped by `owner_sub` (JWT sub) — results are never cross-user
- No LLM output used to construct pandas operations — only string fields
- No destructive operations

**Lead Architect rules:**
- Do NOT add new features beyond what is specified
- Do NOT redesign the existing architecture
- Do NOT migrate databases
- Do NOT introduce breaking changes to existing routes or schemas
- Do NOT create new frameworks or base classes beyond what is needed

---

## 1. Problem Statement

Every existing analysis capability requires the user to navigate to a specific
sub-page and ask a question. Non-technical users face a blank screen and do not
know where to start.

The Autonomous Analysis pipeline eliminates the blank-screen problem by
automatically running the full analysis stack on any dataset and surfacing a
single coherent report, with zero user input required.

---

## 2. User Flow

```
User uploads a dataset
  └─ Upload completes (existing /upload/csv or /upload/excel)
       │
       ↓ User clicks "Full Analysis" from MetaPanel quick actions
       │  OR navigates to /datasets/{id}/analysis
       │
       ↓ Frontend auto-calls POST /api/v1/autonomous-analysis
       │  (with dataset_id from URL params)
       │
       ↓ Progress steps render in real-time (polling mode)
       │
       ↓ Results appear progressively as each stage completes
       │
       ↓ User sees:
           ┌─────────────────────────────────────────────────────┐
           │ 📊 Full Dataset Analysis — sales_q4.csv             │
           │ Quality Score: 84/100 ████████░░                    │
           ├─────────────────────────────────────────────────────┤
           │ Executive Summary (2 paragraphs)                     │
           ├─────────────────────────────────────────────────────┤
           │ Data Profile: 5,203 rows · 12 cols · 2.1% nulls    │
           ├─────────────────────────────────────────────────────┤
           │ Key Insights (5 bullets)                            │
           ├─────────────────────────────────────────────────────┤
           │ Anomalies Detected (3)  ↗ View full report          │
           ├─────────────────────────────────────────────────────┤
           │ Root Causes (2)         ↗ View full report          │
           ├─────────────────────────────────────────────────────┤
           │ Recommendations (8, ranked by priority)             │
           └─────────────────────────────────────────────────────┘
```

---

## 3. System Architecture

```
Browser: /datasets/{id}/analysis
  └─ AutonomousAnalysisWorkspace.tsx  (Client Component)
       │  1. GET /api/v1/autonomous-analysis/{dataset_id}  → cached? → render
       │  2. If no cache: POST /api/v1/autonomous-analysis → run pipeline → render
       │
       │  Renders: QualityGauge | ExecutiveSummary | DataProfile
       │           Insights | Anomalies | RootCauses | Recommendations
       ▼

FastAPI Backend  (/api/v1/autonomous-analysis)
  └─ AutonomousAnalysisRouter
       │
       ├─ AutonomousAnalysisStore        ← NEW (filesystem JSON, mirrors DashboardStore)
       │    analysis/{dataset_id}.json
       │
       └─ AutonomousAnalysisService      ← NEW orchestrator
            │
            │  STEP 1 ──  DataProfiler                  ← NEW, deterministic
            │  STEP 2 ──  DataQualityEngine              ← NEW, deterministic
            │  STEP 3 ──  (from InsightStatEngine)       ← reuse existing
            │  STEP 4 ──  InsightGenerationService       ← reuse existing (no LLM needed)
            │  STEP 5 ──  AnomalyDetectionService        ← reuse existing
            │  STEP 6 ──  RootCauseService               ← reuse existing
            │  STEP 7 ──  RecommendationService          ← reuse existing
            │  STEP 8 ──  _generate_executive_summary()  ← NEW LLM call (short, fallback)
            │
            └─ Writes AutonomousAnalysisResult to analysis/{dataset_id}.json
```

---

## 4. Pipeline Step Definitions

### Step 1 — Data Profiling (`DataProfiler`)
**Type:** Deterministic (pure pandas)
**Input:** `pd.DataFrame`, `DatasetMetadata`
**Output:** `DataProfile`

```
For every column:
  - dtype (inferred from pandas)
  - null_count, null_ratio
  - unique_count, unique_ratio
  - is_numeric flag
  - min / max / mean (numeric only)

Dataset-level:
  - row_count, column_count
  - numeric_column_count, categorical_column_count
  - total_null_cells, overall_null_ratio
  - duplicate_row_count (df.duplicated().sum())
```

No LLM. Runs in < 20ms on datasets up to 50K rows.

### Step 2 — Quality Assessment (`DataQualityEngine`)
**Type:** Deterministic
**Input:** `DataProfile`
**Output:** `quality_score: int` (0-100) + `quality_findings: list[str]`

```
completeness_pts  = round((1.0 - profile.overall_null_ratio) * 25)        # 0-25
consistency_pts   = round((1.0 - profile.duplicate_ratio) * 25)            # 0-25
volume_pts        = min(25, int(profile.row_count / 20))                    # 0-25 (500+ rows → full)
richness_pts      = round(min(profile.numeric_column_count / 5.0, 1.0)*25) # 0-25 (5+ numeric → full)

quality_score     = completeness_pts + consistency_pts + volume_pts + richness_pts  # 0-100
quality_findings  = rule-based strings from each component
```

### Step 3 — Trend Detection
**Type:** Deterministic
**Method:** Reuse `InsightStatEngine._detect_trends()` directly (not via network call)
**Output:** `list[TrendInfo]` — used in Step 8 executive summary

This reuses the existing `InsightStatEngine` code that is already imported in
`insight_service.py`. We instantiate `InsightStatEngine` directly in
`AutonomousAnalysisService.__init__` without going through HTTP.

### Step 4 — Insight Generation
**Type:** LLM-backed, with deterministic fallback
**Method:** Call `InsightGenerationService.generate()` directly
**Input:** `dataset_id`, `question="Automatically analyse this dataset"`, `table_data=df.head(1000).to_dict("records")`
**Output:** `InsightResponse` — reuse existing schema

This is a direct service-to-service call (no HTTP). The existing TTL cache in
`InsightGenerationService` ensures repeated runs are near-instant.

### Step 5 — Anomaly Detection
**Type:** Deterministic (4 statistical methods), no LLM
**Method:** Call `AnomalyDetectionService.detect()` directly
**Input:** `df`, `{"dataset_id": ..., "methods": ["zscore", "iqr", "isolation_forest"]}`
**Output:** `AnomalyResponse` — reuse existing schema

### Step 6 — Root Cause Analysis
**Type:** Deterministic engine + optional LLM reasoning
**Method:** Call `RootCauseService.analyze()` directly
**Input:** Auto-constructed `RootCauseRequest`:
  - `dataset_id` from the upload
  - `question` auto-constructed: `"Why did {top_metric_col} change?"` (metric col = highest-scoring column from Step 1)
  - `metric_column` / `period_column` / `current_period` / `previous_period`: all `None` (auto-detected by RCAEngine)
**Output:** `RootCauseResponse` — reuse existing schema

### Step 7 — Recommendation Generation
**Type:** Rule-engine + optional LLM enhancement
**Method:** Call `RecommendationService.generate()` directly
**Input:** `RecommendationRequest` constructed from Steps 4+5 outputs:
  - `dataset_id` — from upload
  - `anomalies` — `AnomalyResponse` from Step 5
  - `insights` — `InsightResponse` from Step 4
  - `forecast` — `None` (no forecast in autonomous pipeline)
  - `context` — `f"Autonomous analysis of {filename}"`
  - `llm_enhance` — `True`
**Output:** `RecommendationResponse` — reuse existing schema

### Step 8 — Executive Summary Generation
**Type:** Optional LLM call, with deterministic fallback
**Input:** Condensed findings from all previous steps
**Output:** `executive_summary: str` (2 paragraphs)

**LLM prompt (max 512 tokens input):**
```
System: "You are a data analysis executive. Write a 2-paragraph executive summary
         from the facts below. Reference ONLY these numbers. Do not invent data.
         First paragraph: dataset overview + quality assessment.
         Second paragraph: top findings + highest-priority action."

User: "Dataset: {filename} | Rows: {row_count} | Columns: {col_count}
       Quality Score: {quality_score}/100
       Top 3 insights: {insight_bullets}
       Anomalies: {anomaly_count} detected (worst: {severity})
       Top recommendation: {top_rec_action} (priority: {priority})"
```

**Deterministic fallback:**
```python
def _fallback_summary(profile, quality_score, insights, anomalies, recs) -> str:
    lines = [
        f"Dataset '{profile.filename}' contains {profile.row_count:,} rows and "
        f"{profile.column_count} columns with a data quality score of {quality_score}/100. "
        f"Overall null rate is {profile.overall_null_ratio:.1%} with "
        f"{profile.duplicate_row_count} duplicate row(s) detected.",
        "",
        f"Analysis identified {len(insights)} key insights, "
        f"{sum(a.anomaly_count for a in anomalies)} data anomalies, and "
        f"{len(recs)} actionable recommendations. "
        + (f"Top recommendation: {recs[0].action}." if recs else "No high-priority issues found."),
    ]
    return "\n".join(lines)
```

---

## 5. New Schemas (`backend/app/schemas/autonomous_analysis.py`)

```python
class DataQualityColumn(BaseModel):
    name: str
    dtype: str
    null_count: int
    null_ratio: float       # 0.0–1.0
    unique_count: int
    unique_ratio: float     # 0.0–1.0
    is_numeric: bool
    min_value: Optional[float]
    max_value: Optional[float]
    mean_value: Optional[float]

class DataProfile(BaseModel):
    row_count: int
    column_count: int
    numeric_column_count: int
    categorical_column_count: int
    total_null_cells: int
    overall_null_ratio: float
    duplicate_row_count: int
    columns: list[DataQualityColumn]

class PipelineStep(BaseModel):
    name: str               # "Data Profiling" | "Trend Detection" | etc.
    status: str             # "pending" | "complete" | "failed" | "skipped"
    duration_ms: float
    note: Optional[str]     # Brief note, e.g. "5 numeric columns profiled"

class AnalysisAnomaly(BaseModel):
    """Simplified anomaly summary for the unified response."""
    column: str
    anomaly_count: int
    severity: str           # worst severity across all anomaly points
    description: str        # rule-based phrase, e.g. "3 above-normal spikes detected"

class AnalysisRootCause(BaseModel):
    """Simplified root-cause factor for the unified response."""
    metric_column: str
    dimension: str
    value: str
    contribution_pct: float
    direction: str          # "increase" | "decrease"
    description: str

class AnalysisRecommendation(BaseModel):
    """Flattened recommendation for the unified response."""
    priority: str           # "critical" | "high" | "medium" | "low"
    action: str
    reason: str
    category: str
    confidence: float

class AutonomousAnalysisResult(BaseModel):
    dataset_id: str
    owner_sub: str
    dataset_name: str       # filename
    executive_summary: str
    quality_score: int      # 0–100
    data_profile: DataProfile
    insights: list[str]     # key_insights from InsightResponse
    anomalies: list[AnalysisAnomaly]
    root_causes: list[AnalysisRootCause]
    recommendations: list[AnalysisRecommendation]
    pipeline_steps: list[PipelineStep]
    analysis_time_ms: float
    cache_hit: bool
    analysed_at: datetime

class AutonomousAnalysisRequest(BaseModel):
    dataset_id: str

class AutonomousAnalysisSummary(BaseModel):
    dataset_id: str
    dataset_name: str
    quality_score: int
    analysed_at: datetime
    recommendation_count: int
    anomaly_count: int
```

---

## 6. Service Architecture (`backend/app/services/autonomous_analysis.py`)

```
AutonomousAnalysisService
  ├─ __init__(dataset_svc, insight_svc, anomaly_svc, rca_svc, rec_svc, settings, ...)
  ├─ set_client(client)    ← same pattern as all other services
  ├─ _stat_engine          ← InsightStatEngine() instance (for trend detection)
  ├─ _profiler             ← DataProfiler()
  ├─ _quality_engine       ← DataQualityEngine()
  └─ _cache: TTLCache[str, AutonomousAnalysisResult]

async def run(dataset_id, owner_sub) -> AutonomousAnalysisResult:
  1. cache_key = sha256(dataset_id | owner_sub)
  2. if cached: return cached.copy(cache_hit=True)
  3. df, meta = await run_in_threadpool(dataset_svc.load_dataframe, dataset_id)
  4. profile = _profiler.profile(df, meta)             # ~20ms
  5. quality_score, findings = _quality_engine.assess(profile) # ~2ms
  6. trends = _stat_engine._detect_trends(df, numeric_cols) # ~30ms
  7. insights = await insight_svc.generate(              # ~200ms (cached)
       dataset_id, "Automatically analyse this dataset",
       df.head(1000).to_dict("records"))
  8. anomalies = await run_in_threadpool(               # ~300ms (cached)
       anomaly_svc.detect, df,
       {"dataset_id": ..., "methods": ["zscore","iqr","isolation_forest"]})
  9. top_metric = _pick_top_metric(df)
 10. rca = await rca_svc.analyze(                       # ~200ms (cached)
       dataset_id, f"Why did {top_metric} change?",
       metric_column=None, period_column=None)
 11. recs = await rec_svc.generate(RecommendationRequest(
       dataset_id=..., anomalies=anomalies, insights=insights,
       context=f"Autonomous analysis of {meta.filename}", llm_enhance=True))
 12. executive_summary = await _generate_executive_summary(...)  # ~1s (cached)
 13. result = AutonomousAnalysisResult(...)
 14. _cache.put(cache_key, result)
 15. store.save(result)                                # fire-and-forget
 16. return result
```

**Key invariants:**
- Steps 4–6 are CPU-bound → `run_in_threadpool`
- Steps 7–11 call existing services directly (not via HTTP) → no network overhead
- Steps 7–11 hit existing TTL caches if dataset was previously analysed
- Step 12 (LLM summary) has a fast deterministic fallback
- The entire pipeline is bounded at `max(LLM timeout, 60s)`
- `set_client()` is called in lifespan, injected into `_insight_svc._agent`,
  `_rca_svc._agent`, `_rec_svc._agent` — these are already wired. No duplicate wiring needed.

---

## 7. Storage (`AutonomousAnalysisStore`)

**Location:** `analysis/{dataset_id}.json` (one file per dataset, last result only)

Unlike `DashboardStore` (which can have many dashboards per dataset), analysis
results are keyed by `dataset_id` — each dataset has one live analysis at a time.
Re-running replaces the file atomically.

```python
class AutonomousAnalysisStore:
    def __init__(self, analysis_dir: Path) -> None:
        self._dir = analysis_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    def save(self, result: AutonomousAnalysisResult) -> None:
        path = self._dir / f"{result.dataset_id}.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(result.model_dump_json(), encoding="utf-8")
        tmp.rename(path)  # atomic-ish

    def get(self, dataset_id: str, owner_sub: str) -> Optional[AutonomousAnalysisResult]:
        path = self._dir / f"{dataset_id}.json"
        if not path.exists():
            return None
        result = AutonomousAnalysisResult.model_validate_json(path.read_text())
        if result.owner_sub != owner_sub:
            return None
        return result

    def delete(self, dataset_id: str, owner_sub: str) -> bool:
        path = self._dir / f"{dataset_id}.json"
        if path.exists():
            result = AutonomousAnalysisResult.model_validate_json(path.read_text())
            if result.owner_sub == owner_sub:
                path.unlink()
                return True
        return False
```

---

## 8. API Specification (`backend/app/api/routes/autonomous_analysis.py`)

### `POST /api/v1/autonomous-analysis`

Trigger the 8-step pipeline. Returns the full `AutonomousAnalysisResult`.
If the result is cached in memory or on disk, returns it immediately.

**Request:**
```json
{ "dataset_id": "abc123..." }
```

**Response:** `AutonomousAnalysisResult` (full schema)

**Auth:** Bearer JWT required. Ownership check on dataset.
**Timeout:** 90s (covers all LLM calls in chain)
**Cache:** In-memory TTL 300s + filesystem persistence

---

### `GET /api/v1/autonomous-analysis/{dataset_id}`

Retrieve a previously stored analysis result from disk.
Used by the frontend on first load to check for an existing result before
triggering a full re-run.

**Response:** `AutonomousAnalysisResult` or HTTP 404 if none exists yet.
**Auth:** Bearer JWT + owner check (404 if not owner).

---

### `DELETE /api/v1/autonomous-analysis/{dataset_id}`

Delete stored analysis result to force a fresh re-run on the next POST.

**Response:** `{ "message": "Analysis cleared." }`
**Auth:** Bearer JWT + owner check.

---

## 9. Configuration Changes

### `backend/app/core/config.py`

```python
# In _STORAGE_FIELDS tuple — add:
"analysis_dir",

# In Settings class — add:
analysis_dir: Path = Path("analysis")

# Cache settings
autonomous_analysis_cache_ttl_seconds: float = 600.0   # 10 min (pipeline is slow)
autonomous_analysis_cache_max_entries: int = 20
```

### `backend/app/core/storage.py`

```python
# In __init__ self._volumes list — add:
("analysis", settings.analysis_dir),
```

### `backend/app/core/exceptions.py`

```python
class AutonomousAnalysisError(DataAssistantError):
    """Raised when the autonomous analysis pipeline encounters an unrecoverable error."""
```

---

## 10. Dependency Injection (`backend/app/api/dependencies.py`)

```python
@lru_cache(maxsize=1)
def get_autonomous_analysis_service() -> AutonomousAnalysisService:
    from app.services.autonomous_analysis import AutonomousAnalysisService  # noqa
    from app.services.autonomous_analysis import AutonomousAnalysisStore    # noqa

    settings = get_settings()
    store = AutonomousAnalysisStore(settings.analysis_dir)
    svc = AutonomousAnalysisService(
        dataset_service=get_dataset_service(),
        insight_service=get_insight_service(),
        anomaly_service=get_anomaly_service(),
        rca_service=get_root_cause_service(),
        rec_service=get_recommendation_service(),
        settings=settings,
        store=store,
        cache_ttl=settings.autonomous_analysis_cache_ttl_seconds,
        cache_max_entries=settings.autonomous_analysis_cache_max_entries,
    )
    return svc
```

**Note:** `AutonomousAnalysisService` does NOT need its own `set_client()` call in
`main.py`. It delegates all LLM calls to existing services that are already
wired in lifespan. The `insight_svc`, `rca_svc`, and `rec_svc` injected into
the constructor already have their `_client` set by the time the first request
arrives.

---

## 11. Lifespan Changes (`backend/app/main.py`)

```python
# Add to route imports:
from app.api.routes import autonomous_analysis

# Add to dependency imports:
from app.api.dependencies import get_autonomous_analysis_service

# Add to create_app() router registration:
app.include_router(autonomous_analysis.router, prefix=API_PREFIX)

# No lifespan changes needed — existing client wiring covers all sub-services.
# Call get_autonomous_analysis_service() once at startup to warm the lru_cache:
_ = get_autonomous_analysis_service()
```

---

## 12. Frontend Architecture

### 12.1 API Client (`frontend-next/src/lib/api/autonomous-analysis.ts`)

```typescript
export async function runAutonomousAnalysis(dataset_id: string)
  : Promise<AutonomousAnalysisResult>

export async function getAnalysisResult(dataset_id: string)
  : Promise<AutonomousAnalysisResult>

export async function deleteAnalysisResult(dataset_id: string)
  : Promise<void>
```

### 12.2 TypeScript types (`frontend-next/src/lib/api/types.ts` — append)

Mirrors the Python schema (snake_case):
```typescript
interface DataQualityColumn { name, dtype, null_count, null_ratio,
  unique_count, unique_ratio, is_numeric, min_value, max_value, mean_value }
interface DataProfile { row_count, column_count, numeric_column_count,
  categorical_column_count, total_null_cells, overall_null_ratio,
  duplicate_row_count, columns: DataQualityColumn[] }
interface PipelineStep { name, status, duration_ms, note }
interface AnalysisAnomaly { column, anomaly_count, severity, description }
interface AnalysisRootCause { metric_column, dimension, value,
  contribution_pct, direction, description }
interface AnalysisRecommendation { priority, action, reason, category, confidence }
interface AutonomousAnalysisResult {
  dataset_id, owner_sub, dataset_name, executive_summary, quality_score,
  data_profile: DataProfile, insights: string[], anomalies: AnalysisAnomaly[],
  root_causes: AnalysisRootCause[], recommendations: AnalysisRecommendation[],
  pipeline_steps: PipelineStep[], analysis_time_ms, cache_hit, analysed_at }
```

### 12.3 Workspace Component (`AutonomousAnalysisWorkspace.tsx`)

**State machine:**
```
idle
  ↓ mount → try GET (load from cache)
  ├─ cache hit → "ready" (render cached result)
  └─ cache miss → auto-call POST (run pipeline)
       ↓ "running" (show 8-step progress indicator)
       ↓ POST returns
       └─ "ready" (render results)
```

**Layout structure:**
```
<AppShell mainClassName="overflow-hidden p-0">
  ─── Header ─────────────────────────────────────────────────────
  ArrowLeft (→ dataset)  |  Activity icon  |  "Full Analysis"
  [Re-run Analysis] button (small, secondary)  |  timestamp

  ─── Loading state (while "running") ───────────────────────────
  8-step pipeline indicator:
    ① Data Profiling        ✓ complete  (12 ms)
    ② Quality Assessment    ✓ complete  (3 ms)
    ③ Trend Detection       ✓ complete  (45 ms)
    ④ Insight Generation    ⟳ running…
    ⑤ Anomaly Detection     ○ pending
    ⑥ Root Cause Analysis   ○ pending
    ⑦ Recommendations       ○ pending
    ⑧ Executive Summary     ○ pending

  ─── Results (when ready) ───────────────────────────────────────
  ┌─ Quality Score ──────────────────────────────────────────────┐
  │  Circular gauge: 84/100   completeness 25/25  richness 21/25 │
  │                           consistency 23/25   volume 15/25   │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Executive Summary ──────────────────────────────────────────┐
  │  (2-paragraph text, rendered with subtle emphasis on numbers) │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Data Profile ───────────────────────────────────────────────┐
  │  row_count | col_count | null_ratio | duplicate_count         │
  │  Column table: name | type | nulls | unique | min/max        │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Key Insights ───────────────────────────────────────────────┐
  │  Numbered list of insight strings (from InsightResponse)      │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Anomalies ──────────────────────────────────────────────────┐
  │  {count} anomalies detected across {n} columns               │
  │  Per-column rows: severity badge | column | count | desc     │
  │  [View Full Anomaly Report →]                                 │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Root Causes ────────────────────────────────────────────────┐
  │  Top contributing factors for {metric_column}                │
  │  Factor rows: dimension:value | contribution% | direction    │
  │  [View Full RCA Report →]                                    │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Recommendations ────────────────────────────────────────────┐
  │  {count} prioritised actions                                 │
  │  Critical (red badge) | High | Medium | Low                  │
  │  Per-rec: priority | action | reason | category              │
  └──────────────────────────────────────────────────────────────┘
</AppShell>
```

### 12.4 Page (`frontend-next/src/app/datasets/[id]/analysis/page.tsx`)

Server component, identical pattern to `insights/page.tsx`:
```tsx
export default async function AnalysisPage({ params }) {
  const { id } = await params;
  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <AutonomousAnalysisWorkspace datasetId={id} />
    </AppShell>
  );
}
```

### 12.5 MetaPanel edit

Add "Full Analysis" as the **first** quick action (makes it the entry point
for zero-configuration users):
```tsx
{
  href: `/datasets/${dataset.id}/analysis`,
  icon: Activity,   // from lucide-react
  label: "Full Analysis",
}
```

### 12.6 Topbar edit

```typescript
if (pathname.includes("/analysis")) return "Full Analysis";
```

---

## 13. Complete File List

### Backend — new files

| File | Type | Description |
|---|---|---|
| `backend/app/schemas/autonomous_analysis.py` | NEW | Pydantic models (DataProfile, AutonomousAnalysisResult, etc.) |
| `backend/app/services/autonomous_analysis.py` | NEW | DataProfiler, DataQualityEngine, AutonomousAnalysisStore, AutonomousAnalysisService |
| `backend/app/api/routes/autonomous_analysis.py` | NEW | POST, GET, DELETE endpoints |
| `backend/tests/test_autonomous_analysis.py` | NEW | 20-test suite |

### Backend — modified files

| File | Change |
|---|---|
| `backend/app/core/config.py` | Add `analysis_dir`, `autonomous_analysis_cache_*` |
| `backend/app/core/storage.py` | Add `("analysis", settings.analysis_dir)` volume |
| `backend/app/core/exceptions.py` | Add `AutonomousAnalysisError` |
| `backend/app/api/dependencies.py` | Add `get_autonomous_analysis_service()` |
| `backend/app/main.py` | Router registration + startup warm-up |

### Frontend — new files

| File | Type | Description |
|---|---|---|
| `frontend-next/src/lib/api/autonomous-analysis.ts` | NEW | API client functions |
| `frontend-next/src/components/analysis/AutonomousAnalysisWorkspace.tsx` | NEW | Full workspace UI |
| `frontend-next/src/app/datasets/[id]/analysis/page.tsx` | NEW | Next.js page |

### Frontend — modified files

| File | Change |
|---|---|
| `frontend-next/src/lib/api/types.ts` | Append TypeScript interfaces |
| `frontend-next/src/components/datasets/MetaPanel.tsx` | Add "Full Analysis" quick action |
| `frontend-next/src/components/layout/Topbar.tsx` | Add "Full Analysis" page title |

**Total: 7 new files, 8 modified files.**

---

## 14. Test Plan (`backend/tests/test_autonomous_analysis.py`)

| Class | Tests | Coverage |
|---|---|---|
| `TestDataProfiler` | 4 | column dtype inference, null ratio, unique ratio, duplicate detection |
| `TestDataQualityEngine` | 3 | perfect score, empty dataset, partial quality |
| `TestAutonomousAnalysisStore` | 3 | save/get roundtrip, owner isolation, missing returns None |
| `TestPipelineOrchestration` | 5 | happy path, empty df, missing metric col, LLM failure fallback, cache hit |
| `TestHTTPEndpoints` | 5 | POST → 200, GET cached → 200, GET missing → 404, GET wrong owner → 404, DELETE → 200 |

---

## 15. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Pipeline total latency exceeds 90s | Low | Each sub-service has its own TTL cache; second run is typically <2s |
| LLM summary call fails | Low | Deterministic `_fallback_summary()` always produces a valid string |
| Large dataset (100K rows) causes OOM | Low | Sample cap: `df.head(5000)` before passing to all engines |
| RCA can't find a metric column | Low | `_pick_top_metric()` uses KPI keyword scoring; falls back to first numeric col; if no numerics, RCA step is `"skipped"` |
| Insight service requires `table_data` (list of dicts) | OK | `df.head(1000).to_dict("records")` converts cleanly |
| `analysis/{dataset_id}.json` conflicts with future schema changes | Low | Store `schema_version: "1.0"` in result; skip stale files |
| Two concurrent requests for same dataset race | Low | `run_in_threadpool` on profiler + atomic `.tmp` rename on store |

---

## 16. What Is NOT in Scope

- Real-time streaming progress (WebSocket / SSE) — the workspace polls via `GET` instead
- Scheduled background re-analysis (cron) — manual trigger only
- Multi-dataset comparative analysis
- Analysis history (only the latest result per dataset is kept)
- Forecast integration (no `/forecast` call in the pipeline)
- PDF export of the analysis report

---

## 17. Execution Order (if approved)

```
1.  backend/app/schemas/autonomous_analysis.py        (no deps)
2.  backend/app/core/config.py                        (add analysis_dir + cache fields)
3.  backend/app/core/storage.py                       (add analysis volume)
4.  backend/app/core/exceptions.py                    (add AutonomousAnalysisError)
5.  backend/app/services/autonomous_analysis.py       (DataProfiler + DataQualityEngine +
                                                       AutonomousAnalysisStore +
                                                       AutonomousAnalysisService)
6.  backend/app/api/routes/autonomous_analysis.py     (3 endpoints)
7.  backend/app/api/dependencies.py                   (get_autonomous_analysis_service)
8.  backend/app/main.py                               (router + startup warm-up)
9.  backend/tests/test_autonomous_analysis.py         (20 tests)
10. frontend-next/src/lib/api/types.ts                (append TypeScript types)
11. frontend-next/src/lib/api/autonomous-analysis.ts  (API client)
12. frontend-next/src/components/analysis/
    AutonomousAnalysisWorkspace.tsx                   (workspace UI)
13. frontend-next/src/app/datasets/[id]/analysis/
    page.tsx                                          (Next.js page)
14. frontend-next/src/components/datasets/MetaPanel.tsx (add quick action)
15. frontend-next/src/components/layout/Topbar.tsx    (add page title)
```

---

## 18. Open Questions

1. **Pipeline timeout:** Should the POST endpoint have a hard server-side 90s timeout,
   or rely on the client's timeout? Recommended: server-side 90s via
   `asyncio.wait_for(pipeline_coroutine, timeout=90.0)` in the route handler.

2. **Re-run behaviour:** Should clicking "Re-run Analysis" on the frontend clear the
   disk cache first (call DELETE then POST), or simply call POST which overwrites?
   Recommended: POST overwrites directly — no separate DELETE call needed.

3. **Empty analysis for table-backed datasets:** The pipeline calls
   `dataset_service.load_dataframe()` which already handles both file and DB-backed
   datasets. Both work identically. Recommended: support both.

4. **RCA auto-question generation:** The RCA step auto-constructs a question from the
   top metric column name. For a column named `revenue_usd` this produces
   `"Why did revenue_usd change?"`. Is this acceptable, or should we use the insight
   summary instead? Recommended: use column name (more explicit).

---

## Approval

To proceed with implementation, reply: **"Approved — begin implementation"**
or provide feedback on any of the open questions.

Do not start coding until this document is approved.
