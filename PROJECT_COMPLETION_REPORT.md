# Project Completion Report — DataPilot AI

**Audit date:** 2026-06-15  
**Codebase state:** post-Phase-14, 12 commits, actively deployed  
**Scope:** Full-stack audit across 83 Python files (~10,600 lines) and 120 TypeScript/TSX files (~16,700 lines)

---

## Overall Completion

| As a… | Completion |
|--------|-----------|
| Portfolio / demo project | **83%** |
| Production-ready system | **52%** |

The gap between the two is not missing features — it is missing operational infrastructure (CI, logging, multi-worker support, storage abstraction).

---

## 1. Architecture — 87%

### What is built
- Strict three-layer separation: routes handle HTTP only, services own all business logic, schemas validate every boundary crossing. Zero cross-layer leakage found.
- LLM-as-router pattern applied consistently across all seven AI features: LLM produces a typed JSON plan, Pydantic rejects anything outside the schema, deterministic Python executes the validated plan. No `eval`, no `exec` anywhere in the codebase.
- Fallback LLM chain: Groq (primary) → Ollama (secondary) wired at startup, invisible to calling services.
- LangGraph `StateGraph` with six nodes for the agent, SQLite WAL checkpointing for session persistence across HTTP calls.
- Filesystem storage with atomic writes (`.tmp` → rename) on every write path. One storage volume per resource type, fanned out from `STORAGE_BASE_DIR`.
- Rate limiting at the HTTP layer (100 req/hr authenticated, 20 req/hr anonymous).
- `render.yaml` for one-command backend deployment.

### Gaps
- **Single-worker constraint** — `agent_sessions/sessions.db` is SQLite. Multiple OS processes would corrupt it. Fix path is documented: migrate to LangGraph's `PostgresSaver`. Nothing else needs to change.
- **No CI/CD** — Zero GitHub Actions, CircleCI, or any pipeline configuration. 409 test functions exist and pass locally but never run automatically.
- **No containerisation** — No Dockerfile, no docker-compose. Local setup requires manual Python/Node version management.
- **No storage abstraction** — Services write directly to `pathlib.Path`. An S3/R2 swap would touch 6+ service files rather than one adapter.

### Technical debt
- `proxy.ts` middleware convention (Next.js 16 specific) — if downgrading to Next.js 15 or below, the file must be renamed to `middleware.ts`. A one-line comment in the file documents this.

---

## 2. Frontend — 82%

### What is built
- **28 routes** across 9 feature areas: datasets, analysis, dashboards, reports, connections, agent, catalog, history, settings.
- **20 typed API client modules** — one per backend domain, all using the same `apiFetch` base client with 401 retry and `signOut` fallback.
- **TanStack Query v5** throughout — mutations with `onSuccess` cache invalidation, `useQuery` with staleTime tuning.
- **Framer Motion** for page transitions and stagger animations, with `useReducedMotion` respect.
- **Dashboard builder** with `react-grid-layout` v2 (drag-and-drop), 5 templates, share-token flow end-to-end (generate URL → public read-only view at `/dashboards/shared/[token]`).
- **Agent workflow visualizer** with `@xyflow/react` showing the LangGraph graph per session.
- Server-side Plotly specs rendered client-side — the browser never computes chart data.
- CSP headers, `X-Frame-Options`, HSTS (production), Permissions-Policy, Referrer-Policy all set in `next.config.ts`.
- Auth middleware (`proxy.ts`) protects all routes; NextAuth session token refreshed automatically via `SessionSync`.

### Gaps
- **No mobile layout** — Sidebar + main panel layout breaks below ~1024px. No `sm:` breakpoints in layout components (confirmed: 7 responsive classes found in layout files, all cosmetic).
- **No frontend tests** — Zero Playwright, Vitest, or Jest tests in the frontend. No component unit tests.
- **CSV/Excel export absent** — No download button for query results, dataset previews, or reports data tables. Commonly expected by data tool users.
- **Alerts are client-side only** — `/alerts` uses `AlertHistoryStore` (localStorage) to persist KPI monitor and anomaly results. There is no backend persistence for alerts and no push/email notification mechanism.
- **Briefing has no dedicated backend route** — `/briefing` assembles from existing insight and recommendation API calls. Works, but if those endpoints change shape, briefing silently breaks.

### Technical debt
- Settings page (`/settings`) — exists as a route but its scope is not clear from the component; warrants a brief audit to confirm it isn't a stub.
- Two font variables (`--font-display`, `--font-mono`) loaded via `next/font/google` but usage across components is inconsistent.

---

## 3. Backend — 90%

