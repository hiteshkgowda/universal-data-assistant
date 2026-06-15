# Universal Data Assistant — System Audit
> Generated: 2026-06-12 | Auditor: automated codebase analysis

---

## 1. Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                              │
│  Next.js 16 App Router — Vercel                                      │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Pages/UI   │  │  apiFetch()  │  │  SessionSync │               │
│  │  (React)    │  │  (client.ts) │  │  (auth-token)│               │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                │                  │                        │
│  ┌──────▼────────────────▼──────────────────▼───────────────────┐   │
│  │            NextAuth.js v4 (Google OAuth)                      │   │
│  │  Signs HS256 JWT with BACKEND_JWT_SECRET (15m TTL)            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │  HTTPS + Bearer JWT
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend — Render                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  CORSMiddleware  │  JWT Auth  │  HexId Path Validation       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  /api/v1/                                                            │
│  ┌──────────┐ ┌───────┐ ┌───────┐ ┌──────────┐ ┌────────────┐     │
│  │ datasets │ │ query │ │ chart │ │ forecast │ │  reports   │     │
│  └────┬─────┘ └───┬───┘ └───┬───┘ └────┬─────┘ └─────┬──────┘     │
│       │           │         │           │              │             │
│  ┌────▼───────────▼─────────▼───────────▼──────────────▼───────┐   │
│  │                    Service Layer                              │   │
│  │  DatasetService │ AnalyticsService │ ForecastService         │   │
│  │  ConnectionService │ ReportService │ CrudService             │   │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │                    LLM Provider Layer                          │  │
│  │   FallbackQueryPlanner  │  FallbackForecastPlanner            │  │
│  │   FallbackCrudPlanner   │  FallbackAgentPlanner               │  │
│  │   Primary: GroqXxxPlanner  → Secondary: OllamaXxxPlanner      │  │
│  └───────────┬───────────────────────────────┬────────────────────┘  │
│              │                               │                       │
│              ▼                               ▼                       │
│   ┌──────────────────┐            ┌──────────────────┐              │
│   │  Groq Cloud API  │            │  Ollama (local)  │              │
│   │  llama-3.1-8b    │            │  llama3          │              │
│   └──────────────────┘            └──────────────────┘              │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Storage Layer                             │    │
│  │  uploads/  reports/  connections/  crud_audit/              │    │
│  │  crud_rollback/  agent_sessions/sessions.db (SQLite WAL)    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Interaction Diagram

```
User                 Frontend              Backend              LLM (Groq)
 │                      │                     │                     │
 │── "show me trends" ──▶│                     │                     │
 │                      │── POST /agent/run ──▶│                     │
 │                      │  {goal, dataset_id}  │                     │
 │                      │                     │── generate_plan() ──▶│
 │                      │                     │                     │
 │                      │                     │◀── JSON plan ────────│
 │                      │                     │  {type:"plan",       │
 │                      │                     │   steps:[...]}       │
 │                      │                     │                      │
 │                      │                     │ ┌──────────────────┐ │
 │                      │                     │ │  Agent Graph     │ │
 │                      │                     │ │  (LangGraph)     │ │
 │                      │                     │ │                  │ │
 │                      │                     │ │ step 1: query ───│─┤→ AnalyticsService
 │                      │                     │ │ step 2: chart ───│─┤→ VisualizationService
 │                      │                     │ │ step 3: report ──│─┤→ ReportService
 │                      │                     │ └──────────────────┘ │
 │                      │                     │                      │
 │                      │         ┌───────────┴──────────────┐       │
 │                      │         │ CRUD step? (interrupts)  │       │
 │                      │         │ Checkpointed in SQLite   │       │
 │                      │         └───────────┬──────────────┘       │
 │                      │                     │                      │
 │                      │◀── 200 {needs_approval, session_id} ───────│
 │◀── "Approve delete?" ┤                     │                      │
 │                      │                     │                      │
 │── "Approve" ─────────▶│                     │                      │
 │                      │── POST /agent/resume/{session_id} ─────────▶│
 │                      │  {confirmation_token}│                     │
 │                      │                     │── replan() if needed ▶│
 │                      │                     │◀─ revised plan ───────│
 │                      │                     │                      │
 │                      │◀────── 200 {results, steps_completed} ──────│
 │◀── Final results ────┤                     │                      │
```

