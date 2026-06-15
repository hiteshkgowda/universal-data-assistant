# Architecture Overview

This document describes how the system is structured, why it's structured that way, and where the key decision points are.

---

## High-level overview

```
Browser (Next.js 16)
    │
    │  HTTPS + Bearer JWT
    ▼
FastAPI backend
    │
    ├── Service layer (one service per domain)
    │       │
    │       ├── LLM calls (Groq → Ollama fallback)
    │       ├── Pandas operations
    │       ├── SQLAlchemy (for user databases)
    │       └── statsmodels / scikit-learn
    │
    └── Storage
            ├── Filesystem (uploads, reports, dashboards, connections)
            └── SQLite WAL (agent session checkpoints)
```

---

## Key architectural decision: the LLM never runs code

Every feature that uses an LLM follows the same pattern:

```
User input → LLM → structured JSON plan → Pydantic validation → deterministic service → result
```

The LLM picks what to do (which operation, which columns, which model). Python code does the actual work. This means:

- Results are reproducible for the same input
- Wrong LLM output fails at validation, not silently
- Every operation can be tested independently of the model
- Swapping the LLM provider doesn't change anything downstream

This applies to: queries, chart generation, forecasting, CRUD, dashboard building, anomaly detection, and the agent planner.

---

## Layers

### API layer (`backend/app/api/`)

FastAPI routers. Each router handles request parsing, JWT auth checking, dependency injection, and HTTP error mapping. No business logic lives here.

Routes are grouped by feature: `datasets.py`, `query.py`, `chart.py`, `forecast.py`, `reports.py`, `connections.py`, `crud.py`, `agent.py`, `data_quality.py`, `kpi_monitor.py`.

### Service layer (`backend/app/services/`)

One service per domain. Services own all business logic, LLM calls, and data operations. A route file never imports pandas or SQLAlchemy directly.

| Service | What it owns |
|---|---|
| `DatasetService` | File storage, DataFrame cache, metadata read/write |
| `AnalyticsService` | NL → QueryPlan → Pandas or SQL pushdown |
| `VisualizationService` | QueryPlan → Plotly chart spec |
| `ForecastService` | NL → ForecastPlan → statsmodels |
| `ReportService` | PDF assembly via ReportLab |
| `ConnectionService` | DB engine pool, schema discovery, credential encryption |
| `CrudService` | Planner → validator → executor pipeline |
| `AgentOrchestrator` | LangGraph graph facade |
| `DataQualityService` | Column profiling, scoring, recommendations |
| `KPIMonitorService` | KPI selection, z-score alerting, sparklines |

### Schema layer (`backend/app/schemas/`)

Pydantic models for every request and response. No raw `dict` crosses a service boundary.

### Core (`backend/app/core/`)

- `config.py` — all settings via `pydantic-settings`, read from environment variables
- `cache.py` — `LRUCache` (bounded size) and `TTLCache` (time-expiring) implementations
- `crypto.py` — Fernet encryption/decryption for stored credentials
- `exceptions.py` — domain exception hierarchy; routes map these to HTTP status codes

---

## Agent layer

The agent is a LangGraph `StateGraph` with 6 nodes:

```
START → planner → verifier ──(explain only)──────────► aggregator → END
                      │                                      ▲
                      └──► executor ──(done)─────────────────┤
                               │                             │
                               ├──(crud preview)──► approval_gate
                               │                        │   │
                               │               (approved)   (rejected)
                               │                        │
                               └──(error)──► recovery ◄─┘
                                                │
                                         (exhausted)──► aggregator
```

Each node has a single responsibility:
- **planner**: calls the LLM, gets back a list of tool calls
- **verifier**: validates tool names, complexity limits, sequencing rules; routes explain-only requests to aggregator
- **executor**: runs one tool at a time, appends result to state
- **approval_gate**: calls `interrupt()` to suspend the graph; resumes when the user confirms or cancels
- **recovery**: calls the LLM to replan remaining steps after a failure; gives up after `max_retries`
- **aggregator**: builds the final answer string from all results

State is a `TypedDict` serialised to SQLite after every node, so a suspended session can be resumed in any future HTTP request using the `session_id`.

---

## Auth

- Frontend: NextAuth.js with Google OAuth
- On sign-in, NextAuth signs a HS256 JWT with `BACKEND_JWT_SECRET`
- Every API request includes this JWT as a Bearer token
- Backend validates `iss`, `aud`, `jti`, and `exp` on every request
- `owner_sub` (Google's stable user ID) is stamped onto every resource at creation time and never comes from the request body

Resources owned by a different user return 404, not 403, to avoid leaking that a resource exists.

---

## Storage

The app uses the local filesystem as its primary store, with JSON files for structured metadata:

```
uploads/          ← raw file bytes + DatasetMetadata JSON per file
reports/          ← PDF bytes + ReportMetadata JSON per report
connections/      ← ConnectionRecord JSON (password Fernet-encrypted)
dashboards/       ← DashboardConfig JSON per saved dashboard
crud_audit/       ← append-only JSONL per connection
crud_rollback/    ← pre-image row snapshots (JSON, TTL-expired)
agent_sessions/   ← sessions.db (SQLite WAL, LangGraph checkpoint schema)
```

This works fine for a single-server setup. The main drawback is that horizontal scaling (multiple instances) requires a shared volume, and Render's free tier uses an ephemeral disk that's wiped on redeploy.

The path to fixing this: S3/R2 for blobs, PostgreSQL for metadata, and LangGraph's `PostgresSaver` for agent sessions. The service interfaces are already abstracted enough that this swap doesn't require rewriting business logic.

---

## LLM provider chain

```
Request → FallbackXxxPlanner
              │
              ├── try: GroqXxxPlanner (cloud, fast)
              │
              └── except LLMError: OllamaXxxPlanner (local, slower)
```

If both fail, `LLMError` propagates to the route and returns a 503. The fallback is wired at startup in `dependencies.py` and is invisible to the calling service.

---

## Frontend

Next.js 16 App Router. Key patterns:

- **Server components** for page shells and metadata
- **Client components** for interactive workspaces (marked `"use client"`)
- **TanStack Query v5** for all data fetching — mutations and queries with cache invalidation
- **`params: Promise<{ id: string }>`** pattern for async route params (Next.js 16 requirement)
- **`@xyflow/react`** for the agent workflow graph visualisation
- **`react-grid-layout` v2** for the dashboard drag-and-drop builder

All Plotly chart specs are built server-side and sent as JSON. The browser renders the spec but never computes the data. This prevents chart hallucinations and makes chart generation testable in isolation.

---

## Caching

Two cache types are used:

- **`LRUCache`** — bounded size, evicts least-recently-used. Used for DataFrames in `DatasetService` (max 8 entries).
- **`TTLCache`** — time-based expiry. Used for data quality and KPI monitor results per dataset (keyed by SHA-256 of dataset ID).

Both are in-process. A multi-worker deployment would need a shared cache (Redis) to avoid cache misses on cross-worker requests. This is the main reason the backend currently runs `--workers 1`.

---

## Known scaling ceiling

The system is designed for a single server, single worker. The constraints that enforce this:

1. `agent_sessions/sessions.db` is a SQLite file — multiple OS processes writing to it concurrently will corrupt it
2. In-process LRU/TTL caches are not shared across workers
3. Filesystem storage assumes a single mount point

None of these are design flaws that require a rewrite. They're tradeoffs that made sense for building a working system solo. The fix path for each is known and documented in `SYSTEM_AUDIT.md`.