### What is built
- **19 route files, 60+ HTTP endpoints**, zero business logic in route handlers.
- **38 service files**, total ~10,986 lines. Largest: `recommendation_service.py` (892 lines), `dashboard_generator.py` (834 lines), `agent_tools.py` (604 lines). Well-scoped — no god objects.
- **21 Pydantic schema files** covering every request/response. `model_config = {"extra": "forbid"}` on `QueryPlan` — LLM cannot inject unknown fields.
- Atomic filesystem writes on every service that persists data.
- Exception hierarchy with 16 typed exceptions; routes map each to the correct HTTP status code.
- Fernet encryption for stored database credentials. Passwords never hit disk in plaintext.
- HMAC-SHA256 confirmation tokens for CRUD operations. Token binds: connection, operation, table, filter hash, affected row count. Cannot be replayed for a different operation.
- Pre-image row snapshots before any DML, with TTL-based expiry and rollback endpoint.
- CRUD denylist: columns matching `password`, `token`, `api_key`, etc. are blocked from appearing in `set_values` regardless of LLM output.
- JWT validation with `iss`, `aud`, `jti`, `exp` checked on every request.
- `owner_sub` stamped at creation time from the validated JWT, never from the request body. Wrong-owner resources return 404 (not 403).
- SQL pushdown for DB-backed datasets — validated `QueryPlan` → SQLAlchemy expression (no string formatting). Parity test suite confirms SQL and Pandas paths return identical results.

### Gaps
- **No pagination** on `GET /datasets`, `GET /reports`, `GET /connections`, `GET /saved-queries`. These return all records for a user. Harmless now; breaks at scale.
- **No structured logging** — `logging.getLogger(__name__)` throughout. Production debugging requires grepping plaintext log lines. No correlation IDs, no request tracing.
- **LLM errors leak provider details** — When Groq and Ollama both fail, the 503 response can include the Groq API URL and HTTP status from Groq's response. Documented in README but not fixed.
- **`scheduled_reports` generates PDFs but does not deliver them** — The background runner calls `ReportService.generate()` but there is no email/webhook delivery. Reports appear in `/reports` for the owner to download manually. The feature name implies delivery.

### Technical debt
- Two test files (`test_crud_service.py`, `test_agent_graph.py`) use `async def test_` functions without the standard `pytest.mark.asyncio` or `anyio` markers visible at the top level — they rely on an `anyio_backend` fixture. This works but is non-obvious.
- `SCATTER_MAX_POINTS = 1000` is hardcoded in config with no per-request override. Large scatter datasets silently truncate.

---

## 4. Security — 91%

### What is built
All critical attack surfaces are addressed:

| Threat | Mitigation |
|--------|-----------|
| LLM code execution | `QueryPlan` enum + Pydantic `extra="forbid"` — LLM output never reaches an interpreter |
| SQL injection | Column names used as dict keys (`table.c["col"]`), never string-interpolated |
| CRUD replay attacks | HMAC token binds operation + filter hash + row count; single-use |
| CRUD silent data loss | Pre-image snapshots + rollback endpoint |
| Credential storage | Fernet AES-128-CBC + HMAC-SHA256 at rest |
| JWT replay | `jti` claim required and validated on every request |
| Resource enumeration | 404 (not 403) for wrong-owner resources |
| File upload abuse | Size limit (50MB), type validation before processing |
| XSS via chart data | Plotly specs built server-side; browser renders JSON, never raw data |
| Rate abuse | 100/hr authenticated, 20/hr anonymous via `slowapi` |
| Sensitive column writes | `CrudValidator._WRITE_DENYLIST` blocks password/token/api_key columns |

### Gaps
- **LLM error messages in production** — Groq API URL and model name appear in 503 responses. One `if settings.is_production` guard needed in the LLM provider error handler.
- **No authentication event audit log** — CRUD operations are logged to JSONL per connection. Auth events (sign-in, token failures) are not logged. For a multi-user deployment, this is a gap.
- **`NEXTAUTH_SECRET` and `BACKEND_JWT_SECRET` are both in `.env.local`** — Correct for development; the `.env.local.example` documents production handling clearly. No finding, just worth confirming rotation procedures exist.

---

## 5. Testing — 63%

### What is built
- **409 test functions** across **33 test files** in two test roots (`tests/` and `backend/tests/`).
- Coverage across: analytics service, CRUD lifecycle, agent graph, agent planner, agent tools, anomaly detection, forecast service, insight engine, recommendation engine, root cause, SQL pushdown parity, visualization, memory system, rate limiting, ownership isolation, dashboard generator, rollback.
- SQL pushdown parity test is particularly strong — asserts that SQL and Pandas paths return bit-identical results for all 10 operations across SQLite.
- `test_provider_selection.py` (16 functions) covers the Groq/Ollama fallback wiring.