**Agent State Machine:**
```
NEW ──▶ PLANNING ──▶ EXECUTING ──▶ AWAITING_APPROVAL ──▶ RESUMING ──▶ COMPLETE
                                                                    └──▶ FAILED
```

**Fallback & Retry:**
```
Tool Fails ──▶ replan() ──▶ Revised steps (up to agent_max_retries=2)
LLM Fails  ──▶ Groq LLMError ──▶ Ollama fallback ──▶ raise if both fail
```

---

## 3. Database Schema Diagram

> The application uses **filesystem as its primary database** (no relational DB for app state).
> User-facing databases are external connections managed by ConnectionService.

### Application Data (Filesystem)

```
uploads/
├── {hex32}.csv / {hex32}.xlsx       ← raw file bytes
└── {hex32}.json                     ← DatasetMetadata
    ┌──────────────────────────────────────────────────────┐
    │  DatasetMetadata                                     │
    │  ─────────────                                       │
    │  dataset_id:      str (32-char hex)  [PK]            │
    │  filename:        str                                 │
    │  size_bytes:      int                                 │
    │  row_count:       int                                 │
    │  column_count:    int                                 │
    │  columns:         list[ColumnMeta]                   │
    │  source:          "upload" | "connection"            │
    │  connection_id:   str | None                         │
    │  table_name:      str | None                         │
    │  owner_sub:       str  (Google sub)                  │
    │  created_at:      datetime                           │
    └──────────────────────────────────────────────────────┘

connections/
└── {hex32}.json                     ← ConnectionRecord
    ┌──────────────────────────────────────────────────────┐
    │  ConnectionRecord                                    │
    │  ────────────────                                    │
    │  connection_id:   str (32-char hex)  [PK]            │
    │  name:            str                                 │
    │  db_type:         "postgresql"|"mysql"|"sqlite"      │
    │  host:            str | None                         │
    │  port:            int | None                         │
    │  database:        str                                 │
    │  username:        str | None                         │
    │  password:        str (Fernet-encrypted)             │
    │  owner_sub:       str                                 │
    │  created_at:      datetime                           │
    └──────────────────────────────────────────────────────┘

reports/
├── {hex32}.pdf                      ← PDF bytes
└── {hex32}.json                     ← ReportMetadata
    ┌──────────────────────────────────────────────────────┐
    │  ReportMetadata                                      │
    │  ──────────────                                      │
    │  report_id:                   str (32-char hex) [PK] │
    │  dataset_id:                  str                    │
    │  dataset_filename:            str                    │
    │  generated_at:                datetime               │
    │  size_bytes:                  int                    │
    │  deterministic_section_count: int                    │
    │  ai_section_count:            int                    │
    │  owner_sub:                   str                    │
    └──────────────────────────────────────────────────────┘

crud_audit/
└── {connection_id}.jsonl            ← append-only audit entries
    ┌──────────────────────────────────────────────────────┐
    │  AuditEntry (per line)                               │
    │  ──────────                                          │
    │  timestamp, user_sub, user_email                     │
    │  operation, table_name, connection_id                │
    │  affected_row_count, filters, values_set             │
    └──────────────────────────────────────────────────────┘

crud_rollback/
└── {token}.jsonl                    ← pre-image row snapshots

agent_sessions/
└── sessions.db                      ← SQLite WAL
    ┌──────────────────────────────────────────────────────┐
    │  (LangGraph AsyncSqliteSaver schema)                 │
    │  checkpoints: thread_id, checkpoint_id, data        │
    │  writes:      thread_id, task_id, idx, channel, val │
    └──────────────────────────────────────────────────────┘
```

---

## 4. API Dependency Map

