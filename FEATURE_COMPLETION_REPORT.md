# Feature Completion Report
**Universal Data Assistant — Audit Date: 2026-06-13**
**Commit audited: `32b2b50b`**

> Evidence is cited as `file:line_range` or `file::function_name`.
> All percentages are engineering-completeness estimates (backend + frontend + integration),
> not feature-usefulness scores.

---

## Table of Contents

1. [Natural Language Query (NLQ)](#1-natural-language-query-nlq) — **75%**
2. [Anomaly Detection](#2-anomaly-detection) — **88%**
3. [Insight Generation](#3-insight-generation) — **68%**
4. [Root Cause Analysis (RCA)](#4-root-cause-analysis-rca) — **70%**
5. [Recommendation Engine](#5-recommendation-engine) — **83%**
6. [Forecasting](#6-forecasting) — **78%**
7. [Conversational Memory](#7-conversational-memory) — **65%**
8. [AI Agent Orchestration](#8-ai-agent-orchestration) — **80%**
9. [CRUD Operations](#9-crud-operations) — **90%**
10. [Report Generation](#10-report-generation) — **77%**

---

## 1. Natural Language Query (NLQ)

### What's Implemented ✅

**Backend pipeline** (`backend/app/services/analytics_service.py`)
- Full plan-and-execute pipeline: `analyze()` → `_parse_plan()` → `_validate_plan()` → `_run()` → `_execute()`
- **10 operations** deterministically dispatched via Pydantic-validated `QueryPlan`:
  | Operation | Backend | SQL pushdown |
  |-----------|---------|-------------|
  | `ROW_COUNT` | `analytics_service.py:297` | No |
  | `SUM` | `:303` | Yes |
  | `AVERAGE` | `:306` | Yes |
  | `MAX` | `:309` | Yes |
  | `MIN` | `:312` | Yes |
  | `COLUMN_COUNT` | `:176` | Schema-only |
  | `GROUPBY_SUM` | `:315` | Yes |
  | `GROUPBY_COUNT` | `:322` | Yes |
  | `TOP_N` | `:330` | Yes |
  | `XY_SELECT` | `:338` | No |
- SQL pushdown via `SQLTranslator` using parameterized `sqlalchemy.core.Select` — no string formatting
- Groq + Ollama with `FallbackQueryPlanner` (`groq_provider.py:168`)
- Dataset ownership isolation (`query.py:47–48`)
- TTL-cached plan → result (via SHA-256 key in upstream analytics route)

**Frontend**
- `AskWorkspace.tsx`: full conversation thread, `PlotlyChart.tsx`, `ResultTable.tsx`, `QueryPlanDisplay.tsx`
- `use-ask.ts` hook with `useMutation` + optimistic UI

### What's Partially Implemented ⚠️

- **SQL pushdown** only covers 7 of 10 operations; `ROW_COUNT`, `XY_SELECT`, `COLUMN_COUNT` always fall back to pandas in-memory load — fine for files but suboptimal for large DB tables
- **Schema validation** enforces column existence and numeric type but does **not** validate that `top_n.n` is reasonable (a plan with `n=10000` is accepted)

### What's Mocked 🔴

- Nothing mocked — fully real execution

### What's Stubbed 🟡

- `_execute()` has a catch-all `raise PlanValidationError` at line 344 that is marked `# Unreachable` — correct safety stub but the exhaustive enum means it can never fire

### What's Missing in Production 🚧

1. **FILTER operation** — no `where_column` / `where_value` in `QueryPlan`. A query like "show sales where region = North" fails with `PlanValidationError`. Adding this requires: new `Operation.FILTER` enum value, `where_column`/`where_value` fields in `QueryPlan`, one new pandas branch in `_execute()`, and one new SQLAlchemy `WHERE` clause in `SQLTranslator`.
2. **JOIN operation** — cross-dataset queries impossible
3. **Streaming responses** — LLM calls buffer entirely before `QueryResponse` is returned; no SSE or chunked streaming
4. **Result export** — `QueryResponse.table_data` is returned as JSON; no `Content-Disposition: attachment` endpoint for CSV/Excel download
5. **Conversation auto-triggering insights** — `AskWorkspace` never calls `POST /insights/generate` after a successful query

### Completion: **75%**

---

## 2. Anomaly Detection

### What's Implemented ✅

**Backend** (`backend/analytics/anomaly_detector.py`, `backend/app/services/anomaly_service.py`)
- **4 detection methods** with independent fallbacks:
  - `ZScoreDetector` — pure numpy, no deps (`anomaly_detector.py::ZScoreDetector`)
  - `IQRDetector` — pure numpy, no deps (`::IQRDetector`)
  - `IsolationForestDetector` — prefers `sklearn.ensemble.IsolationForest`; falls back to `MahalanobisDetector` when sklearn absent (`::_SKLEARN_AVAILABLE` flag at line 43)
  - `SeasonalAnomalyDetector` — prefers `statsmodels.tsa.seasonal.STL`; falls back to rolling-MAD modified z-score when statsmodels absent (`::_STATSMODELS_AVAILABLE` flag at line 51)
- **Ensemble merge** (`AnomalyDetectionEngine.analyze()`): deduplicates anomaly points across methods, keeping worst severity per row index
- Normalised severity tiers: `low` (<3σ), `medium` (≥3), `high` (≥4), `critical` (≥6) (`_SEVERITY` constant at line 64)
- **Plotly chart output** via `AnomalyChartBuilder.build()` — per-column subplots with colour-coded anomaly points by severity
- Deterministic `possible_reasons` — generated from statistical facts, zero LLM (`anomaly_detector.py::_build_reasons()`)
- TTL cache keyed by SHA-256 of dataset_id + params (`anomaly_service.py::_cache_key()`)
- Full schema: `AnomalyPoint`, `ColumnAnomaly` (with mean/std/q1/q3), `AnomalyResponse` (`schemas/anomaly.py`)

**API** (`backend/app/api/routes/anomalies.py`)
- `POST /api/v1/anomalies` with ownership check, dataset load, detect, memory recording
- Accepts `columns`, `methods`, `zscore_threshold`, `iqr_multiplier`, `contamination`, `seasonal_period`, `time_column`, `merge_methods`

**Frontend**
- `AnomalyWorkspace.tsx` (git: `32b2b50b`) — severity cards, collapsible per-column detail, stats row (mean/std/q1/q3), anomaly points table, Plotly chart
- `detectAnomalies()` API client (`lib/api/anomalies.ts`)
- Typed request/response (`lib/api/types.ts::AnomalyResponse`)
- Route: `app/datasets/[id]/anomalies/page.tsx`

### What's Partially Implemented ⚠️

- **Seasonal detection period** is auto-detected when `seasonal_period=None`, but the auto-detection uses only the series length heuristic (`len // 4`) rather than ACF-based period estimation — works but is imprecise
- **Frontend** shows the anomaly chart but does not render the chart when `chart_spec` is null (empty state has no fallback chart)
- **MetaPanel** links to the anomaly page (`MetaPanel.tsx:+12`) but the Sidebar quick actions (`Sidebar.tsx:76–87`) do not include anomalies — discoverability gap

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `possible_reasons` are deterministic string templates (`_build_reasons()`), not data-adaptive LLM analysis — works but generic

### What's Missing in Production 🚧

1. **No cross-navigation to RCA** — anomaly page has no "Investigate root cause" button linking to `/root-cause`
2. **No result export** — anomaly table can't be downloaded as CSV
3. **No confidence scores** — `AnomalyPoint.score` is a normalised z-equivalent but there's no `p_value` or frequentist confidence level
4. **Frontend AnomalyWorkspace not on disk** — file exists only in git at `32b2b50b`; source files in `backend/agents/` and `backend/analytics/` are missing from the working tree (only `__pycache__` remains)

### Completion: **88%**

---

## 3. Insight Generation

### What's Implemented ✅

**Statistical Engine** (`backend/app/services/insight_service.py::InsightStatEngine`)
- Full deterministic stat computation: `_column_stats()`, `_detect_trends()` (linear slope via numpy polyfit), `_detect_correlations()` (Pearson ≥ threshold), `_top_performers()`, `_underperformers()`, `_growth_patterns()` (period-over-period delta)
- `StatisticalFindings` struct injected verbatim into LLM prompt — no hallucination path
- Handles object-dtype columns via `pd.to_numeric(errors="coerce")` coercion

**LLM Agent** (`backend/agents/insight_agent.py::InsightAgent`)
- System prompt explicitly enumerates 6 anti-hallucination rules
- `_fallback_from_findings()` produces a guaranteed-correct statistical narrative when LLM is down — never raises
- Supports both Groq (JSON-mode) and Ollama with automatic provider selection from `Settings.llm_provider`
- Temperature = 0.1

**API** (`backend/app/api/routes/insights.py`)
- `POST /api/v1/insights/generate` with ownership check, TTL cache, memory recording
- Memory recording present: `asyncio.ensure_future(memory.record_turn(... TurnType.INSIGHT ...))`

**Schema** (`backend/app/schemas/insight.py`)
- `InsightRequest`, `StatisticalFindings`, `InsightResponse` with `summary`, `key_insights`, `trends`, `top_performers`, `underperformers`, `recommendations`, `cache_hit`, `generation_time_ms`

### What's Partially Implemented ⚠️

- **Memory recording bug**: `insights.py:62` does `resp.narrative if hasattr(resp, "narrative") else None` — but `InsightResponse` has no `narrative` field (`schemas/insight.py:InsightResponse`). The `answer` is always `None` in the stored turn.
- **LLM response parsing**: `InsightAgent` parses the JSON, but if the LLM omits `top_performers` or `underperformers`, the fallback silently produces empty lists rather than inferring from `StatisticalFindings.top_performers`

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `InsightRequest.table_data` can be an empty list and the service returns a canned "no data" response rather than loading the dataset directly — by design, but requires the caller to supply rows

### What's Missing in Production 🚧

1. **No frontend page** — there is no `/datasets/[id]/insights` page. `AskWorkspace` never calls `/insights/generate`. Insights are only reachable through the Agent or embedded in Report generation.
2. **No InsightTool in agent** — `agent_tools.py` registers `AnomalyDetectionTool`, `RootCauseAnalysisTool`, `RecommendationTool` but **no `InsightTool`** (`agent_tools.py:599–603`). The agent cannot autonomously generate insights.
3. **Not in Sidebar** — no top-level navigation entry
4. **No hook to trigger from query result** — `AskWorkspace` returns `table_data` but never surfaces a "Generate Insights" button
5. **`narrative` field missing** from `InsightResponse` — referenced in memory route but doesn't exist

### Completion: **68%**

---

## 4. Root Cause Analysis (RCA)

### What's Implemented ✅

**Statistical Engine** (`backend/app/services/root_cause_service.py::RCAEngine`)
- Full dimension decomposition algorithm: detects metric column, period column (date/month/quarter/year keywords or row-halves fallback), current vs previous period
- Computes per `(dimension, value)` contribution: `(current − previous) / |total_change| × 100`
- 4 period-split methods: `"explicit"`, `"date_column"`, `"period_column"`, `"row_halves"`
- High-cardinality guard: skips dimensions with >50 unique values (`_MAX_DIM_CARDINALITY`)
- Produces `RCAFindings` with `ContributionFactor[]` sorted by `|contribution_pct|`

**LLM Agent** (`backend/agents/root_cause_agent.py::RootCauseAgent`)
- System prompt: contribution_pct ≥ 30 → "high", ≥ 10 → "medium", else "low"
- Fallback `_fallback_from_findings()` generates full response from `RCAFindings` without LLM
- Temperature = 0.1

**API** (`backend/app/api/routes/root_cause.py`)
- `POST /api/v1/root-cause` with ownership check and dataset load

**Schema** (`backend/app/schemas/root_cause.py`)
- `RootCauseRequest` (with optional `metric_column`, `period_column`, `current_period`, `previous_period` overrides)
- `RCAFindings`, `ContributionFactor`, `RootCauseResponse` with `problem`, `root_causes[]`, `contribution_analysis[]`, `recommendations[]`

### What's Partially Implemented ⚠️

- **Period auto-detection is heuristic** — relies on column name keywords (`_PERIOD_KEYWORDS`). A column named `"fiscal_qtr"` won't be detected as a time column.
- **`RCAEngine` max dimension guard** limits to 6 dimension columns (`_MAX_DIMENSIONS`) — correct for performance but could miss important dimensions in wide tables

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `direction: "flat"` when `|total_pct_change| < 1%` — the LLM receives a flat direction even when the data shows sub-1% movement that might still be meaningful

### What's Missing in Production 🚧

1. **No frontend page** — no `/datasets/[id]/root-cause` route exists. Feature is only reachable via Agent (`RootCauseAnalysisTool`) or direct API call.
2. **Memory not recorded** — `root_cause.py` imports no memory service, never calls `record_turn()`. RCA sessions are not persisted in conversation history.
3. **No waterfall chart** — the schema and service mention `waterfall` chart capability (see service docstring), but `RootCauseResponse` has no `chart_spec` field. The Plotly waterfall that was described in the feature brief was not implemented.
4. **Not in Sidebar** — no top-level navigation
5. **No cross-navigation from Anomaly page** — cannot chain "detect anomaly" → "explain root cause" without the Agent

### Completion: **70%**

---

## 5. Recommendation Engine

### What's Implemented ✅

**Rule Engine** (`backend/app/services/recommendation_service.py::RecommendationRuleEngine`)
- Derives recommendations from 4 signal sources:
  - `_from_anomalies()` — per-column spike/drop patterns, consecutive anomaly runs, critical severity escalation
  - `_from_insights()` — trend direction, performer gap, strong correlations
  - `_from_forecast()` — projected decline/growth with magnitude
  - `_from_query_results()` — relative outliers in numeric columns
- **Cross-signal escalation** (`_cross_signal_recommendations()`) — same metric flagged by ≥2 sources → escalates to `critical` priority
- Category inference from keyword matching (`_infer_category()`) — 6 categories
- All `priority`, `confidence`, `data_points` fields are rule-computed, never LLM-generated

**LLM Agent** (`backend/agents/recommendation_agent.py::RecommendationAgent`)
- Rewrites only 3 text fields: `action`, `reason`, `expected_impact` — never touches priority/confidence/source/data_points
- System prompt explicitly lists 8 anti-hallucination rules
- On any exception, returns original rule-based recommendations unchanged

**API** (`backend/app/api/routes/recommendations.py`)
- `POST /api/v1/recommendations` with validation that at least one signal is provided
- Memory recording present for top-5 recommendations

**Frontend**
- `RecommendationWorkspace.tsx` (git: `32b2b50b`) — priority-sorted cards, confidence badge, category tags, source attribution, expandable data-points
- `generateRecommendations()` API client (`lib/api/recommendations.ts`)
- Route: `app/datasets/[id]/recommendations/page.tsx`

**Agent tool** (`agent_tools.py::RecommendationTool`)
- Fully wired: reconstructs typed `AnomalyResponse` / `InsightResponse` from dicts, calls service, returns top-5

### What's Partially Implemented ⚠️

- **`_from_query_results()`** is a simple percentile-outlier scan — no LLM-assisted pattern recognition
- **Frontend** uses `useMutation` directly (no custom hook like `use-anomalies.ts`) — coupling between component and API client
- **RecommendationWorkspace not on disk** — exists only in git at `32b2b50b`

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `RecommendationAgent` `pass` statements at `agent_tools.py:473,479` — when `AnomalyResponse(**arguments["anomalies"])` fails, the exception is silently swallowed and `anomalies=None` is passed instead

### What's Missing in Production 🚧

1. **No X-Session-Id in frontend** — `lib/api/recommendations.ts` does not send the session header, so recommendation turns are not recorded in memory even though the route supports it
2. **No "upstream chain" UI** — user must manually copy anomaly/insight results into the recommendation request; there's no "run full pipeline" button
3. **`InsightResponse` accepted but never surfaced from frontend** — the Recommendation Workspace sends its own signals from URL params, not the results of prior insight/anomaly calls

### Completion: **83%**

---

## 6. Forecasting

### What's Implemented ✅

**Models** (`backend/app/services/forecast_models.py`)
- Model selection waterfall: Holt-Winters Seasonal (`ExponentialSmoothing` with `trend="add"`, `seasonal="add"`) → Holt-Winters (no seasonal) → Linear Trend (`numpy.polyfit`) → Naïve (last-value)
- `statsmodels` dependency — gracefully degrades to linear trend if unavailable
- `detect_anomalies()` in forecast context: rolling z-score on residuals from Holt-Winters fit

**Service** (`backend/app/services/forecast_service.py`)
- 3 operations: `FORECAST`, `ANOMALY_DETECTION`, `TIMESERIES_AGGREGATE`
- LLM-produced `ForecastPlan` → `_validate()` → `_execute()`
- Column existence and date-parseability validation
- Frequency resampling via `pandas.resample()` with configurable `AggMethod`
- `min_data_points` guard (6 points minimum, `config.py:forecast_min_points`)

**API** (`backend/app/api/routes/forecast.py`)
- `POST /api/v1/forecast` with memory recording

**Frontend**
- `ForecastWorkspace.tsx`, `ForecastForm.tsx`, `ForecastMetaCards.tsx`, `ForecastResult.tsx`
- Plotly chart via `forecast_chart.py::forecast_figure()`

### What's Partially Implemented ⚠️

- **No fallback planner for forecast** — `ForecastService` only supports Groq → Ollama fallback through `FallbackForecastPlanner` in `groq_provider.py:192`, but the service doesn't gracefully degrade if **both** are down; it raises `LLMError`
- **Anomaly detection in forecast** uses a rolling z-score on model residuals, not the richer 4-method engine from `anomaly_detector.py`

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `method_used` in `ForecastResponse` reports the model name as a string — no schema enum constraint

### What's Missing in Production 🚧

1. **No confidence intervals** — `ForecastResponse` has no `lower_bound` / `upper_bound` / `prediction_interval` fields (`schemas/forecast.py:ForecastResponse`). `statsmodels` `ExponentialSmoothing.simulate()` can produce them but is not called.
2. **Single-column only** — one `value_column` per request; no multivariate forecasting
3. **No model persistence** — every forecast re-fits the model from scratch; no caching of fitted `ExponentialSmoothing` objects
4. **Horizon capped at 36** (`config.py:max_forecast_horizon`) with no UI control to change it
5. **Frontend form** shows date/value column selectors but no frequency or horizon picker — users get the LLM-inferred defaults with no override

### Completion: **78%**

---

## 7. Conversational Memory

### What's Implemented ✅

**3-layer storage architecture**
- **L1** (`backend/memory/session_memory.py::SessionMemory`): `TTLCache(ttl_seconds=300, max_entries=100)` — in-process, key `"{user_sub}:{session_id}"`
- **L2** (`session_memory.py::_redis`): optional `redis.asyncio` — activated when `REDIS_URL` set; package-absence handled gracefully with `ImportError` warning
- **L3** (`backend/memory/conversation_store.py::ConversationStore`): `aiosqlite` SQLite WAL, table `conversation_turns`, two compound indexes

**Service** (`backend/app/services/memory_service.py::MemoryService`)
- `record_turn()` — L1 sync update + `asyncio.ensure_future(store.save_turn())` fire-and-forget
- `get_context()` — L1 hit → return; L1 miss → hydrate from SQLite → repopulate L1
- `build_agent_context()` — formats `[{"goal": str, "summary": str}]` for agent planner
- `clear_session()` — wipes L1, Redis, and SQLite
- `expire_old_sessions()` — calculates cutoff from `session_ttl_seconds`
- Table-data row cap at `max_table_rows` (default 50)

**Integration**
- 6 routes record turns: `query.py`, `chart.py`, `forecast.py`, `insights.py`, `anomalies.py`, `recommendations.py`
- `agent.py` reads prior context and injects into `conversation_history` before planning

**API**
- `GET /api/v1/memory/context?session_id=...`
- `DELETE /api/v1/memory/clear?session_id=...`

**Schema** (`backend/app/schemas/memory.py`)
- `TurnType` enum: `query`, `chart`, `forecast`, `anomaly`, `insight`, `recommendation`, `report`, `agent`
- `ConversationTurn`, `ConversationContext`, `MemoryClearResponse`

### What's Partially Implemented ⚠️

- **L1 TTL is synchronous** — `TTLCache` uses `threading.Lock` for cleanup; works in single-process async uvicorn but the lock is unnecessary overhead
- **Redis L2 is write-through only** — on `put_async()` both L1 and Redis are written, but on L1 miss only Redis is read; if Redis goes down after a write the L3 SQLite is the only fallback

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `expire_old_sessions()` exists in `memory_service.py` but is **never called anywhere** — no scheduled task, no lifespan call, no cron. Old turns accumulate in SQLite indefinitely.

### What's Missing in Production 🚧

1. **Frontend sends no X-Session-Id header** — `lib/api/client.ts` does not include the header; `lib/api/ask.ts`, `lib/api/chart.ts`, `lib/api/forecast.ts` all omit it. Memory is recorded server-side only when the header is present — meaning **zero turns are ever stored** from the current frontend.
2. **No memory UI** — there is no frontend page to view conversation history, no "New Session" button, no session indicator in the header
3. **RCA route not integrated** — `backend/app/api/routes/root_cause.py` imports no `MemoryService`, never calls `record_turn()`. RCA turns are invisible to memory.
4. **`expire_old_sessions()` is never called** — sessions grow without bound in SQLite
5. **Multi-worker breakage** — `get_memory_service()` is `@lru_cache(maxsize=1)` in `dependencies.py`. Two uvicorn workers have two independent L1 caches; a session stored by worker-1 is a cache miss for worker-2. L3 SQLite concurrent writes are WAL-safe but L1 diverges.
6. **Session ID is client-generated with no validation** — any string is accepted as `session_id`; no UUID format enforcement

### Completion: **65%**

---

## 8. AI Agent Orchestration

### What's Implemented ✅

**LangGraph graph** (`backend/app/services/agent_graph.py`)
- 6 nodes: `_planner_node`, `_verifier_node`, `_executor_node`, `_approval_gate_node`, `_recovery_node`, `_aggregator_node`
- Conditional routers between all nodes: `_planner_router`, `_verifier_router`, `_executor_router`, `_approval_gate_router`, `_recovery_router`
- `AsyncSqliteSaver` checkpointer (WAL mode, same file as main sessions)
- `MemorySaver` fallback when `langgraph-checkpoint-sqlite` not installed

**Planner** (`backend/app/services/agent_planner.py`)
- Supports `{"type": "chat", "message": "..."}` for conversational responses AND `{"type": "plan", "steps": [...]}` for tool execution
- `replan()` produces a revised plan after step failure
- Groq (`response_format=json_object`) + Ollama (`format="json"`) + `FallbackAgentPlanner`

**Tool registry** (`backend/app/services/agent_tools.py`)
- 10 tools registered: `dataset_preview`, `analytics`, `visualization`, `forecast`, `report`, `crud_preview`, `crud_execute`, `anomaly_detection`, `root_cause_analysis`, `recommendation`, `sql_query`
- `AnomalyDetectionTool` (`::357`) — wires to `AnomalyDetectionService`
- `RootCauseAnalysisTool` (`::397`) — wires to `RootCauseService`
- `RecommendationTool` (`::437`) — reconstructs typed inputs, calls service

**CRUD approval workflow**
- `crud_preview` must precede `crud_execute` (planner system prompt rule 3)
- `_approval_gate_node` halts graph execution and returns `PendingApproval` with preview
- `resume()` in `AgentOrchestrator` re-enters the graph with user decision

**Frontend** (`frontend-next/src/components/agent/AgentWorkspace.tsx`)
- Full agent thread, `AgentTimeline.tsx`, `AgentApprovalCard.tsx`, `AgentExplainPanel.tsx`, `AgentThinkingIndicator.tsx`

### What's Partially Implemented ⚠️

- **`InsightTool` is missing** — there is no `InsightGenerationTool` in `agent_tools.py`. The agent cannot be told "generate insights for dataset X" and have it call `/insights/generate`. The `build_registry()` function registers anomaly/rca/recommendation but not insight (`agent_tools.py:599–603`).
- **Approval workflow is CRUD-only** — `_approval_gate_node` only intercepts steps with `requires_approval=True`, which only `CrudExecuteTool` sets. No approval gate for destructive forecasts or recommendations.

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `RecommendationTool.execute()` swallows `AnomalyResponse(**args)` parse failures silently (`agent_tools.py:473, 479`) — `anomalies=None` passed downstream instead of raising

### What's Missing in Production 🚧

1. **No `InsightTool`** — agent cannot auto-generate insights; gap in the `analyze → insight → recommend` pipeline
2. **No streaming** — `AgentOrchestrator.run()` buffers the entire multi-step execution before returning `AgentRunResponse`; the frontend polls or waits for the full response
3. **Token / context window management** — no token counting on the conversation history injected from `build_agent_context()`; long sessions can overflow the LLM context window silently
4. **Single-tool parallelism** — `_executor_node` runs steps sequentially; independent steps (anomaly + forecast) could run concurrently with `asyncio.gather`
5. **No agent-level rate limiting** — a single user can trigger unlimited agent runs, each consuming LLM tokens

### Completion: **80%**

---

## 9. CRUD Operations

### What's Implemented ✅

**Pipeline** (`backend/app/services/crud_service.py`)
- `preview()` → LLM plan → validate → build affected-row preview with confirmation token
- `execute()` → verify token → run DML → capture pre-image → JSONL audit log → return `CrudExecuteResponse`
- `rollback()` → load snapshot → run reverse DML → log rollback

**Planner** (`backend/app/services/crud_planner.py`)
- Groq + Ollama + `FallbackCrudPlanner`
- JSON-mode output with `CrudPlan` structure

**Validator** (`backend/app/services/crud_validator.py`)
- `_check_column_references()` — all SET/WHERE columns must exist
- `_check_value_types()` — type coercion validation
- `_require_filters()` — UPDATE/DELETE without WHERE clause rejected
- `_check_pk_immutability()` — primary key columns cannot be SET
- `_check_denylist()` — blocks system columns (`created_at`, `id`, etc.)
- HMAC confirmation tokens with 5-minute TTL (`ConfirmationTokenIssuer`)

**Executor** (`backend/app/services/crud_executor.py`)
- `_capture_pre_image()` — SELECT rows before mutation for rollback
- `_save_snapshot()` — JSONL file per operation in `crud_rollback/`
- `_run_reverse_dml()` — generates and executes inverse DML
- `_is_rollback_supported()` — INSERT-only rollback available; complex UPDATE/DELETE noted

**Audit** (`backend/app/services/crud_audit.py`)
- JSONL append log per `connection_id`
- `threading.Lock` per log file

**Frontend**
- `CrudWorkspace.tsx`, `CrudPreviewPanel.tsx`, `CrudApprovalModal.tsx`, `CrudAuditViewer.tsx`, `CrudRequestPanel.tsx`

### What's Partially Implemented ⚠️

- **Rollback for UPDATE** requires capturing all affected rows in pre-image; for very wide tables or large `affected_count`, this can be slow (runs in-request)
- **`_get_pk_cols()`** (`crud_executor.py:374`) returns an empty list if SQLAlchemy reflection finds no PKs — reverse DML for tables without explicit PKs falls back to all-column WHERE

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- `_resolve_soft_delete_default()` at line 390 returns `"1"` (string) as the default soft-delete value — works for boolean-as-integer columns but wrong for `boolean` typed columns in PostgreSQL

### What's Missing in Production 🚧

1. **Bulk operations** — `CrudPlan` supports single-row semantics via `RowFilter`; there's no batch-insert or multi-row update plan type
2. **No field-level encryption** — DB credentials are encrypted (`crypto.py`), but column values in CRUD payloads are plaintext in audit logs
3. **`crud_rollback_ttl_seconds`** (default 3600) is enforced by `CrudExecutor._delete_snapshot()` but there's no background job to clean up expired snapshots

### Completion: **90%**

---

## 10. Report Generation

### What's Implemented ✅

**Service** (`backend/app/services/report_service.py`)
- Full pipeline: summary → statistics → deterministic charts → forecast section → LLM insights → Q&A sections → PDF
- `_build_deterministic_charts()` — bar, line, scatter using `VisualizationService`
- `_build_forecast_section()` — calls `ForecastService` if dataset has date+numeric columns
- `_build_insights()` — calls `InsightGenerationService` with top-N query result rows
- `_build_qa_sections()` — runs 5 fixed `QueryPlan` batteries (SUM, AVERAGE, TOP_N, GROUPBY_SUM, GROUPBY_COUNT) for section headers and answers
- Ownership isolation — `get_report_path()` checks `owner_sub`

**PDF Builder** (`backend/app/services/pdf_builder.py`)
- ReportLab-based, renders: summary table, stats table, Plotly charts (rasterised via `kaleido`), insights list, Q&A sections
- `figure_to_png()` — Plotly → PNG via `pio.to_image(format="png")` with `None` fallback when kaleido absent

**API** (`backend/app/api/routes/reports.py`)
- `POST /api/v1/reports/generate` → returns `ReportMetadata`
- `GET /api/v1/reports/{report_id}/download` → returns PDF as `FileResponse`

**Frontend**
- `ReportsWorkspace.tsx`, `ReportGenerateForm.tsx`, `ReportCard.tsx`

### What's Partially Implemented ⚠️

- **`_build_forecast_section()`** catches `Exception` broadly and returns `[]` on any failure (`report_service.py:296, 310, 312`) — forecast silently missing from PDF with no user notification
- **`figure_to_png()`** returns `None` when kaleido is absent — PDF is still generated but chart sections are blank

### What's Mocked 🔴

- Nothing mocked

### What's Stubbed 🟡

- Report version (`config.py:report_version = "1.0"`) is a static string not used for any schema migration or backwards-compat logic

### What's Missing in Production 🚧

1. **No scheduled reports** — no cron, no background task queue; every report is on-demand in-request
2. **No email delivery** — generated PDFs are stored on disk and downloaded via link; no `SMTP` or SendGrid integration
3. **Heavy report blocks uvicorn worker** — PDF generation (Plotly rasterisation + ReportLab layout) runs synchronously inside the async route handler via `run_in_threadpool` wrapping only the dataset load, not the PDF build itself
4. **No custom template** — single hardcoded ReportLab layout; no user-configurable sections, branding, or logo
5. **No Excel export** — only PDF; `pandas.to_excel()` is never called
6. **kaleido optional** — if `kaleido` is not installed, all charts in the PDF are blank without warning to the user

### Completion: **77%**

---

## Summary Table

| # | Feature | Implemented | Partial | Mocked | Stubbed | Missing | **Complete** |
|---|---------|-------------|---------|--------|---------|---------|-------------|
| 1 | Natural Language Query | Full 10-op pipeline, SQL pushdown | Narrow op set, no streaming | None | Unreachable catch-all | FILTER/JOIN, export, streaming | **75%** |
| 2 | Anomaly Detection | 4 methods, ensemble, charts, frontend | Seasonal period heuristic | None | Template `possible_reasons` | Cross-nav to RCA, export, p-values | **88%** |
| 3 | Insight Generation | Stat engine + LLM agent + API | `narrative` field bug in memory | None | Canned "no data" path | Frontend page, InsightTool, AskWorkspace hook | **68%** |
| 4 | Root Cause Analysis | Dimension decomp + LLM + API | Period heuristic, flat threshold | None | "flat" direction stub | Frontend page, memory recording, waterfall chart | **70%** |
| 5 | Recommendation Engine | Rule engine + LLM polish + frontend | Outlier-only query rules | None | Silent exception swallow | X-Session-Id in frontend, pipeline UI | **83%** |
| 6 | Forecasting | 4-model waterfall + 3 operations | Residual-only anomaly in forecast | None | `method_used` string | Confidence intervals, multivariate, model cache | **78%** |
| 7 | Conversational Memory | 3-layer storage + 6 route hooks | Redis write-through only | None | `expire_old_sessions()` dead code | Frontend X-Session-Id, RCA hook, memory UI, TTL cleanup | **65%** |
| 8 | AI Agent Orchestration | LangGraph 6-node graph + 10 tools | Sequential tool execution | None | Silent exception in RecommendationTool | InsightTool, streaming, token counting | **80%** |
| 9 | CRUD Operations | Preview→approve→execute→rollback | Wide-table rollback perf | None | Soft-delete type default | Bulk ops, scheduled snapshot cleanup | **90%** |
| 10 | Report Generation | Full PDF pipeline + charts + insights | Broad exception swallows in forecast | None | Static report version | Scheduling, email, Excel export, kaleido warning | **77%** |

### Overall Portfolio Completeness: **77%**

---

## Critical Path — Issues Blocking Production Use

These are defects (not missing features) that affect existing functionality:

| Priority | Issue | Evidence | Fix |
|----------|-------|----------|-----|
| P0 | Memory is never recorded from frontend | `lib/api/client.ts` — no `X-Session-Id` header | Add `sessionStorage.getItem("session_id")` to all API calls |
| P0 | `InsightResponse.narrative` referenced but doesn't exist | `insights.py:62` — `hasattr(resp, "narrative")` always `False` | Change to `resp.summary` |
| P1 | RCA never records memory turns | `root_cause.py` — no `MemoryService` import | Add `memory.record_turn(TurnType.ANOMALY, ...)` |
| P1 | `expire_old_sessions()` dead code | `memory_service.py::expire_old_sessions` — never called | Call from lifespan or add APScheduler cron |
| P1 | `InsightTool` missing from agent | `agent_tools.py:599–603` — no `InsightTool` registered | Implement `InsightGenerationTool` class |
| P2 | Insight and RCA have no frontend pages | No `/insights` or `/root-cause` routes in `src/app/` | Create pages + workspaces |
| P2 | Feature source files not on disk | `backend/agents/`, `backend/analytics/` empty | `git checkout HEAD -- backend/agents/ backend/analytics/` |
| P2 | Forecast has no confidence intervals | `schemas/forecast.py:ForecastResponse` — no `lower_bound`/`upper_bound` | Add fields + call `model.simulate_prediction_intervals()` |