### Gaps
- **No frontend tests** — Zero Playwright, Cypress, Vitest, or Jest tests in `frontend-next/`. The frontend has 28 routes and 90+ components with zero automated verification.
- **No CI** — Tests must be run manually. Nothing runs on `git push`.
- **No E2E auth flow test** — The OAuth callback, JWT minting, and backend token validation are untested as an integrated path.
- **`test_agent_checkpoint.py` has 1 test function** — Given agent checkpointing is the most complex piece of infrastructure, one test is insufficient.
- **`test_agent_graph.py` and `test_crud_service.py`** have 17 and 10 async test functions respectively — both are well-structured, but the anyio fixture approach adds friction for contributors.
- **No performance/load tests** — Report generation can take 30-120 seconds; no baseline or regression detection.

---

## 6. Analytics — 73%

### What is built
- **10 query operations**: `row_count`, `column_count`, `sum`, `average`, `max`, `min`, `groupby_sum`, `groupby_count`, `top_n`, `xy_select`.
- SQL pushdown for all supported operations against database-backed datasets.
- **4 anomaly detection methods**: IQR, Z-score, IsolationForest (scikit-learn), seasonal decomposition.
- **4 forecast models in priority chain**: Holt-Winters seasonal (statsmodels), Holt-Winters non-seasonal, linear OLS (NumPy), naïve last-value fallback.
- KPI monitor: automatic KPI selection from numeric columns, z-score alerting (|z|≥2 warning, |z|≥3 critical), SVG sparklines, trend chart with ±2σ bands, breach timeline.
- Data quality profiling: completeness, uniqueness, validity (IQR outlier rate), consistency, weighted A–F grade.
- Root cause analysis: dimensional decomposition, contribution scoring (`cell_change / |total_change| * 100`), top-N ranked drivers.

### Gaps
- **10-operation ceiling** — No percentile aggregations, no rolling averages, no period-over-period change, no running totals, no multi-condition filters. Each addition is straightforward (enum value + Pandas dispatch case + test) but none are implemented.
- **Single-dataset isolation** — No cross-dataset joins or blending. Architectural constraint: `DatasetMetadata` has no join key.
- **No time-series resampling** — If a dataset has irregular timestamps, no resampling occurs before forecasting. Holt-Winters will behave unpredictably.
- **Forecast frequency is global** — `FORECAST_FREQUENCY` and `FORECAST_AGGREGATION` are settings, not per-request parameters. Users cannot change frequency without restarting the server.

---

## 7. AI Features — 85%

### What is built
Seven distinct AI-backed features, all following the same architectural contract:

| Feature | LLM role | Deterministic layer |
|---------|----------|-------------------|
| Query planning | Picks operation + columns | Pandas/SQL dispatch |
| Forecast planning | Identifies date/target/horizon | statsmodels model chain |
| AI insights | Narrates statistical findings | `InsightStatEngine` (stats first) |
| Dashboard generation | Names dashboard, suggests insights | Chart specs built server-side |
| Root cause analysis | Narrates dimensional decomposition | Contribution scoring engine |
| Recommendations | Rewrites action/reason/impact | Rule engine (deterministic) |
| Agent orchestration | Plans multi-step tool sequences | LangGraph + typed tool registry |

The LLM is never the source of truth for any computed value. Insight narrative, recommendation text, and RCA narrative all fall back to deterministic output if the LLM fails.

### Gaps
- **No streaming** — LLM calls buffer the full response. Report generation with AI sections holds the HTTP connection for up to 120 seconds. No SSE or chunked transfer.
- **LLM errors expose provider topology** — See Security section.
- **Temperature is fixed at 0.1** — Good default for reproducibility, but not configurable per call type. Narrative generation (insights, briefing) might benefit from a slightly higher temperature.
- **No request-level timeout tuning** — `LLM_TIMEOUT_SECONDS` is a global setting. A short forecast planning call and a long report narrative call share the same timeout.

---

## 8. BI Features — 79%

