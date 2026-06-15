# Architecture Overview

**Audience**: Software engineers and recruiters looking to understand how the system is structured and why.

**Stack**: Python 3.11 / FastAPI backend · Next.js 16 / React 19 frontend · Groq + Ollama (LLM) · SQLite · Filesystem storage

---

## 1. Request Flow

Every request — whether a file upload, a natural-language query, or an agent step — follows the same path through the system.

```
Browser (Next.js)
    │
    │  JWT Bearer token (HS256, signed by backend secret)
    ▼
FastAPI Router
    │  validates token: iss, aud, jti, exp
    │  extracts owner_sub (Google user ID, never from request body)
    │
    ├── dependency injection (service singletons via @lru_cache)
    │
    ▼
Service Layer
    │  owns all business logic, LLM calls, pandas, SQLAlchemy
    │  never imports directly from routes
    │
    ▼
Storage
    ├── Filesystem  — uploaded files, reports, dashboards, connections
    └── SQLite WAL  — agent session checkpoints
```

**Auth flow**: The frontend uses NextAuth.js with Google OAuth. On sign-in, NextAuth calls the backend `/auth/token` endpoint which returns a short-lived HS256 JWT. That token is attached to every subsequent API call as a `Bearer` header. The backend validates it on every request; the `owner_sub` claim is stamped onto every resource at creation time and checked on every read. Resources owned by a different user return 404, not 403 — this avoids leaking that a resource exists.

**Why no database for application data?** All structured metadata (dataset info, report info, dashboard config, connection credentials) is stored as JSON sidecar files alongside the actual data files. This was chosen early to avoid schema migrations during rapid development. The tradeoff is that horizontal scaling requires a shared volume and Render's free tier wipes the disk on redeploy. The path to fixing it (S3 for blobs, Postgres for metadata) is documented and would not require rewriting any service logic.

---

## 2. Agent Workflow