```
Route                         → Service(s)                   → External
─────────────────────────────────────────────────────────────────────────
POST /datasets/upload/csv     → DatasetService               → filesystem
POST /datasets/upload/excel   → DatasetService               → filesystem
GET  /datasets                → DatasetService               → filesystem
GET  /datasets/{id}/preview   → DatasetService               → filesystem

POST /query                   → AnalyticsService             → LLM + filesystem
                                └─ DatasetService
                                └─ QueryPlanner (Groq/Ollama)
                                └─ SqlExecutor (pushdown)    → User DB

POST /chart                   → VisualizationService         → LLM + filesystem
                                └─ AnalyticsService

POST /forecast                → ForecastService              → LLM + filesystem
                                └─ DatasetService
                                └─ ForecastPlanner (Groq/Ollama)
                                └─ statsmodels

POST /reports                 → ReportService                → LLM + filesystem
                                └─ AnalyticsService
                                └─ VisualizationService
                                └─ ForecastService (optional)
                                └─ ReportLab + Kaleido

GET  /reports/{id}/download   → ReportService (file read)    → filesystem

POST /connections             → ConnectionService            → filesystem + crypto
DELETE /connections/{id}      → ConnectionService            → filesystem
POST /connections/{id}/test   → ConnectionService            → User DB
GET  /connections/{id}/tables → ConnectionService            → User DB

POST /crud/preview            → CrudService                  → LLM + User DB
                                └─ CrudPlanner (Groq/Ollama)
                                └─ CrudValidator
                                └─ ConnectionService
POST /crud/execute            → CrudService                  → User DB + filesystem
                                └─ CrudExecutor
                                └─ AuditLogger
POST /crud/rollback           → CrudService                  → User DB
GET  /crud/audit/{conn_id}    → CrudService (audit read)     → filesystem

POST /agent/run               → AgentOrchestrator            → LLM + all services
                                └─ AgentPlanner (Groq/Ollama)
                                └─ LangGraph (AsyncSqliteSaver)
                                └─ [all tools above]
POST /agent/resume/{id}       → AgentOrchestrator            → SQLite + LLM
POST /agent/explain           → AgentOrchestrator            → LLM only
GET  /agent/session/{id}      → AgentOrchestrator            → SQLite

GET  /health                  → StorageManager               → filesystem
```

---

## 5. Technical Debt Report

### High Priority

| # | Debt | Location | Effort |
|---|------|----------|--------|
| TD-1 | Filesystem as database — no atomic writes; metadata + file can desync on crash | `services/dataset_service.py`, `report_service.py` | High |
| TD-2 | No test coverage for core flows: CRUD lifecycle, ownership isolation, report generation, audit log correctness | `backend/tests/` | High |
| TD-3 | LRU cache is process-local — in multi-worker deployment, cache coherence breaks | `core/cache.py` | Medium |
| TD-4 | Per-process CRUD secret fallback — no log warning; operators won't notice token invalidity across restarts | `services/crud_validator.py:36` | Low |
| TD-5 | `backend_url` setting is a dead config field — referenced nowhere except config | `core/config.py:111` | Low |

### Medium Priority

| # | Debt | Location | Effort |
|---|------|----------|--------|
| TD-6 | `FallbackQueryPlanner` and `FallbackForecastPlanner` duplicated from `FallbackAgentPlanner` — three near-identical classes | `services/groq_provider.py`, `services/agent_planner.py` | Medium |
| TD-7 | All LLM prompt strings are defined inline in service files — no prompt versioning, no A/B testing, impossible to manage | scattered across planners | High |
| TD-8 | `DatasetService` mixes file I/O, parsing, and caching — violates single responsibility | `services/dataset_service.py` | Medium |
| TD-9 | `AnalyticsService` has 3 code paths (pandas ops, pandas fallback, SQL pushdown) with near-identical dispatch logic | `services/analytics_service.py` | Medium |
| TD-10 | Route files contain inline ownership checks — pattern duplicated across 6+ routes | `api/routes/*.py` | Low |
| TD-11 | `groq_provider.py` and `crud_planner.py` import system prompts from other modules — cross-module prompt ownership unclear | multiple files | Low |

### Low Priority

| # | Debt | Location | Effort |
|---|------|----------|--------|
| TD-12 | `backend_url` legacy field never removed | `core/config.py` | Trivial |
| TD-13 | `_STORAGE_FIELDS` tuple in config is a parallel structure to actual field declarations | `core/config.py:18` | Low |
| TD-14 | Comments like `# noqa: PLC0415` on import-inside-function pattern repeated 5+ times | `main.py`, `api/dependencies.py` | Low |
| TD-15 | `apiFetch` 401 retry calls `getSession()` on every retry — could use cached session if available | `lib/api/client.ts:64` | Low |

---

## 6. Scalability Bottlenecks

### Critical

**SB-1: Single-process SQLite for agent sessions**
- `sessions.db` is a SQLite file; WAL mode helps concurrent reads but writes are serialized
- Multi-worker deployment (beyond `--workers 1`) requires switching to PostgreSQL checkpointer
- Current Render config: `--workers 1` — safe today, blocking future scaling