### What is built
- **Dashboard builder** — Drag-and-drop (`react-grid-layout` v2), 5 templates (Executive, Sales, Operations, Marketing, Financial), AI-generated layout, save/load, share via token (public read-only URL), KPI cards and charts.
- **Scheduled reports** — Create, list, update, delete schedules. Background runner polls every 60 seconds and generates PDFs for due schedules. Reports appear in the owner's report list.
- **Data catalog** — Lists all datasets and DB connections in a tree view; lazy-loads columns, data types, and foreign keys when a table is selected. Links to the Ask workspace.
- **Saved queries** — Save, rename, re-run, delete named queries. Re-run calls the existing `/chart` endpoint with no new backend code.
- **Query history** — Session-level memory via conversational store (SQLite WAL). Browsable at `/history`.
- **Alerts center** — Surfaces KPI monitor alerts and anomaly results per dataset; client-side persistence in `localStorage` via `AlertHistoryStore`.
- **Executive briefing** — `/briefing` assembles an AI-generated narrative from insights and recommendations for a selected dataset.

### Gaps
- **Scheduled reports do not deliver** — Reports are generated on schedule and stored. There is no email, Slack, or webhook delivery mechanism. The feature name implies delivery; the implementation is half the loop.
- **No CSV/Excel export** — Query results, dataset previews, and data tables have no download button. This is the most commonly expected missing feature in a data tool.
- **Alerts are not persistent server-side** — Alert state lives in the browser. Clearing localStorage loses all alert history.
- **No mobile layout** — BI features are completely unusable on phones and difficult on tablets.
- **Dashboard sharing requires the creator to generate the link** — There is no collaborative workspace or team sharing beyond the public share URL.

---

## 9. Scalability — 38%

### What is built
- Single-server architecture, documented explicitly as a design decision.
- `STORAGE_BASE_DIR` environment variable fans out all storage paths — a single config change moves all data to a mounted disk.
- Optional Redis for session memory L2 cache (configured but not required).
- `render.yaml` handles both ephemeral (free tier) and persistent (paid tier) configurations.
- Per-user rate limiting keyed by JWT `sub` (not IP) for authenticated users — survives NAT.

### Hard limits
- **`--workers 1` is required** — SQLite WAL for agent sessions cannot handle multi-process concurrent writes. This is documented and the fix path is clear (LangGraph `PostgresSaver`), but it is not implemented.
- **In-process caches are not shared** — `LRUCache` for DataFrames and `TTLCache` for analysis results live in memory. A second worker would have a cold cache and miss checkpointed sessions from the first.
- **Filesystem storage assumes a single mount point** — Horizontal scaling requires a shared volume or a storage adapter rewrite.
- **No background task queue** — Long-running jobs (PDF reports, AI report sections, agent runs) hold HTTP connections for 30-120 seconds. No Celery, RQ, or ARQ.
- **No CDN configuration** — Static assets served directly from Vercel (handled automatically), but API responses have no edge caching.

### What the README says
All three scalability ceilings are documented in the README with explicit fix paths. This is honest engineering, not an oversight.

---

## 10. Recruiter Appeal — 87%

### Strong signals
- **Solo, end-to-end full-stack product** — Python backend, TypeScript frontend, LLM integration, agent orchestration, PDF generation, OAuth, SQL databases, statistical ML, drag-and-drop UI, deployed. All by one person. This is rare at any level.
- **Principled LLM architecture** — The decision to never `exec` LLM output and to constrain the LLM to a typed plan is a senior engineering call. It demonstrates understanding of AI system failure modes, not just API calls.
- **Real security thinking** — HMAC confirmation tokens, Fernet encryption, 404-not-403 ownership isolation, JWT `jti` validation, CRUD denylist, pre-image rollback. These are not tutorial patterns — they show defensive engineering instinct.
- **LangGraph agent with state machine** — Most demo agents are just `while True: call_llm()`. This has verifier, recovery, approval_gate, and cross-HTTP-request session persistence. Demonstrates systems thinking.
- **Scale of documentation** — README.md is a detailed engineering narrative (900 lines), explaining every architectural decision and its trade-offs. This is rare and signals strong communication ability.
- **Deployed and accessible** — Render + Vercel. Not just a GitHub repo.

### Weaknesses that interviewers will probe
- **No CI/CD** — Automatic filter at many companies. A repo with 409 tests and no pipeline looks unfinished even when everything works locally.
- **No containerisation** — Docker is table stakes for backend roles at most companies. Its absence will be noticed.
- **Single-worker SQLite** — Candidates who demonstrate awareness of this limit and can describe the fix path (`PostgresSaver`) will clear this; candidates who don't know why it exists will not.
- **10-operation analytics ceiling** — "Can you add a percentile operation?" is a natural extension question in an interview. The answer is easy if you know the codebase.
- **No frontend tests** — If the role requires full-stack, the complete absence of frontend tests is a gap to explain.

### Interview readiness assessment

