# Universal Data Assistant

A full-stack web application that lets users upload data, connect to databases, and ask questions in plain English. The backend answers using deterministic code — the LLM picks what to run, not how to run it.

Built solo over roughly 14 incremental phases, starting with a Streamlit proof-of-concept and ending with a Next.js frontend, a LangGraph agent, and around 30,000 lines of code across Python and TypeScript.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Motivation](#2-motivation)
3. [Architecture](#3-architecture)
4. [Features](#4-features)
5. [Technology Stack](#5-technology-stack)
6. [Setup Instructions](#6-setup-instructions)
7. [Design Decisions](#7-design-decisions)
8. [Limitations](#8-limitations)
9. [Future Improvements](#9-future-improvements)
10. [Screenshots](#10-screenshots)
11. [Deployment](#11-deployment)

---

## 1. Project Overview

Universal Data Assistant is a data analysis tool that sits between a raw dataset and a useful answer. You upload a CSV, connect a Postgres database, or point it at an Excel file — then ask questions in plain English. The system figures out what operation to run, executes it, and returns a result with a chart.

Beyond basic queries it can:
- Forecast time series using a statistical model chain
- Run anomaly detection across multiple methods
- Generate multi-page PDF reports
- Execute safe database writes with a human confirmation step
- Chain multiple analysis steps together through an AI agent

The project started because I wanted to understand what it actually takes to build an LLM-backed tool that gives correct, reproducible answers — not just something that looks like it works.

**Numbers at a glance:**
- 83 Python files in the backend application layer (~10,600 lines)
- 120 TypeScript/TSX files in the frontend (~16,700 lines)
- 17 API route modules
- 35 backend service files
- 180 tests across 16 test modules
- 14 development phases completed

---

## 2. Motivation

### The core problem with most "ask your data" tools

The obvious approach to natural language data analysis is to ask the LLM to write Python and run it:

```python
# what most tools do
code = llm.generate("write pandas code to answer: " + user_question)
exec(code, {"df": dataframe})  # or eval()
```

This has a few problems I wasn't willing to accept:

1. **You cannot test it.** The output is different every time. You can't write a unit test that says "for this question, the answer should be 47.3". The test would be testing the LLM, not your code.

2. **Wrong answers look identical to right ones.** A hallucinated number and a correct number are formatted the same way. The user has no way to tell.

3. **It's a security hole.** `exec()` in a web application is a loaded gun. The LLM can write `import os; os.system("rm -rf /")` and you'd run it.

4. **You can't audit what ran.** If a user asks "what's our total revenue" and gets the wrong number, you can't reconstruct what the LLM wrote or why.

I wanted to see if I could build something that didn't have these problems — where the LLM's role was constrained to making a choice from a fixed menu, and actual computation always ran in deterministic Python.

### Why build this instead of using an existing tool

Tools like Pandas AI, LlamaIndex data agents, or LangChain CSV loaders all have some version of the same issue — at some point, the LLM generates code. I wanted to understand the alternative approach from first principles, not wrap someone else's implementation.

This was also a learning project. I hadn't built a production-style FastAPI backend before, hadn't used LangGraph, hadn't built a Next.js app from scratch with JWT auth. Picking one existing tool to wrap would have taught me much less.

---

## 3. Architecture

### High-level flow

```
Browser (Next.js 16)
    │
    │  HTTPS + Bearer JWT (signed by NextAuth.js)
    ▼
FastAPI Backend
    │
    ├─ Routes (HTTP boundary only — no business logic)
    │
    ├─ Service layer (one service per domain)
    │       │
    │       ├─ LLM planners (Groq primary → Ollama fallback)
    │       ├─ Pandas operations
    │       ├─ SQLAlchemy (for user databases)
    │       └─ statsmodels / scikit-learn
    │
    └─ Storage
            ├─ Local filesystem (uploads, reports, dashboards, connections)
            └─ SQLite WAL (LangGraph agent session checkpoints)
```

### The core pattern: LLM as a router, not an executor

Every AI-powered feature follows the same structure:

```
User input
    │
    ▼
LLM (Groq or Ollama)
    │  produces a small JSON object from a fixed allowlist
    ▼
Pydantic validation
    │  rejects anything not in the schema
    ▼
Deterministic service function
    │  executes the validated plan using real code
    ▼
Result
```

The LLM never sees the data. It only picks which operation to run and which columns to use. A concrete example — when a user asks "what's the average revenue by region?":

```json
{"operation": "groupby_sum", "column": "revenue", "group_by": "region"}
```

That's the entire LLM output. Pydantic validates that `operation` is in the `Operation` enum and that `column` is a string. Then `AnalyticsService` runs:

```python
df.groupby(plan.group_by)[plan.column].sum().sort_values(ascending=False)
```

This is testable without an LLM. The same question always produces the same computation for the same data.

### Three-layer backend

```
app/api/routes/       — FastAPI routers
                        Only: request parsing, auth checking, HTTP error mapping
                        Never: pandas, SQLAlchemy, business logic

app/services/         — All business logic lives here
                        One service per domain (35 files)

app/schemas/          — Pydantic models
                        Every request/response goes through a typed model
                        No raw dict crosses a service boundary
```

The reason for this strict separation: when I started adding Phase 9 (agent) on top of Phases 1–8 that already existed, none of the service code needed to change. The agent just called the same services through a tool registry wrapper. If business logic had been in routes, I would have needed to duplicate or refactor a lot.

### Agent layer (LangGraph StateGraph)

The agent can chain multiple tools in one request. A user can ask "analyse my sales data, find the top regions, chart them, and explain any anomalies" — and the agent handles the sequencing.

```
START → planner → verifier ──(explain only)──────────────────► aggregator → END
                      │                                               ▲
                      └──► executor ──(done)────────────────────────-┤
                               │                                      │
                               ├──(crud preview)──► approval_gate    │
                               │                        │             │
                               │               (approved/rejected)    │
                               │                        │             │
                               └──(tool error)─► recovery ──────────-┘
                                                    (max retries exceeded)
```

Each node does one thing:
- **planner** — asks the LLM to produce a list of tool calls in order
- **verifier** — validates tool names, checks complexity limits, enforces that `crud_execute` can only follow `crud_preview`
- **executor** — runs one tool at a time, appends result to state
- **approval_gate** — calls LangGraph's `interrupt()` to suspend the session and wait for the user to approve or reject a write operation
- **recovery** — if a tool fails, asks the LLM to replan the remaining steps; stops after `max_retries=2`
- **aggregator** — builds a final answer string from all completed results

State is a `TypedDict` checkpointed to SQLite after every node. This means a session waiting at `approval_gate` can be resumed in any future HTTP request using the `session_id`.

### Authentication

- Frontend: NextAuth.js v4 with Google OAuth
- On sign-in, NextAuth signs a HS256 JWT with a separate `BACKEND_JWT_SECRET`
- Every API request sends this as a Bearer token
- Backend validates `iss`, `aud`, `jti`, and `exp` on every request
- `owner_sub` (Google's stable user identifier) is written onto every resource at creation time — never from the request body
- Resources owned by a different user return 404, not 403 (avoids leaking that a resource exists)

---

## 4. Features

### Data input

- Upload CSV and Excel files (up to 50MB, validated before processing)
- Connect to SQLite, PostgreSQL, or MySQL directly from the app
- Database passwords stored Fernet-encrypted (AES-128-CBC + HMAC-SHA256) before hitting disk
- Register individual tables as datasets — they appear alongside uploaded files everywhere

### Natural language queries

Ten operations are supported, selectable by the LLM:

| Operation | Example question |
|---|---|
| `row_count` | "How many orders are there?" |
| `column_count` | "How many columns does this have?" |
| `sum` | "What's the total revenue?" |
| `average` | "What's the average order value?" |
| `max` / `min` | "What's the highest price?" |
| `groupby_sum` | "Total revenue by region" |
| `groupby_count` | "Number of orders by category" |
| `top_n` | "Top 10 customers by spend" |
| `xy_select` | "Show me price vs quantity" |

The LLM is constrained to pick from this list. It cannot invent a new operation or produce code.

### SQL pushdown

When a question is asked against a database-backed dataset, the system checks whether it can push the query down to the database instead of loading data into Pandas:

```python
# AnalyticsService.analyze()
if (
    metadata.source == DatasetSource.DATABASE
    and self._sql_executor
    and self._sql_executor.supports(plan.operation)
):
    result = await run_in_threadpool(self._sql_executor.execute, metadata, plan)
```

The SQL is built from a validated `QueryPlan` using SQLAlchemy `Column` objects — no string formatting. A `test_sql_pushdown_parity.py` suite asserts that for every supported operation, the SQL path and the Pandas path return identical results against the same data.

### Forecasting

Accepts questions like "forecast monthly revenue for the next 6 months" or "find anomalies in daily orders". The LLM parses which columns and horizon to use. The actual forecasting is pure statistics:

| Priority | Model | When |
|---|---|---|
| 1 | Holt-Winters ETS (statsmodels) | Series has ≥ 2× seasonal periods |
| 2 | Holt-Winters (non-seasonal) | Series has ≥ 4 points |
| 3 | Linear OLS (NumPy) | Series has ≥ 3 points |
| 4 | Naïve (last value) | Always available as fallback |

The response includes `method_used` and `fallback_used` so the caller always knows which model ran. Confidence intervals are `±1.96σ` of residuals — a fixed formula.

### Anomaly detection

Runs multiple methods in parallel, each with a different sensitivity profile:

- IQR (interquartile range): straightforward outlier detection
- Z-score: catches extreme deviations from the mean
- IsolationForest (scikit-learn): tree-based, good at multi-dimensional anomalies
- Seasonal decomposition: removes trend and seasonality before flagging residuals

### Safe CRUD

Database writes require an explicit confirmation step. The flow:

1. User states the operation ("delete all orders from 2020")
2. System previews: counts affected rows, shows a before-image, issues a signed HMAC-SHA256 token binding the exact operation and filter
3. User confirms
4. System executes inside a transaction, capturing a pre-image snapshot for rollback
5. Rollback is available within a configurable TTL (default 1 hour)

The HMAC token prevents the confirmation from being reused for a different operation. A token for "delete from orders where year=2020, 847 rows" will fail verification if the row count or filter has changed.

### AI agent

Chains multiple tools in one request using a LangGraph StateGraph. Available tools:

- Dataset preview
- Analytics query
- Chart generation
- Forecasting
- Anomaly detection
- AI insights
- Root cause analysis
- Recommendations
- PDF report generation
- CRUD preview / execute

CRUD tools require human approval before execution. The session suspends and waits, even across HTTP connections — the checkpoint is in SQLite.

### Dashboard builder

Drag-and-drop dashboard editor using react-grid-layout v2. Choose from 5 templates (Executive, Sales, Operations, Marketing, Financial), customize the prompt, and the system generates a layout with KPI cards and charts. Dashboards can be saved, listed, and reopened.

### Data quality profiling

Per-dataset quality analysis that runs on the raw Pandas DataFrame (no LLM involved):

- Completeness: percentage of non-null values per column
- Uniqueness: duplicate row detection
- Validity: type consistency, outlier rate per column
- Consistency: cross-column rule checks
- Weighted score (A–F grade) and prioritised recommendations

### KPI monitoring

Automatic KPI selection from numeric columns, z-score based alerting (|z| ≥ 2 = warning, |z| ≥ 3 = critical), SVG sparklines, Plotly trend chart with ±2σ bands, and a timeline of alerts with severity levels.

### PDF report generation

ReportLab-based PDF with dataset summary, column statistics, distribution charts, group-by breakdowns, and optional forecast sections. Core sections are deterministic — the same data always produces the same PDF. AI narrative sections are generated on request.

---

## 5. Technology Stack

### Backend

| Package | Version | Purpose |
|---|---|---|
| FastAPI | 0.136.3 | HTTP framework |
| Uvicorn | ≥0.34 | ASGI server |
| Pydantic | 2.13.4 | Schema validation (v2 throughout) |
| pydantic-settings | ≥2.7 | Config from environment variables |
| httpx | ≥0.27 | Async HTTP client for LLM calls |
| LangGraph | 1.2.4 | Agent StateGraph + checkpointing |
| langgraph-checkpoint-sqlite | ≥1.0 | SQLite WAL for session persistence |
| Pandas | 3.0.3 | Data operations |
| NumPy | ≥2.1 | Numerical operations |
| statsmodels | ≥0.14 | Holt-Winters, STL, OLS |
| scikit-learn | ≥1.4 | IsolationForest anomaly detection |
| SQLAlchemy | ≥2.0 (Core) | Database connectivity and pushdown |
| psycopg3 | — | PostgreSQL driver |
| PyMySQL | — | MySQL driver |
| cryptography | ≥42 | Fernet encryption for credentials |
| ReportLab | ≥4.2 | PDF generation |
| Kaleido | — | Plotly figure to PNG for PDFs |

### Frontend

| Package | Version | Purpose |
|---|---|---|
| Next.js | 16.2.7 | App Router, server components |
| React | 19.0.0 | UI |
| TypeScript | 5.7.3 | Types |
| next-auth | 4.24.14 | Google OAuth + JWT |
| @tanstack/react-query | 5.64.2 | Data fetching, cache invalidation |
| framer-motion | 12.15.0 | Animations |
| react-grid-layout | 2.2.3 | Dashboard drag-and-drop |
| @xyflow/react | 12.11.0 | Agent workflow graph |
| Plotly.js | — | Chart rendering (specs built server-side) |
| Tailwind CSS | ≥3.4 | Styling |

### Infrastructure (current)

| Service | Usage |
|---|---|
| Render | Backend hosting (single web service) |
| Vercel | Frontend hosting |
| Google Cloud | OAuth credentials |
| Groq | Primary LLM API (llama-3.1-8b) |
| Ollama (local) | Fallback LLM (llama3) |

---

## 6. Setup Instructions

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Groq API key](https://console.groq.com/) (free tier is enough) **or** [Ollama](https://ollama.com/) running locally
- If using Ollama: `ollama pull llama3` (~4.7 GB one-time download)
- Google Cloud project with OAuth 2.0 credentials ([guide](https://developers.google.com/identity/protocols/oauth2))

### Backend setup

```bash
git clone https://github.com/hiteshkgowda/universal-data-assistant.git
cd universal-data-assistant

python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

Create `.env` in the project root:

```env
# LLM
LLM_PROVIDER=groq                  # or "ollama"
GROQ_API_KEY=gsk_...               # skip if using ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
OLLAMA_TIMEOUT_SECONDS=180         # llama3 cold start can be slow

# Auth — these two must match between frontend and backend
BACKEND_JWT_SECRET=<long random string>
FRONTEND_URL=http://localhost:3000

# Encryption — generate once, don't lose this
DB_ENCRYPTION_KEY=
# Generate with:
# python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# CRUD
CRUD_SECRET_KEY=<long random string>   # for HMAC confirmation tokens

# Tuning (optional)
DB_MAX_ROWS=25000
DB_PUSHDOWN_ENABLED=true
AGENT_MAX_TOOL_CALLS=10
AGENT_MAX_RETRIES=2
```

Start the backend:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`.

### Frontend setup

```bash
cd frontend-next
npm install
```

Create `frontend-next/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<long random string>

# Google OAuth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# Must match the backend
BACKEND_JWT_SECRET=<same value as backend>
```

In Google Cloud Console, add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI.

Start the frontend:

```bash
npm run dev
```

Open `http://localhost:3000`.

### Running tests

```bash
# From project root, with venv active
pytest tests/ -v
```

180 tests across 16 modules. All pass cleanly (one test file has a collection error due to a refactored internal function — tracked in tech debt).

---

## 7. Design Decisions

### The QueryPlan constraint

The central decision that shaped everything else: the LLM is never allowed to generate code or access data. It only selects from a typed, validated operation schema.

```python
class Operation(str, Enum):
    ROW_COUNT = "row_count"
    SUM = "sum"
    AVERAGE = "average"
    MAX = "max"
    MIN = "min"
    GROUPBY_SUM = "groupby_sum"
    GROUPBY_COUNT = "groupby_count"
    TOP_N = "top_n"
    XY_SELECT = "xy_select"
    COLUMN_COUNT = "column_count"

class QueryPlan(BaseModel):
    model_config = {"extra": "forbid"}  # rejects any field not in the schema
    operation: Operation
    column: Optional[str] = None
    group_by: Optional[str] = None
    n: Optional[int] = Field(default=None, ge=1)
```

`extra = "forbid"` means if the LLM tries to add a field like `"execute": "os.system(...)"`, Pydantic raises a validation error. Column names from the plan are used as dictionary keys to look up real DataFrame columns — never string-interpolated into code. There's no code path where LLM text reaches an interpreter.

The tradeoff: this approach limits what the system can answer. It can't run arbitrary custom aggregations. If a user asks something the 10 operations don't cover, the LLM either maps it to the closest operation (sometimes incorrectly) or returns a plan that fails validation. A fully code-generating approach would handle more question types. I consider that an acceptable tradeoff for correctness guarantees.

This same pattern is applied across every AI feature: `ForecastPlan`, `CrudPlan`, `list[PlannedToolCall]` — everything the LLM produces goes through Pydantic before anything acts on it.

### Why LangGraph for the agent

When I got to Phase 9, I needed: multi-step execution, session state across HTTP calls, a way to pause and wait for human approval on writes, automatic replanning on failures, and a plan validation step before running anything.

I initially tried building this as a hand-rolled async state machine. The problem was checkpointing. To suspend an agent session (waiting for CRUD approval), save it to disk, and resume it when the user responds — you need to serialize the entire in-flight state. Doing that correctly for arbitrary Python objects is a lot of infrastructure.

LangGraph's `AsyncSqliteSaver` handles this. The `AgentState` TypedDict is serialized after every node. `interrupt()` suspends the graph, returns the current state to the HTTP caller, and `Command(resume=value)` picks it back up. The session ID is the only thing the HTTP caller needs to resume.

Using `TypedDict` rather than a Pydantic model for `AgentState` was deliberate: LangGraph's checkpointer needs plain JSON-serializable dicts. Pydantic models would work but add a serialization lifecycle I didn't want to manage inside the graph.

### Forecasting model chain

The naive approach would be to ask the LLM to forecast. That gives non-deterministic results — the same data on different days can produce different forecasts, which makes the feature unreliable for anything important.

The alternative: a fixed preference order of statistical models, each tried in sequence until one succeeds.

```python
def forecast_series(series, horizon, frequency):
    if len(series) >= 2 * seasonal_periods:
        try:
            return _holt_winters_seasonal(series, horizon, frequency)
        except Exception:
            pass
    if len(series) >= 4:
        try:
            return _holt_winters(series, horizon, frequency)
        except Exception:
            pass
    if len(series) >= 3:
        return _linear_ols(series, horizon)
    return _naive(series, horizon)
```

The LLM's only role is parsing the question — extracting the target column, date column, frequency, and horizon. It doesn't produce forecast values.

The tradeoff: limited to the methods in the chain. A user with complex seasonal patterns and an unusual frequency (lunar cycles, fiscal quarters) might get worse results than a proper ML pipeline would give. For a general-purpose tool aimed at non-technical users, I think Holt-Winters covers the majority of useful cases.

### CRUD confirmation flow

Any write operation (INSERT, UPDATE, DELETE) requires explicit user confirmation. I didn't want to implement this as a simple "are you sure?" prompt that could be bypassed or replayed. The mechanism:

1. `CrudValidator.preview()` counts affected rows, builds a before-image, and issues an HMAC-SHA256 token:
   ```python
   payload = {
       "connection_id": ...,
       "operation": plan.operation.value,
       "table_name": plan.table_name,
       "filter_hash": hash(filters),
       "affected_rows": count,
       "iat": int(time.time()),
   }
   token = hmac_sign(payload, crud_secret_key)
   ```

2. The token is returned to the frontend and displayed alongside the preview.

3. When the user approves, the token is submitted with the execute request.

4. `CrudExecutor` verifies the token before running any DML. If the filter, operation, or row count has changed since the preview, verification fails.

This means a confirmation can't be reused for a different operation, and replaying an old token fails once the row count changes. It's not a perfect security mechanism (the token doesn't bind to the user's session), but it's better than no binding at all.

Before any DML runs, a row-level pre-image snapshot is written to disk. Rollback replays compensating operations from this snapshot.

### SQL injection prevention

The system touches SQL in four places. Each has a different prevention mechanism:

| Layer | Mechanism |
|---|---|
| NL analytics | LLM → `QueryPlan.operation` enum → `table.c[column_name]` → SQLAlchemy expression |
| CRUD planning | LLM → `CrudPlan` model → `table.c[name]` column lookup → bound parameter |
| CRUD execution | `engine.begin()` with `table.insert()/update()/delete()` — no raw SQL |
| Schema discovery | `SQLAlchemy inspect()` API only — `SELECT 1` is the only literal SQL |

Column names from the LLM are used as dictionary keys (`table.c["column_name"]`) — they're never formatted into a string. If the column doesn't exist, `KeyError` is raised before any SQL is generated. The `_WRITE_DENYLIST` in `CrudValidator` blocks writes to columns named `password`, `token`, `api_key`, etc., regardless of what the LLM produces.

### Single shared `httpx.AsyncClient`

Creating a new HTTP client per LLM request would waste connections. One client is created in FastAPI's `lifespan` context manager and injected into all planners at startup:

```python
@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    client = httpx.AsyncClient(timeout=settings.ollama_timeout_seconds)
    for planner in (query_planner, forecast_planner, crud_planner, agent_planner):
        if hasattr(planner, "set_client"):
            planner.set_client(client)
    try:
        yield
    finally:
        await client.aclose()
```

The tradeoff: the timeout is global. Groq calls typically take 1–3 seconds; Ollama cold starts can take 60+ seconds. A single timeout serves both poorly. A per-provider client with different timeouts would be better and isn't complicated to add.

### Groq → Ollama fallback

Every planner follows the same pattern:

```python
class FallbackQueryPlanner:
    def __init__(self, primary: GroqQueryPlanner, secondary: OllamaQueryPlanner):
        ...

    async def generate_plan(self, ...):
        try:
            return await self._primary.generate_plan(...)
        except LLMError:
            return await self._secondary.generate_plan(...)
```

If Groq is unavailable, rate-limited, or returns a malformed response, the request retries against the local Ollama instance. If both fail, `LLMError` propagates to the route and returns 503. The fallback is wired at startup and is invisible to the rest of the application.

The `FallbackQueryPlanner`, `FallbackForecastPlanner`, `FallbackCrudPlanner`, and `FallbackAgentPlanner` are four copies of nearly identical code. This is the most obvious refactoring opportunity in the codebase — a `Generic[T]` wrapper class would reduce four classes to one.

### Frontend: server-built Plotly specs

Charts are Plotly figures, but the JSON spec is built entirely on the server in Python:

```python
# VisualizationService — runs on the backend
def _build_bar_chart(df, x_col, y_col):
    return {
        "data": [{"type": "bar", "x": df[x_col].tolist(), "y": df[y_col].tolist()}],
        "layout": {...},
    }
```

The frontend receives this JSON and renders it. This means:
- Chart generation is testable without a browser
- The LLM cannot hallucinate a data point into a chart (the data comes from the DataFrame)
- Switching from Plotly to another charting library only requires changing the backend builder

### Next.js App Router patterns

A few decisions specific to the frontend:

**TanStack Query v5 over SWR or Redux:** TanStack Query's mutation API with `onSuccess`/`onError` callbacks matches the "fire a request, show loading, show result" pattern that every workspace uses. SWR works but has less control over cache invalidation. Redux would have been overkill.

**Note on TanStack Query v5:** `useQuery` in v5 dropped `onSuccess`/`onError` callbacks (they only work on `useMutation` now). I hit this when porting from an earlier pattern and had to switch to `useEffect` watching the query state. Worth knowing if you're on v4 and upgrading.

**Server components for pages:** Pages are server components that `await params` and render the shell. The interactive workspace (where data fetching happens) is a `"use client"` component. This follows Next.js 16's `params: Promise<{ id: string }>` pattern — params are now async.

**react-grid-layout v2:** The dashboard drag-and-drop uses `react-grid-layout`. Version 2 completely restructured the API — flat props (`cols`, `rowHeight`) moved into `gridConfig`, `dragConfig`, and `resizeConfig` sub-objects. This wasn't documented anywhere obvious; I found it by reading the `.d.ts` files in `node_modules`. Something to watch for if you're upgrading from v1.

---

## 8. Limitations

These are documented honestly because they reflect real architectural decisions, not oversights.

### Single-worker only

The FastAPI server must run as a single process (`--workers 1`). The reason: LangGraph agent sessions are checkpointed to a SQLite file (`agent_sessions/sessions.db`). SQLite in WAL mode handles concurrent reads well, but concurrent writes from multiple OS processes will corrupt the file.

This also means all in-process caches (the LRU DataFrame cache, the TTL caches for data quality and KPI monitor results) are not shared across instances. A second worker would have a cold cache and couldn't see checkpointed sessions from the first.

Fix path: migrate agent sessions to LangGraph's `PostgresSaver`. This change is confined to a few lines in `app/main.py` — no service code needs to change. Once SQLite is out, `--workers` can be increased and horizontal scaling becomes straightforward.

### Ephemeral file storage

On Render's free tier, the filesystem is ephemeral — all uploaded files, saved reports, dashboards, and connection records are lost on redeploy. A banner in the UI warns users about this.

Fix path: add a storage adapter interface with an S3/R2 implementation. The services already use path-based abstraction; the swap doesn't require changing business logic.

### No rate limiting

There is currently no per-user throttle on any endpoint. A single user can run a 50,000-row anomaly detection in a tight loop and hold the worker thread for minutes, blocking everyone else.

`slowapi` (a FastAPI-compatible rate limiting library) would be the minimal fix. Heavier traffic would need an upstream rate limit at Nginx or Cloudflare.

### No mobile layout

The sidebar + topbar + main content layout is designed for desktop (≥ 1024px). On smaller screens the layout breaks. This wasn't a priority since data analysis on a phone isn't a primary use case, but it's a gap.

### No streaming responses

LLM calls buffer the full response before returning it. Report generation with AI sections can take 30–120 seconds and holds the HTTP connection open for the full duration. Server-Sent Events (SSE) would let the frontend show incremental progress.

### LLM error messages expose internal details

If both Groq and Ollama fail, the error message can include the Groq API URL, model name, and HTTP status from Groq's response. In a shared deployment this exposes topology. These should be sanitised to a generic "LLM unavailable" message in non-development environments.

### The 10-operation limit

Natural language analytics is capped at 10 operations. Real data analysis often needs things this doesn't cover: percentile aggregations, rolling averages, period-over-period comparisons, cohort analysis, multi-condition filters. Adding operations is straightforward (add an enum value, add a Pandas dispatch case, write a test) but each one is scope and test surface.

### In-memory cache doesn't survive restarts

The LRU cache for DataFrames and the TTL caches for analysis results are in-process. A server restart clears them. The first request after a restart always re-reads from disk and re-computes. For the free tier this happens frequently.

---

## 9. Future Improvements

Ordered roughly by how much they'd matter vs. how much work they'd take:

**Short-term, high value:**

- Rate limiting (`slowapi` middleware) — this should have been in from day one
- Structured logging (JSON log lines with correlation IDs) — currently using plain `print()` statements and basic `logging` which makes production debugging painful
- Pagination on list endpoints (datasets, reports, audit log) — currently returns everything for a user; will become a problem at scale
- GitHub Actions CI — the tests exist but don't run automatically on push
- Export query results to CSV/Excel — basic feature that users expect

**Medium-term:**

- PostgreSQL agent session storage — removes the single-worker constraint
- S3/R2 storage adapter — removes ephemeral disk dependency
- Background task queue for long jobs — report generation blocks the HTTP connection for up to 2 minutes; moving it to a background worker with a polling endpoint would fix this
- SSE streaming for agent runs — right now the UI shows a spinner for the full duration; incremental progress updates would feel much better

**Longer-term architectural changes:**

- Team workspaces with RBAC — currently all resources are per-user with no sharing. This would require a significant schema change (`owner_sub` → `workspace_id` + `role`)
- SAML/OIDC SSO in addition to Google OAuth
- More analytics operations: percentile, rolling average, period-over-period change, running total, multi-condition filters. These are additive and don't break anything.
- Multi-dataset joins — the current architecture treats datasets as isolated. Joins would require a different query model.
- OpenTelemetry instrumentation — traces and metrics would make it much easier to understand where time goes in multi-step agent runs

---

## 10. Screenshots

> Screenshots to be added — the app is functional, visual documentation is pending.

Key views to be documented:

- Home page with dataset grid and upload zone
- Dataset detail with metadata panel and quick actions
- Ask Data workspace with conversation thread and chart
- Forecast workspace with chart and model confidence bands
- Agent workspace with session list, timeline, and flow graph
- Dashboard builder with drag-and-drop grid
- Data quality dashboard with score ring and column health table
- KPI monitoring dashboard with alert timeline

---

## 11. Deployment

### Current deployment

| Component | Platform | Notes |
|---|---|---|
| Backend | Render (Web Service) | Single worker, ephemeral disk |
| Frontend | Vercel | Standard Next.js deployment |
| LLM | Groq Cloud API | Fallback to Ollama if unreachable |
| Auth | Google OAuth via NextAuth | Redirect URI must match deployment URL |

### Backend environment variables for deployment

```env
# Required
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
BACKEND_JWT_SECRET=<long random string — must match FRONTEND env>
FRONTEND_URL=https://your-frontend.vercel.app
DB_ENCRYPTION_KEY=<Fernet key — do not change after first deploy>
CRUD_SECRET_KEY=<long random string>

# Optional
OLLAMA_BASE_URL=http://...   # if you have an Ollama instance available as fallback
DB_MAX_ROWS=25000
AGENT_MAX_TOOL_CALLS=10
```

### Frontend environment variables for deployment

```env
NEXT_PUBLIC_BACKEND_URL=https://your-backend.render.com
NEXTAUTH_URL=https://your-frontend.vercel.app
NEXTAUTH_SECRET=<long random string>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
BACKEND_JWT_SECRET=<same value as backend>
```

### Render configuration

`render.yaml` in the repo root handles backend deployment. Key settings:

```yaml
startCommand: "cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1"
```

`--workers 1` is required while agent sessions use SQLite. See the Limitations section.

The startup command also runs `StorageManager.ensure_dirs()` which creates all required directories (`uploads/`, `reports/`, etc.) if they don't exist. On Render's ephemeral disk, these are recreated on every deploy.

### Notes on the free tier

Render's free web service spins down after 15 minutes of inactivity and takes ~30 seconds to cold-start. The first request after a cold start will also hit an Ollama timeout (if Ollama is used), since that model also needs to load. Using Groq helps here — it has no cold start.

Render's free disk is ephemeral. Every deploy wipes uploaded files, saved reports, and dashboards. The UI shows a warning banner when the server is in ephemeral mode (`STORAGE_EPHEMERAL=true`).

To run without losing data between deploys, you need either a persistent Render disk ($7/month) or an S3/R2 storage adapter (not yet implemented — see Future Improvements).

---

## Contributing

Open an issue before starting significant work — I'd rather discuss the approach first.

```bash
# Backend
ruff check backend/
mypy backend/app
pytest tests/ -v

# Frontend
cd frontend-next
npx tsc --noEmit
npm run lint
```

---

## License

[MIT](LICENSE)

---

Built by **Hitesh K Gowda**  
[GitHub](https://github.com/hiteshkgowda) · [hiteshkgowda56@gmail.com](mailto:hiteshkgowda56@gmail.com)