**SB-2: Filesystem as object store**
- All uploads, reports, connections are local files
- Horizontal scaling (multiple instances) impossible without shared volume
- Render free tier: ephemeral — all data wiped on redeploy
- Fix path: S3/R2 for blob storage + database for metadata

**SB-3: Pandas loaded fully in-memory**
- `db_max_rows=25000` for table datasets; file datasets load entirely into RAM
- 50MB Excel × 8 cache entries = up to 400MB RAM pressure
- No streaming, no chunked reads, no columnar format
- Large datasets will OOM the Render free-tier instance (512MB RAM)

### High

**SB-4: Synchronous LLM calls block worker thread**
- All LLM calls are async (`await self._client.post(...)`) — correct
- But report generation (`POST /reports`) can take 30–120s with LLM sections
- No background task queue; client must hold connection open for full duration
- Fix: Celery/ARQ background workers + polling endpoint or websocket

**SB-5: No connection pool for HTTP client**
- Single `httpx.AsyncClient` is shared across all requests (correct)
- But client timeout is 60s — 10 concurrent LLM calls could exhaust Groq rate limits
- No circuit breaker, no bulkhead pattern

**SB-6: Schema discovery loads full table list on every request**
- `/connections/{id}/tables` runs `inspector.get_schema_names()` → `inspector.get_table_names()` per schema
- No caching; 100-table schema means 100 SQLAlchemy inspector calls per request
- Fix: cache schema discovery per connection with TTL

**SB-7: Report PDF generation blocks event loop via Kaleido**
- `kaleido` for chart-to-PNG conversion is a subprocess call
- May block the asyncio event loop if not run in executor
- Should use `asyncio.to_thread()` or `loop.run_in_executor()`

### Medium

**SB-8: No pagination on dataset list / report list / audit log**
- List endpoints return all records for a user
- 1000 reports × metadata objects = large JSON response
- Fix: cursor-based pagination on all list endpoints

**SB-9: LRU cache eviction is cold — no warm-up**
- First request after deployment always misses cache
- Free-tier cold starts add extra latency

---

## 7. Security Issues

### Severity: Medium

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| SEC-1 | `/agent/explain` does not check dataset/connection ownership | `api/routes/agent.py` | Add `_assert_resource_owner()` before planning |
| SEC-2 | `/crud/audit/{connection_id}` returns audit for any connection regardless of ownership | `api/routes/crud.py:104` | Call `connection_service.get_connection(id, owner_sub)` first |
| SEC-3 | Pre-auth datasets (empty `owner_sub`) visible to all authenticated users | `services/dataset_service.py:133` | Migrate owner on first access or force re-upload |
| SEC-4 | CRUD `per-process` secret fallback with no startup warning | `services/crud_validator.py:36` | Log `ERROR` if `CRUD_SECRET_KEY` not set in production |
| SEC-5 | No per-user upload quota — disk exhaustion via 100×50MB uploads | `api/routes/datasets.py` | Add per-user quota + rate limiting |
| SEC-6 | `row_limit` on register-table request not bounded by `db_max_rows` | `api/routes/connections.py` | Clamp at validation layer |
| SEC-7 | Agent sessions stored unencrypted in SQLite | `main.py:118` | Use encrypted SQLite or volume-level encryption |
| SEC-8 | `unsafe-eval` in CSP required by Plotly — blanket XSS exposure | `next.config.ts` | Track Plotly bundle-mode support; migrate when available |

### Severity: Low

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| SEC-9 | LLM errors expose deployment topology (Ollama/Groq URLs, model names) | `api/routes/query.py` etc. | Sanitise in non-dev mode |
| SEC-10 | Confirmation token not bound to user identity — only to plan + connection | `services/crud_validator.py` | Include `user_sub` in HMAC payload |
| SEC-11 | Agent session IDs are stable across resumptions | `services/agent_orchestrator.py` | Issue new session ID on resume |
| SEC-12 | No SQL query logging for pushdown operations | `services/sql_executor.py` | Add structured log entry per execution |
| SEC-13 | Connection pool without queue timeout — blocked requests may hang | `core/config.py` | Set `pool_timeout` + `pool_pre_ping` |

---

## 8. Missing Capabilities

### Authentication & Access Control
- **RBAC / Team support** — all resources are personal; no org/team concept
- **SSO via SAML/OIDC** — only Google OAuth; no enterprise IdP support
- **API key auth** — no machine-to-machine access (scripts, CI pipelines)
- **Column-level access control** — users see all columns of shared datasets
- **Session management** — no active session list, no remote sign-out, no device tracking