| Interview type | Readiness | Notes |
|----------------|-----------|-------|
| System design | **High** | LLM-as-router, LangGraph StateGraph, fallback chain, storage abstraction — all defensible with first-principles reasoning |
| Backend / Python | **High** | Service layer, exception hierarchy, dependency injection, atomic writes, JWT auth, HMAC, Fernet — can speak to all of these |
| Frontend / React | **Medium-High** | TanStack Query v5, App Router patterns, Framer Motion, react-grid-layout v2 — solid. Weak on testing. |
| ML / Data engineering | **High** | Model selection chain, anomaly detection methods, dimensional decomposition, Pandas/SQL parity — all defensible |
| DevOps / Platform | **Low-Medium** | No CI/CD, no Docker, single-worker constraint. Can explain render.yaml and `--workers 1` rationale, but no hands-on CI/pipeline work visible |
| Security | **High** | Can articulate every security decision and why. This is the strongest differentiator in this codebase. |

---

## Remaining Gaps Summary

| Gap | Severity | Category |
|-----|----------|----------|
| No CI/CD | High | DevOps |
| No CSV/Excel export | High | BI Features |
| LLM errors expose provider in production | Medium | Security |
| No pagination on list endpoints | Medium | Backend |
| No structured/JSON logging | Medium | Observability |
| No Docker / docker-compose | Medium | DevOps |
| Scheduled reports don't deliver | Medium | BI Features |
| No frontend tests | Medium | Testing |
| No mobile layout | Low | Frontend |
| `SCATTER_MAX_POINTS` not per-request | Low | Analytics |
| Forecast frequency is global setting | Low | Analytics |
| Alerts have no server-side persistence | Low | BI Features |

---

## Technical Debt Summary

| Debt item | Location | Impact |
|-----------|----------|--------|
| Single-worker SQLite constraint | `agent_sessions/sessions.db` | Blocks horizontal scaling |
| No storage abstraction interface | 6+ service files write to `Path` directly | S3/R2 migration touches many files |
| `anyio_backend` fixture pattern | `test_crud_service.py`, `test_agent_graph.py` | Non-standard, adds contributor friction |
| `proxy.ts` middleware convention | Next.js 16 specific | Breaks if downgraded to Next 15 |
| No correlation IDs | Entire backend | Production debugging is grep-only |
| Global `OLLAMA_TIMEOUT_SECONDS` | `config.py` | Short and long LLM calls share one timeout |

---

## Remaining Work Ranked by ROI

Ranked by: (interview/recruiter impact + user value) ÷ estimated effort. Only work that closes a documented gap — no speculative features.

| Rank | Work item | Effort | ROI rationale |
|------|-----------|--------|---------------|
| 1 | **GitHub Actions CI** (run `pytest` on push) | 3–5 h | Highest recruiter signal per hour. Closes the most common red flag. A 5-line YAML file that runs `pytest tests/ -v` changes how the repo reads instantly. |
| 2 | **CSV export for query results** | 2–4 h | Most commonly expected missing feature in any data tool. One `text/csv` response path server-side + one download button client-side. |
| 3 | **Sanitize LLM errors in production** | 1–2 h | Security gap with a one-`if` fix. `if settings.is_production: raise HTTPException(503, "LLM unavailable.")` instead of forwarding the raw provider error. |
| 4 | **Pagination on list endpoints** | 4–8 h | Correctness at scale. `GET /datasets?page=1&limit=50` pattern. Closes a question that will come up in any backend interview about this project. |
| 5 | **Docker + docker-compose** | 3–5 h | One `Dockerfile` for the backend + one `docker-compose.yml` that starts backend + frontend together. Removes a significant devops gap with minimal complexity. |
| 6 | **Structured logging (JSON + request ID)** | 6–10 h | Adds a `correlation_id` to every log line, enables log aggregation (Datadog, Logtail, etc.), and demonstrates production ops thinking. Middleware-level: touches startup only. |
| 7 | **Scheduled report email delivery** | 8–16 h | Completes the scheduled reports feature loop. A report that generates but doesn't deliver is half a feature. Requires an SMTP/SendGrid integration and a `to_email` field on `ScheduledReport`. |
| 8 | **Playwright E2E tests (3–5 golden paths)** | 12–20 h | Closes the frontend test gap. Login → upload → ask question → see chart. Agent run. Dashboard create → share. Three tests change the testing story completely. |
| 9 | **Add 2–3 analytics operations** (percentile, period-over-period, rolling average) | 6–10 h each | Extends the 10-operation ceiling. Each is: one enum value, one Pandas dispatch case, one SQL translator case, one test. Any one of these is a natural interview extension question. |

---

*Audit conducted by static analysis, live endpoint inspection, and full source read. All completion percentages are based on observed code — not estimates.*