The agent is a [LangGraph](https://github.com/langchain-ai/langgraph) `StateGraph` — a directed graph of Python functions where each node updates a shared typed state dict. State is checkpointed to SQLite after every node, so a paused session survives across HTTP requests.

```
User message
    │
    ▼
┌─────────┐     plan (type=chat)     ┌────────────┐
│ planner │ ────────────────────────►│ aggregator │──► response
└────┬────┘                          └────────────┘
     │ plan (type=tool_steps)               ▲
     ▼                                      │
┌──────────┐  explain-only ────────────────►│
│ verifier │                                │
└────┬─────┘  ok                            │
     │                                      │
     ▼                                      │
┌──────────┐ ── done ──────────────────────►│
│ executor │                                │
└────┬─────┘ ── error ──► ┌──────────┐     │
     │                    │ recovery │─────►│
     │ crud preview       └──────────┘
     ▼
┌──────────────┐
│ approval_gate│ ◄── interrupt() — HTTP response returns here
└──────────────┘
     │ Command(resume=approved/rejected)
     └── resume executor or recovery
```

**Six nodes, each with a single responsibility:**

| Node | What it does |
|---|---|
| `planner` | Calls the LLM; gets back either a chat reply or a list of tool steps |
| `verifier` | Validates tool names, enforces step limits, checks sequencing rules (e.g. `crud_execute` must follow `crud_preview`) |
| `executor` | Runs one tool at a time; appends `ToolResult` to state |
| `approval_gate` | Calls `interrupt()` — suspends the graph and surfaces a payload to the HTTP caller; resumes when the user approves or rejects |
| `recovery` | Re-prompts the LLM with the error and remaining steps; gives up after `max_retries` |
| `aggregator` | Builds the final answer from all results in state |

**Tool registry** — 12 tools, each a thin adapter over an existing service:

```
dataset_preview · analytics · visualization · forecast · report
crud_preview · crud_execute · sql_query
anomaly_detection · root_cause_analysis · recommendation · insight_generation
```

**CRUD approval flow**: When the executor runs `crud_preview`, the next node calls `interrupt()`. The graph state is serialised to SQLite and the HTTP response returns a `pending_approval` payload with a preview of the rows to be changed and a signed HMAC token. When the user calls the approve endpoint, the token is verified (bound to the specific operation, connection, and row count; expires in 5 minutes), and `Command(resume="approved")` restarts the graph from the approval gate.

---

## 3. Analytics Pipeline

The core design decision: the LLM never writes code that gets executed. It picks an operation from a fixed list and fills in column names. Python runs the operation.

```
User question
    │
    ▼
LLM (Groq → Ollama fallback)
    │
    │  returns JSON: { "operation": "groupby_sum", "column": "revenue", "group_by": "region" }
    ▼
QueryPlan (Pydantic, extra="forbid")
    │  structural validation: operation must be in Operation enum
    │  unknown fields → ValidationError immediately
    ▼
Semantic validation
    │  "revenue" in df.columns?   (KeyError-safe lookup, not string formatting)
    │  "region" in df.columns?
    │  operation requires group_by?
    ▼
Pandas dispatch table
    │  fixed function per Operation member — no dynamic dispatch
    ▼
ExecutionResult → answer string + table + timing
```

**Operation enum** (10 operations): `row_count`, `column_count`, `sum`, `average`, `max`, `min`, `groupby_sum`, `groupby_count`, `top_n`, `xy_select`

Column names from the plan are only ever used as dictionary keys to look up a `pd.Series` from the DataFrame. They are never formatted into a string or passed to `eval()`. A column name that doesn't exist raises `KeyError`, which the service maps to a `ValidationError` with a clear message.

**SQL pushdown**: For table-backed datasets (connected databases rather than uploaded files), the analytics service runs the same `QueryPlan` against SQLAlchemy expressions instead of pandas. The DataFrame is never materialised for pushed-down operations — the database does the aggregation.

**LLM provider chain**:
```
FallbackQueryPlanner
    try: GroqQueryPlanner  (cloud, JSON-mode forced, fast)
    except LLMError: OllamaQueryPlanner  (local, slower, no rate limits)
```
If both fail, `LLMError` propagates to the route and returns a 503 with the actual error message. The same fallback pattern is used for forecasting, CRUD planning, and the agent planner.

---

## 4. Memory Architecture

Conversational memory lets the agent understand follow-up questions ("what caused that drop?") without the user repeating context.

```
HTTP request
    │
    ▼
ContextBuilder
    │  pulls last N turns from cache
    │  formats them as a prompt prefix
    ▼
Agent / service receives question + prior context
    │
    ▼
Response returned to user
    │
    │  asyncio.ensure_future(...)   ← fire-and-forget, does not block response
    ▼
MemoryService.record(turn)
    │
    ├── L1: SessionMemory  — TTLCache in process, 5-minute expiry
    │       key: "{user_sub}:{session_id}"
    │       fast; lost on process restart
    │
    └── L2: ConversationStore  — SQLite (or Postgres if MEMORY_DATABASE_URL set)
            WAL mode; survives restarts
            L1 is hydrated from L2 on cache miss
```

**Why fire-and-forget?** Recording a turn should not add latency to the response. If recording fails, the user loses the turn from future context — acceptable, since memory is a convenience, not a correctness requirement. The failure is logged.

**L1 hydration**: On a cache miss (new process, expired entry), `SessionMemory` queries `ConversationStore` for the last N turns and repopulates L1. Subsequent requests in the same session hit L1 only.

**Isolation**: Cache keys are scoped by `user_sub` + `session_id`. Two users with the same session ID string cannot access each other's turns.

---

## 5. Dashboard Generation

Dashboards are generated by four deterministic engines in sequence, with one optional LLM call at the end for naming and summary text.

```
Dataset + user prompt
    │
    ▼
KPISelector
    │  ranks numeric columns by: keyword match (revenue/sales/profit/cost score higher)
    │  + coefficient of variation + non-null ratio
    │  returns top N KPIMetric objects with current value, trend, sparkline
    ▼
ChartEngine
    │  for each candidate column pair: picks chart type deterministically
    │  (bar for categorical groupings, line for time series, scatter for correlations)
    │  builds full Plotly spec server-side — frontend renders from JSON
    ▼
LayoutEngine
    │  greedy packing: KPIs fill a top row (3-col wide each)
    │  charts fill subsequent rows (6-col wide each)
    │  returns grid layout compatible with react-grid-layout
    ▼
DashboardScorer
    │  0–100 score from: KPI count, chart variety, data coverage, completeness
    │  used internally to decide whether to surface a "low quality" warning
    ▼
LLM call (optional)
    │  receives: KPI list, chart titles, user prompt
    │  returns: dashboard_name (string) + recommendations (list of strings)
    │  fallback: name from filename slug, recs from KPI trend strings
    ▼
DashboardConfig JSON
    │  stored to disk on save
    │  re-rendered live on load (no cached images)
```

**Why keep the LLM out of chart selection?** Early tests let the LLM choose which columns to display. Across multiple runs on the same dataset, it chose different columns with no consistent rationale. The deterministic scoring produces the same dashboard for the same data, which is what users expect when they share a saved dashboard with a colleague.

**Caching**: The full `DashboardConfig` (including all chart specs) is cached with a 1-hour TTL keyed by `(dataset_id, prompt, owner_sub)`. First generation takes 2–4 seconds. Cache hits return in under 50ms.

---

## 6. Forecasting Pipeline

```
User question  (e.g. "forecast revenue for next 6 months")
    │
    ▼
ForecastPlanner (LLM)
    │  returns ForecastPlan: { operation, date_column, value_column,
    │                          frequency, aggregation, horizon }
    │  Pydantic validates: columns exist, horizon ≥ 1, frequency in enum
    ▼
ForecastService._prepare_series()
    │  parse date column → datetime index
    │  resample to requested frequency (monthly M, weekly W, quarterly Q, ...)
    │  aggregate by sum or mean; interpolate gaps
    ▼
forecast_series()  — model chain, tries in order:

    1. Holt-Winters Seasonal (statsmodels ExponentialSmoothing)
       Requires: n ≥ 2 × seasonal_period AND seasonal_period ≥ 2
       Best for: monthly data with annual seasonality

    2. Holt-Winters (no seasonal component)
       Requires: n ≥ 4
       Best for: short series with trend but no repeating cycle

    3. Linear OLS (numpy.polyfit)
       Requires: n ≥ 3
       Best for: clear linear trend, minimal noise

    4. Naive (last value repeated)
       Requires: n ≥ 1
       Always works; used when data is too sparse for any model
    │
    │  first method that doesn't raise is used
    │  ForecastOutput records method_used and fallback_used flag
    ▼
Confidence interval
    │  residuals = actual − fitted values
    │  margin = 1.96 × std(residuals)   → ~95% interval
    │  interval widens for volatile series automatically
    ▼
ForecastResponse
    │  predicted values + lower/upper bounds + method_used + timing
    │  frontend renders as line chart with shaded confidence band
```

**statsmodels is optional.** If `statsmodels` is not installed (or fails to import), the chain starts at step 3. The service declares this in the response via `fallback_used: true` and `method_used: "linear"`.

**Why a fallback chain rather than a single model?** A single model chosen for the average case fails visibly on edge cases (8 data points, irregular time series, missing months). The chain ensures the user always gets an answer — with honest metadata about how reliable it is — rather than an error.

---

## Constraints and Ceilings

| Constraint | Reason | Fix |
|---|---|---|
| Single worker (`--workers 1`) | SQLite agent sessions and in-process caches don't survive across OS processes | LangGraph `PostgresSaver` + Redis/Postgres for caches |
| Ephemeral disk (Render free tier) | Filesystem storage; data is wiped on redeploy | S3/R2 for files, Postgres for metadata |
| 10-tool cap per agent run | Prevents runaway planning; enforced in `verifier` | Configurable per-request |
| No rate limiting on API | Not yet implemented | `slowapi` middleware |

These are tradeoffs made during solo development, not design flaws. The service interfaces are abstracted enough that the storage backend can be swapped without rewriting business logic.
