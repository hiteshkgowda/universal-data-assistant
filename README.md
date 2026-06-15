# DataPilot AI

A full-stack web application that lets users upload data, connect to databases, and ask questions in plain English. The backend answers using deterministic code — the LLM picks what to run, not how to run it.

Built solo over roughly 16 incremental phases, starting with a Streamlit proof-of-concept and ending with a Next.js frontend, a LangGraph agent, and around 35,000 lines of code across Python and TypeScript.

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
10. [Deployment](#10-deployment)
11. [Interview Guide](#11-interview-guide)

---

## 1. Project Overview

DataPilot AI is a data analysis tool that sits between a raw dataset and a useful answer. You upload a CSV, connect a Postgres database, or point it at an Excel file — then ask questions in plain English. The system figures out what operation to run, executes it, and returns a result with a chart.

Beyond basic queries it can:
- Forecast time series using a statistical model chain
- Run anomaly detection across multiple methods
- Decompose period-over-period metric changes into contributing dimensions (root cause analysis)
- Generate AI insights and language-polished recommendations from statistical findings
- Execute safe database writes with a human confirmation step
- Chain multiple analysis steps together through an AI agent
- Build and save dashboards from a drag-and-drop editor with templates and public sharing
- Monitor KPIs automatically with z-score alerting and sparklines
- Profile dataset quality with an A–F grade and prioritised fixes
- Browse the full schema of every connected dataset in a structured Data Catalog
- Get board-level Executive Briefings that combine KPI status, AI insights, and recommendations
- Track and replay every query in a searchable Query History
- Save, name, and reuse queries from a Saved Queries library
- Configure threshold-based Alerts that fire when KPI values cross set bounds
- Explain AI agent decisions step-by-step with an Explainability panel
- Remember conversation context across requests within a session

The project started because I wanted to understand what it actually takes to build an LLM-backed tool that gives correct, reproducible answers — not just something that looks like it works.

**Numbers at a glance:**
- 90+ Python files in the backend application layer (~12,000 lines)
- 140+ TypeScript/TSX files in the frontend (~20,000 lines)
- 20 API route modules
- 35+ backend service files
- 180 tests across 16 test modules
- 16 development phases completed

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
            └─ SQLite WAL (LangGraph agent session checkpoints + conversation memory)
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
                        One service per domain (35+ files)

app/schemas/          — Pydantic models
                        Every request/response goes through a typed model
                        No raw dict crosses a service boundary
```

The reason for this strict separation: when I started adding Phase 9 (agent) on top of Phases 1–8 that already existed, none of the service code needed to change. The agent just called the same services through a tool registry wrapper. If business logic had been in routes, I would have needed to duplicate or refactor a lot.

### Two-layer analysis pattern

Most of the AI features (insights, root cause, recommendations) share the same internal structure:

```
1. Deterministic statistical engine  →  structured findings (no LLM, no hallucination risk)
2. LLM reasoning layer               →  natural language narrative grounded in the findings
3. Statistical fallback              →  if the LLM fails, fall back to the findings directly
```

The LLM receives only the structured output from step 1. Its system prompt explicitly forbids referencing facts not present in the findings JSON. Temperature is set to 0.1.

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
- Test a connection before saving it — the app pings the database and returns success/failure
- Browse available tables in a connected database, then register individual tables as datasets
- Registered tables appear alongside uploaded files everywhere in the app

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
if (
    metadata.source == DatasetSource.DATABASE
    and self._sql_executor
    and self._sql_executor.supports(plan.operation)
):
    result = await run_in_threadpool(self._sql_executor.execute, metadata, plan)
```

The SQL is built from a validated `QueryPlan` using SQLAlchemy `Column` objects — no string formatting. A `test_sql_pushdown_parity.py` suite asserts that for every supported operation, the SQL path and the Pandas path return identical results against the same data.

### Forecasting

Accepts questions like "forecast monthly revenue for the next 6 months". The LLM parses which columns and horizon to use. The actual forecasting is pure statistics:

| Priority | Model | When |
|---|---|---|
| 1 | Holt-Winters ETS (statsmodels) | Series has ≥ 2× seasonal periods |
| 2 | Holt-Winters (non-seasonal) | Series has ≥ 4 points |
| 3 | Linear OLS (NumPy) | Series has ≥ 3 points |
| 4 | Naïve (last value) | Always available as fallback |

The response includes `method_used` and `fallback_used` so the caller always knows which model ran. Confidence intervals are `±1.96σ` of residuals — a fixed formula.

### Anomaly detection

Runs multiple methods in parallel, each with a different sensitivity profile:

- **IQR** (interquartile range) — straightforward outlier detection, good for skewed distributions
- **Z-score** — catches extreme deviations from the mean
- **IsolationForest** (scikit-learn) — tree-based, works well across multiple columns
- **Seasonal decomposition** — removes trend and seasonality before flagging residuals, good for time-series data

### Root cause analysis

Given a question like "why did revenue drop in Q4?", the engine:

1. Detects the metric column (`revenue`) and period column (`date`, `quarter`, etc.) from the question and schema
2. Resolves two periods — current (more recent) vs previous (baseline) — from the data
3. For each dimension column (region, product, segment, channel, category), computes per-cell period-over-period change
4. Scores each dimension/value pair by contribution: `cell_change / |total_change| * 100`
5. Ranks contributors and passes the top findings to an LLM for natural-language narrative

The LLM can only reference facts in the `RCAFindings` struct. If it fails, the service falls back to a fully deterministic response built directly from the contribution scores.

### AI insights

After running a query, users can ask the system to explain what the results mean. The pipeline:

1. `InsightStatEngine` runs deterministic analysis: column stats (mean, median, std, p25/p75), trend detection via linear regression, Pearson correlation pairs above a threshold, period-over-period growth patterns
2. `InsightAgent` receives the structured `StatisticalFindings` and generates natural language: summary, key insights with specific numbers, trend descriptions, top/bottom performers, and recommendations
3. If the LLM fails or returns unparseable JSON, `InsightAgent._fallback_from_findings()` generates the same fields directly from the stats — zero LLM involvement, zero hallucination risk

Results are cached by SHA-256(dataset\_id + question + table fingerprint) with a 5-minute TTL.

### Recommendations engine

Takes any combination of anomaly results, insight results, and forecast results for a dataset and produces prioritised, actionable recommendations. Two tiers:

1. **Rule engine** — deterministic; derives every recommendation from observed data facts. Categories: `anomaly`, `insight`, `forecast`, `cross_signal`
   - `cross_signal` escalation: if the same metric is flagged by two or more independent sources (e.g. anomaly detection AND forecast decline), the recommendation is promoted to `critical` priority
2. **LLM polish layer** — `RecommendationAgent` rewrites the `action`, `reason`, and `expected_impact` fields for conciseness and business tone. It cannot change priority, category, or any numbers — only reword what's already there. Falls back to the rule engine output if the LLM fails.

### KPI monitoring

Automatic KPI selection from numeric columns, z-score alerting (`|z| ≥ 2` = warning, `|z| ≥ 3` = critical), SVG sparklines per column, Plotly trend chart with ±2σ bands, and a timeline of threshold breach events with severity levels. No LLM involved — all deterministic.

### Data quality profiling

Per-dataset quality analysis that runs on the raw Pandas DataFrame — no LLM involved:

- **Completeness** — percentage of non-null values per column
- **Uniqueness** — duplicate row detection
- **Validity** — IQR-based outlier rate per numeric column, type consistency
- **Consistency** — cross-column rule checks
- Weighted A–F grade and prioritised recommendations sorted by impact

### Executive Briefing

A board-level summary page (`/briefing`) that assembles four signals simultaneously for any selected dataset:

1. **KPI strip** — all monitored KPIs with current value, change %, health status, and overall health badge
2. **AI Executive Summary** — LLM narrative grounded in statistical findings from the Insights engine
3. **Risks panel** — critical and high-severity KPI alerts with optional root cause analysis on demand
4. **Opportunities panel** — trend list from Insights + strategic opportunities from Recommendations; optional Forecast Outlook section

All four sections fire in parallel when the user clicks "Generate Briefing". RCA and Forecast are on-demand buttons to avoid unnecessary LLM calls. If any section fails independently, the others still render.

### Data Catalog

A schema browser (`/catalog`) for every dataset the user owns — both uploaded files and registered database tables:

- Column name, inferred data type, nullable flag, and sample distinct values
- Table-level stats: row count, column count, estimated size
- For database-backed tables: primary keys, foreign key relationships, and index information surfaced via SQLAlchemy `inspect()`
- Search and filter across all tables and columns
- Expandable column detail view showing value distributions for low-cardinality columns

### Alert Center

Threshold-based alerting (`/alerts`) on KPI values:

- Define alerts by dataset, metric column, operator (`>`, `<`, `≥`, `≤`, `=`), and threshold value
- Alert history with severity badges, timestamps, and status (active / acknowledged / resolved)
- Alerts stored locally per session and evaluated against live KPI monitor results
- Severity auto-assigned based on how far the value deviates from the threshold

### Query History

A searchable log (`/history`) of every query, forecast, anomaly, insight, and recommendation the user has run:

- Full question, answer, and chart data stored per turn via the Conversational Memory service
- Search by keyword across question text
- Re-run any past query with one click — reinjects the original question into the workspace
- Grouped by date for easier browsing

### Saved Queries

A personal library (`/saved-queries`) for storing and reusing queries:

- Save any query with a custom name and optional description
- Backend persistence via `SavedQueryStore` (filesystem JSON, atomic writes)
- List, search, edit name/description, and delete saved queries
- Load a saved query directly into the Ask workspace

### Dashboard builder

Drag-and-drop dashboard editor using react-grid-layout v2:

- Choose from 5 templates (Executive, Sales, Operations, Marketing, Financial)
- Template gallery with previews — each template pre-populates a prompt and layout
- Customize the prompt, and the system generates a layout with KPI cards and charts
- Resize and reposition tiles freely on the grid
- Save dashboards with a name; list and reopen saved dashboards
- **Public sharing** — generate a signed share token; anyone with the link can view the dashboard at `/dashboards/shared/[token]` without logging in

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

CRUD tools require human approval before execution. The session suspends via LangGraph `interrupt()` and waits — even across HTTP connections, because state is checkpointed to SQLite after every graph node.

### Agent Trace viewer

A graph visualisation (`/agents/trace`) of agent session execution:

- Node-by-node breakdown of what each graph step did
- Tool call inputs and outputs per node
- Error and recovery events shown inline
- Powered by `@xyflow/react` — the graph layout mirrors the actual LangGraph state machine

### Explainability panel

An on-demand drawer in the query workspace that explains how the AI arrived at a result:

- Shows the raw `QueryPlan` JSON the LLM produced
- Lists the Pydantic validation steps and any fields that were defaulted or rejected
- Displays which statistical operation ran and the exact column names used
- For insight/recommendation results: shows the `StatisticalFindings` that were passed to the LLM

### Safe CRUD

Database writes require an explicit confirmation step. The flow:

1. User states the operation ("delete all orders from 2020")
2. System previews: counts affected rows, shows a before-image, issues a signed HMAC-SHA256 token binding the exact operation and filter
3. User confirms
4. System executes inside a transaction, capturing a pre-image snapshot for rollback
5. Rollback is available within a configurable TTL (default 1 hour)
6. Every mutation is written to a JSONL audit log keyed by `connection_id`

The HMAC token prevents the confirmation from being reused for a different operation. A token for "delete from orders where year=2020, 847 rows" will fail verification if the row count or filter has changed since the preview.

The `CrudValidator` also maintains a `_WRITE_DENYLIST` — column names matching `password`, `token`, `api_key`, and similar are blocked from appearing in `set_values` regardless of what the LLM produces.

### PDF report generation

ReportLab-based PDF with dataset summary, column statistics, distribution charts, group-by breakdowns, and optional forecast sections. The core sections are deterministic — the same data always produces the same PDF. AI narrative sections are generated on request and fall back gracefully if the LLM is unavailable.

### Conversational memory

Each workspace session has a conversation history that persists across requests. The system uses a two-layer store:

- **L1 — in-process TTLCache** (`SessionMemory`): fast reads, 5-minute TTL, capped at a configurable number of sessions
- **L2 — SQLite WAL** (`ConversationStore`): durable storage, fire-and-forget writes that never block the response path

Every successful API call (query, forecast, anomaly, root cause, insights, recommendations) records a turn with the question, answer, and any table/chart data. The memory API exposes `GET /memory/context` for retrieving a session's full history and `DELETE /memory/clear` for wiping one. Sessions are scoped to the authenticated user.

The agent planner uses the conversation history as context: past turns are formatted into `conversation_history` and injected into the planner's system prompt, so the agent can follow up on previous analysis without the user re-stating context.

### Rate limiting

All compute-heavy endpoints are rate-limited via `slowapi`:

- Authenticated users (valid Bearer JWT): **100 requests / hour**, keyed by JWT `sub`
- Anonymous or invalid-token requests: **20 requests / hour**, keyed by client IP

The limit applies to analytics queries, forecasts, anomaly detection, insights, root cause analysis, recommendations, KPI monitor, data quality, and agent runs. Static endpoints (dataset list, connection list) are not limited.

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
| slowapi | — | Per-user rate limiting |
| PyJWT | — | JWT validation |

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
| @xyflow/react | 12.11.0 | Agent workflow graph visualisation |
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
cd universal-data-assistant  # repository directory name unchanged

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
OLLAMA_TIMEOUT_SECONDS=180

# Auth — these two must match between frontend and backend
BACKEND_JWT_SECRET=<long random string>
FRONTEND_URL=http://localhost:3000

# Encryption — generate once, don't lose this
DB_ENCRYPTION_KEY=
# Generate with:
# python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# CRUD
CRUD_SECRET_KEY=<long random string>

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

In Google Cloud Console, add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI and `http://localhost:3000` as an authorised JavaScript origin.

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

180 tests across 16 modules.

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

### Two-layer analysis for insight features

Insights, root cause analysis, and recommendations all use the same internal structure:

1. A deterministic statistical engine runs first, producing a typed findings struct
2. An LLM reasoning layer receives only those findings and generates natural language
3. A statistical fallback generates the same output format from the findings struct directly — no LLM

This means these features degrade gracefully rather than failing. If Groq and Ollama are both down, the user still gets a correct (if less fluent) response grounded in real statistics. The LLM adds quality, not correctness.

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

### CRUD confirmation flow

Any write operation (INSERT, UPDATE, DELETE) requires explicit user confirmation. The mechanism:

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

2. When the user approves, the token is submitted with the execute request.

3. `CrudExecutor` verifies the token before running any DML. If the filter, operation, or row count has changed since the preview, verification fails.

This means a confirmation can't be reused for a different operation, and replaying an old token fails once the row count changes.

### SQL injection prevention

The system touches SQL in four places. Each has a different prevention mechanism:

| Layer | Mechanism |
|---|---|
| NL analytics | LLM → `QueryPlan.operation` enum → `table.c[column_name]` → SQLAlchemy expression |
| CRUD planning | LLM → `CrudPlan` model → `table.c[name]` column lookup → bound parameter |
| CRUD execution | `engine.begin()` with `table.insert()/update()/delete()` — no raw SQL |
| Schema discovery | `SQLAlchemy inspect()` API only — `SELECT 1` is the only literal SQL |

Column names from the LLM are used as dictionary keys (`table.c["column_name"]`) — they're never formatted into a string. If the column doesn't exist, `KeyError` is raised before any SQL is generated.

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

### Groq → Ollama fallback

Every planner has a `Fallback` variant that tries the primary provider and retries Ollama on `LLMError`. The try/except and `set_client` delegation are shared through a `_Fallback` base:

```python
class _Fallback:
    def __init__(self, primary, secondary):
        self._primary = primary
        self._secondary = secondary

    def set_client(self, client):
        for p in (self._primary, self._secondary):
            if hasattr(p, "set_client"):
                p.set_client(client)

    async def _try(self, method, *args):
        try:
            return await getattr(self._primary, method)(*args)
        except LLMError as exc:
            logger.warning("Primary planner failed (%s); falling back.", exc)
            return await getattr(self._secondary, method)(*args)
```

If Groq is unavailable, rate-limited, or returns a malformed response, the request retries against Ollama. If both fail, `LLMError` propagates to the route and returns 503.

### Frontend: server-built Plotly specs

Charts are Plotly figures, but the JSON spec is built entirely on the server in Python:

```python
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

**TanStack Query v5 over SWR or Redux:** TanStack Query's mutation API with `onSuccess`/`onError` callbacks matches the "fire a request, show loading, show result" pattern that every workspace uses.

**Note on TanStack Query v5:** `useQuery` in v5 dropped `onSuccess`/`onError` callbacks (they only work on `useMutation` now). I hit this when porting from an earlier pattern and had to switch to `useEffect` watching the query state.

**Server components for pages:** Pages are server components that `await params` and render the shell. The interactive workspace (where data fetching happens) is a `"use client"` component. This follows Next.js 16's `params: Promise<{ id: string }>` pattern — params are now async.

**react-grid-layout v2:** Version 2 completely restructured the API — flat props (`cols`, `rowHeight`) moved into `gridConfig`, `dragConfig`, and `resizeConfig` sub-objects. This wasn't documented anywhere obvious; I found it by reading the `.d.ts` files in `node_modules`.

---

## 8. Limitations

### Single-worker only

The FastAPI server must run as a single process (`--workers 1`). The reason: LangGraph agent sessions are checkpointed to a SQLite file (`agent_sessions/sessions.db`). SQLite in WAL mode handles concurrent reads well, but concurrent writes from multiple OS processes will corrupt the file.

Fix path: migrate agent sessions to LangGraph's `PostgresSaver`. This change is confined to a few lines in `app/main.py` — no service code needs to change.

### Ephemeral file storage

On Render's free tier, the filesystem is ephemeral — all uploaded files, saved reports, dashboards, and connection records are lost on redeploy. A banner in the UI warns users about this.

Fix path: add a storage adapter interface with an S3/R2 implementation. The services already use path-based abstraction; the swap doesn't require changing business logic.

### No mobile layout

The sidebar + topbar + main content layout is designed for desktop (≥ 1024px). On smaller screens the layout breaks.

### No streaming responses

LLM calls buffer the full response before returning it. Report generation with AI sections can take 30–120 seconds and holds the HTTP connection open for the full duration. Server-Sent Events (SSE) would let the frontend show incremental progress.

### The 10-operation limit

Natural language analytics is capped at 10 operations. Real data analysis often needs things this doesn't cover: percentile aggregations, rolling averages, period-over-period comparisons, cohort analysis, multi-condition filters. Adding operations is straightforward (add an enum value, add a Pandas dispatch case, write a test) but each one is scope and test surface.

### In-memory cache doesn't survive restarts

The LRU cache for DataFrames and the TTL caches for analysis results are in-process. A server restart clears them. The first request after a restart always re-reads from disk and re-computes.

---

## 9. Future Improvements

**Short-term, high value:**

- Structured logging (JSON log lines with correlation IDs) — currently using plain `logging` which makes production debugging harder
- Pagination on list endpoints (datasets, reports, audit log) — currently returns everything for a user
- GitHub Actions CI — the tests exist but don't run automatically on push
- Export query results to CSV/Excel — basic feature that users expect
- Sanitise LLM error messages in production — don't expose provider URLs or model names

**Medium-term:**

- PostgreSQL agent session storage — removes the single-worker constraint
- S3/R2 storage adapter — removes ephemeral disk dependency
- Background task queue for long jobs — report generation blocks the HTTP connection for up to 2 minutes
- SSE streaming for agent runs — incremental progress updates instead of a full-duration spinner

**Longer-term architectural changes:**

- Team workspaces with RBAC — currently all resources are per-user with no sharing. This would require a significant schema change (`owner_sub` → `workspace_id` + `role`)
- SAML/OIDC SSO in addition to Google OAuth
- More analytics operations: percentile, rolling average, period-over-period change, running total, multi-condition filters
- Multi-dataset joins — the current architecture treats datasets as isolated
- OpenTelemetry instrumentation — traces and metrics for multi-step agent runs

---

## 10. Deployment

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
OLLAMA_BASE_URL=http://...
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

`render.yaml` in the repo root handles backend deployment:

```yaml
startCommand: "cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1"
```

`--workers 1` is required while agent sessions use SQLite. See Limitations.

---

## 11. Interview Guide

This section answers the questions that come up most often when discussing this project in technical interviews. Each answer is written to be spoken, not read — keep it conversational and cut it short if the interviewer signals they've heard enough.

---

### "Walk me through the system."

Start with the problem: most "ask your data" tools let the LLM write Python and `exec()` it. That's untestable, exploitable, and produces non-reproducible answers. I wanted to build something where the LLM's role was strictly constrained.

The solution: the LLM acts as a router, not an executor. It reads the user's question and the dataset schema and produces a small JSON object — something like `{"operation": "groupby_sum", "column": "revenue", "group_by": "region"}`. Pydantic validates that JSON against a typed schema with `extra="forbid"`. If it passes, deterministic Python executes it against the data using Pandas or SQLAlchemy. The LLM never touches the data, never writes code, and never produces the answer directly.

This pattern repeats across every feature: `QueryPlan` for queries, `ForecastPlan` for forecasting, `CrudPlan` for database writes, `list[PlannedToolCall]` for the agent. Every LLM output passes through Pydantic before anything acts on it.

The stack is FastAPI + Pandas/SQLAlchemy on the backend, Next.js 16 with TanStack Query on the frontend, and LangGraph for the multi-step agent. Authentication is Google OAuth via NextAuth.js — the frontend signs a HS256 JWT that the backend validates on every request.

---

### "Why not just let the LLM write SQL or Pandas?"

Three reasons:

**Testability.** With a fixed operation schema, I can write `test_groupby_sum_returns_correct_total()` and it passes or fails deterministically. If the LLM generated code, I'd be testing the LLM's behaviour, not my code.

**Security.** `exec()` in a web app means the LLM can write `import os; os.system("rm -rf /")` and you'd run it. My approach has no code path where LLM output reaches an interpreter.

**Reproducibility.** The same question on the same data should give the same answer every time. LLM-generated code varies by run, temperature, and model version. My approach is deterministic: Pydantic rejects invalid plans before they execute, and every plan that passes runs the same Python.

The tradeoff is capability: I'm limited to 10 operations. I can't answer arbitrary questions. I think that's fine for a general-purpose tool — the 10 operations cover the majority of exploratory analysis questions. And adding a new operation is safe: add an enum value, add a dispatch case, write a test.

---

### "How does the agent work?"

It's a LangGraph StateGraph with six nodes: planner, verifier, executor, approval\_gate, recovery, and aggregator.

The planner asks the LLM to produce a sequence of tool calls — things like `[{tool: "analytics_query", args: {...}}, {tool: "chart", args: {...}}]`. The verifier checks that every tool name is in the allowed registry and enforces one hard rule: `crud_execute` can only appear after `crud_preview` in the same plan. The executor runs tools one at a time and appends results to the shared state.

If a tool fails, the recovery node asks the LLM to replan the remaining steps, up to two retries. If a CRUD preview comes back, the graph suspends at `approval_gate` using LangGraph's `interrupt()` — the HTTP call returns, the session is serialized to SQLite, and the user is shown the affected rows. When they approve, a new HTTP request resumes the graph from exactly where it stopped using the same session ID.

The `AgentState` is a `TypedDict`, not a Pydantic model — deliberately, because LangGraph's SQLite saver needs plain JSON-serializable dicts.

---

### "How do you prevent SQL injection?"

Four places where SQL is involved, each with a different approach:

For natural language queries against databases, the LLM produces a `QueryPlan` with an `operation` enum value and column names as strings. Those column names are used as dictionary keys against `table.c["column_name"]` — they're looked up, not formatted into a string. If the column doesn't exist, it's a `KeyError` before any SQL is generated. SQLAlchemy builds the expression tree from real column objects, and the driver handles all parameterisation.

For CRUD operations, same principle — `CrudPlan` column names go through `table.c[name]` lookups. All values go through SQLAlchemy's bound parameter mechanism. No string formatting anywhere near SQL.

For schema discovery, I use `SQLAlchemy inspect()` — it's an introspection API, not raw SQL. The only literal SQL in the entire codebase is `SELECT 1` for a connection health check.

---

### "How does authentication work?"

NextAuth.js handles the Google OAuth flow on the frontend. When a user signs in with Google, NextAuth's JWT callback fires and mints a separate HS256 token signed with `BACKEND_JWT_SECRET`. That token includes the user's Google `sub` (stable user ID), email, name, and a UUID `jti` for replay prevention. It expires in 15 minutes.

Every API call from the frontend sends this as a `Bearer` token. The FastAPI `get_current_user` dependency validates `iss`, `aud`, `jti`, and `exp`. If any check fails, it returns 401.

Every resource (datasets, reports, connections, saved queries, dashboards) is stamped with `owner_sub` at creation time — taken from the validated JWT, never from the request body. If you request a resource owned by a different user, you get 404, not 403. The 404 means you can't even confirm that the resource exists.

---

### "How do you handle LLM failures?"

Three layers.

First, the Groq → Ollama fallback. Every planner has a `_Fallback` wrapper that catches `LLMError` from the primary provider and retries against Ollama. If both fail, it raises and the route returns 503.

Second, the statistical fallback for insight features. For insights, root cause analysis, and recommendations, there's a two-step pipeline: deterministic statistical engine first, then LLM narrative. If the LLM fails or returns JSON that doesn't parse, the `_fallback_from_findings()` method generates the same output fields directly from the statistical findings struct. The user gets a correct, grounded response — less fluent, but not wrong.

Third, the agent recovery node. If a tool call inside the agent fails, the recovery node asks the LLM to replan the remaining steps. It retries up to two times. If it still can't recover, the session fails gracefully with a message listing what completed and what didn't.

---

### "What would you do differently?"

A few things:

**PostgreSQL for agent sessions from the start.** Using SQLite for LangGraph checkpoints means I'm locked to one worker. Swapping to `PostgresSaver` is a few lines of code change, but it affects the deployment model. I'd make that choice earlier.

**Structured logging with correlation IDs.** Right now I'm using plain Python `logging`. In production, when a multi-step agent run fails, I can't easily trace a single request through all six graph nodes. JSON log lines with a shared `request_id` would make this much easier.

**SSE for long-running operations.** Report generation and multi-step agent runs can take 30–120 seconds. The HTTP connection stays open the whole time and the frontend shows a spinner. Server-Sent Events would let me push incremental progress updates — "Step 3 of 6: generating forecast…" — which would feel much better.

**More operation types earlier.** Adding operations to the `Operation` enum is the lowest-risk work in the system: one enum value, one dispatch case, one test. I was conservative about it early on, but in hindsight I could have added percentile, rolling average, and period-over-period sooner without meaningful risk.

---

### "How does the Executive Briefing page work?"

It's a good example of how composition beats a dedicated endpoint. There's no `/briefing` backend route. The page makes four parallel API calls when the user clicks Generate:

1. KPI monitor — fully deterministic, fires on dataset selection before the user even clicks Generate
2. Insights — LLM narrative grounded in statistical findings
3. Recommendations — rule engine + LLM polish layer
4. Forecast and RCA are on-demand buttons to avoid unnecessary LLM calls

Each section renders independently as its data arrives. If one fails, the others still show. The page never has a single "loading" state — it's four independent sections each with their own loading skeleton.

The only frontend-specific logic is filtering: risks panel shows only critical/high alerts from KPI data; opportunities panel shows only `insight`, `forecast`, and `cross_signal` recommendations from the recommendations response. Everything else is handled by the existing services that every other page uses.

---

### "Why did you use TanStack Query v5?"

For the mutation pattern mostly. Every workspace page follows the same cycle: user triggers an action, show loading, show result or error. TanStack Query's `useMutation` with `onSuccess`/`onError` callbacks matches this exactly. SWR's mutation support is weaker. Redux would have been overkill for what's essentially request state.

One thing worth knowing about v5 specifically: they removed `onSuccess`/`onError` from `useQuery` (they still work on `useMutation`). If you have code from v4 that watches query results in `onSuccess`, you have to move that logic into a `useEffect` watching `query.data`. I hit this and had to refactor a few components.

---

### "How does the data catalog work?"

The catalog service walks every dataset the user owns — both uploaded files (CSV/Excel) and registered database tables. For file-backed datasets it reads the Pandas dtype map. For database-backed datasets it uses `SQLAlchemy inspect()` to pull column metadata: name, type, nullable, default, primary key flag.

For database tables it also surfaces foreign key relationships and index information. The frontend groups these into a schema tree per dataset. There's a search that filters across all table names and column names simultaneously.

The interesting design point: the catalog has no new backend service. It reuses `DatasetService.get_metadata()` for file datasets and `ConnectionService.inspect_table()` for database tables. The catalog route is essentially a join across two existing services with no new business logic.

---

### "What's the hardest part you built?"

The CRUD confirmation flow and the agent recovery together.

CRUD is hard because of the HMAC token design. The token binds the operation, filter hash, and affected row count at preview time. If the user waits five minutes, someone else inserts rows, and then confirms — the row count has changed and verification fails. That's the right behaviour (they should re-preview), but getting the token payload right so it's tight enough to catch changes but loose enough not to be fragile required a few iterations.

The agent recovery is hard because the LLM has to replan given a partial execution history. It knows which tools ran, what they returned, and which one failed. It needs to produce a revised plan for the remaining steps that doesn't re-run completed work and accounts for what's already in state. Getting the system prompt for the recovery node right — giving the LLM enough context to replan without confusing it with too much state — took significant iteration.

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