### Data Governance
- **PII detection** — no scanning of uploaded data for sensitive fields
- **Data lineage** — no tracking of which datasets fed which reports/forecasts
- **Data catalog** — no tags, descriptions, or discovery across datasets
- **Retention policy** — uploads/reports/sessions never auto-purged
- **Audit completeness** — downloads, logins, failed auth not logged

### Operational
- **Background jobs** — report generation blocks HTTP connection; no async task queue
- **Webhook notifications** — no "report ready" callbacks
- **Scheduled reports** — no cron-triggered generation
- **Export formats** — only PDF reports; no CSV/Excel export of query results
- **Rate limiting** — no per-user throttle on LLM calls, uploads, or queries
- **Cost tracking** — no per-user LLM token usage metering

### Infrastructure
- **Multi-tenancy at DB level** — data separated by filesystem ownership only
- **Horizontal scaling** — SQLite + local filesystem blocks multi-instance deployment
- **Observability** — no structured logging (plain text), no metrics, no tracing
- **Health checks beyond storage** — no LLM reachability, no external DB reachability in `/health`
- **Graceful degradation** — if Groq + Ollama both fail, entire analytics surface goes dark

### Developer Experience
- **OpenAPI spec is production-disabled** — `/openapi.json` returns 404 in prod
- **No SDK** — integrators must handcraft HTTP calls
- **No streaming responses** — LLM output is buffered; no token-by-token UI updates

---

## 9. Refactoring Opportunities

### RO-1: Unify Fallback Planner Pattern
**Current:** `FallbackQueryPlanner`, `FallbackForecastPlanner`, `FallbackAgentPlanner`, `FallbackCrudPlanner` — 4 near-identical classes with copy-pasted `try/except LLMError` logic.

**Proposed:**
```python
class FallbackPlanner(Generic[T]):
    def __init__(self, primary: T, secondary: T): ...
    async def _with_fallback(self, method: str, *args): ...
```
One generic wrapper replaces four concrete classes. ~80 lines → ~25 lines.

---

### RO-2: Extract Resource Ownership Guard
**Current:** Each route manually checks `if meta.owner_sub and meta.owner_sub != current_user.sub: raise 404`.  
Pattern duplicated across `query.py`, `chart.py`, `forecast.py`, `datasets.py`, `reports.py`, `crud.py`, `agent.py`.

**Proposed:** A dependency or service method:
```python
def assert_owner(resource_sub: str | None, current_sub: str) -> None:
    if resource_sub and resource_sub != current_sub:
        raise HTTPException(404)
```

---

### RO-3: Metadata Store Abstraction
**Current:** `DatasetService`, `ReportService`, `ConnectionService` all directly read/write JSON files on disk. Format, serialization, and path construction duplicated 3×.

**Proposed:** A `MetadataStore` protocol with a `FilesystemMetadataStore` implementation today, swappable for `PostgresMetadataStore` later without touching service code.

---

### RO-4: Prompt Registry
**Current:** LLM system prompts are string constants scattered across 6 planner files. No versioning, no centralization, no ability to A/B test.

**Proposed:** A `prompts/` module with prompt objects that carry `name`, `version`, and `content`. Services import named prompts rather than string literals.

---

### RO-5: Unify Storage Path Resolution
**Current:** Each service constructs its own paths: `self._upload_dir / f"{dataset_id}.json"`.  
**Proposed:** StorageManager as the single source of path construction:
```python
storage.dataset_meta_path(dataset_id)  # → uploads/{id}.json
storage.report_pdf_path(report_id)     # → reports/{id}.pdf
```

---

### RO-6: Replace In-Memory Cache with Injected Cache Protocol
**Current:** `functools.lru_cache` on `get_settings()` and process-level `LRUCache` objects in services. Untestable, un-evictable, breaks multi-worker.

**Proposed:** A `CacheBackend` protocol injected via DI. `InMemoryCache` for dev; `RedisCache` for production. Services don't know the difference.

---

### RO-7: Streaming LLM Responses
**Current:** All LLM calls buffer full response before returning. Report generation can take 120s.

**Proposed:** Use server-sent events (SSE) for agent runs and report generation. Frontend subscribes to event stream; shows incremental progress.

---

## 10. Recommended Implementation Order — Tier-1 Features

Priority is ordered by: **user-visible impact** × **blocking other work** ÷ **implementation effort**.

---

### Phase 1 — Reliability & Safety (implement first; low effort, high impact)

| # | Feature | Why first | Effort |
|---|---------|-----------|--------|
| P1-1 | **Audit endpoint ownership guard** (SEC-2) | Security gap; 5-line fix | XS |
| P1-2 | **Agent explain ownership guard** (SEC-1) | Security gap; 5-line fix | XS |
| P1-3 | **CRUD secret startup warning** (SEC-4/TD-4) | Silent production failure; log line + check | XS |
| P1-4 | **row_limit bounds on register-table** (SEC-6) | OOM risk; one-line clamp | XS |
| P1-5 | **Pagination on list endpoints** (SB-8) | Correctness before data grows; breaks API if added later | S |
| P1-6 | **Per-user upload quota** (SEC-5) | Disk exhaustion; middleware or service check | S |

---

### Phase 2 — Observability & Debuggability (unblock production ops)

| # | Feature | Why now | Effort |
|---|---------|---------|--------|
| P2-1 | **Structured logging** (JSON lines + correlation IDs) | Required for any production debugging | M |
| P2-2 | **Extended /health** (LLM reachability + connection pool status) | Ops teams need more than storage status | S |
| P2-3 | **SQL query logging** (SEC-12) | Audit trail for compliance | S |
| P2-4 | **Test coverage for CRUD lifecycle + ownership** (TD-2) | Prevents regressions in security-critical flows | M |

---

### Phase 3 — Performance & Scalability (unblock growth)

| # | Feature | Why now | Effort |
|---|---------|---------|--------|
| P3-1 | **Background task queue for reports** (SB-4) | Unblocks long-running jobs; essential for reliability | L |
| P3-2 | **Schema discovery caching** (SB-6) | Quick win; TTL dict in ConnectionService | S |
| P3-3 | **Metadata store abstraction** (RO-3) | Prerequisite for P3-4 | M |
| P3-4 | **PostgreSQL metadata store** | Enables horizontal scaling + atomic writes | L |
| P3-5 | **S3/R2 blob storage for uploads & reports** | Enables horizontal scaling; prerequisite for multi-instance | L |

---

### Phase 4 — Enterprise Access Control

| # | Feature | Why now | Effort |
|---|---------|---------|--------|
| P4-1 | **API key authentication** (machine-to-machine) | Unlocks programmatic integrations | M |
| P4-2 | **Team/org model** (shared datasets, RBAC roles) | Unlocks B2B use cases | XL |
| P4-3 | **SSO via OIDC/SAML** | Required by enterprise customers | L |
| P4-4 | **Column-level access control** | Compliance requirement for sensitive datasets | XL |

---

### Phase 5 — Feature Completeness

| # | Feature | Why now | Effort |
|---|---------|---------|--------|
| P5-1 | **Streaming agent responses** (SSE) | Major UX improvement for slow LLM calls | M |
| P5-2 | **Scheduled reports** | Top enterprise request | M |
| P5-3 | **Webhook notifications** | Required for async report delivery | S |
| P5-4 | **CSV/Excel export of query results** | Basic user expectation | S |
| P5-5 | **PII detection on upload** | Compliance + user trust | M |
| P5-6 | **Data retention policy & auto-purge** | Compliance + storage management | M |
| P5-7 | **LLM token usage metering** | Cost tracking for multi-tenant billing | L |
| P5-8 | **Refactor fallback planner pattern** (RO-1) | Technical debt reduction; enables testing | S |
| P5-9 | **Prompt registry** (RO-4) | Enables prompt iteration without deploys | M |

---

## Summary Scorecard

| Category | Rating | Notes |
|----------|--------|-------|
| **Core functionality** | ★★★★☆ | All features work end-to-end |
| **Security fundamentals** | ★★★☆☆ | Good foundations, 8 medium gaps |
| **Test coverage** | ★★☆☆☆ | 3 test files, core flows untested |
| **Scalability** | ★★☆☆☆ | Single-process, filesystem-bound |
| **Observability** | ★★☆☆☆ | Plain text logs, basic /health |
| **Team/org features** | ★★☆☆☆ | No RBAC, no teams, no audit completeness |
| **Code quality** | ★★★★☆ | Clean architecture, good separation |
| **Documentation** | ★★★☆☆ | Docstrings present, no runbooks |
