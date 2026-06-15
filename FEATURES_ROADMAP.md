# Features Roadmap

## Done

### Core data features
- [x] CSV and Excel upload with validation and metadata extraction
- [x] Dataset preview with column types and sample rows
- [x] Natural language analytics — 10 operations (count, sum, avg, min, max, group-by sum/count, top-N, scatter, column stats)
- [x] Chart generation — bar, line, pie, scatter, histogram (Plotly, built server-side)
- [x] PDF report generation — dataset summary, distribution charts, group-by breakdowns, optional forecast section
- [x] SQL pushdown for aggregate queries against live databases
- [x] Time series forecasting — Holt-Winters → STL → OLS → naïve fallback chain
- [x] Anomaly detection — IQR, z-score, IsolationForest, seasonal decomposition

### Database
- [x] Connect to SQLite, PostgreSQL, MySQL
- [x] Table discovery and registration as datasets
- [x] Fernet encryption for stored credentials

### CRUD
- [x] Natural language CRUD planning (INSERT, UPDATE, DELETE)
- [x] Preview: row count, before-image, HMAC confirmation token
- [x] Execute inside a transaction with pre-image snapshot
- [x] Rollback within configurable TTL window
- [x] Append-only audit log per connection

### Agent
- [x] LangGraph StateGraph with planner → verifier → executor → approval gate → recovery → aggregator
- [x] Human-in-the-loop approval for CRUD writes
- [x] Bounded retry and replan on tool failure
- [x] Session persistence via SQLite WAL checkpointer
- [x] Explain mode — returns the plan without executing tools
- [x] Agent workflow graph visualisation (React Flow)

### Frontend
- [x] Next.js 16 App Router with Google OAuth
- [x] Per-user dataset and resource isolation via JWT sub
- [x] Ask Data workspace with conversation thread
- [x] Forecast workspace with chart + model info
- [x] Report generation and download
- [x] CRUD workspace with approval modal and audit viewer
- [x] Agent workspace with session list, timeline, and flow graph
- [x] Executive dashboard builder (drag-and-drop, 5 templates)
- [x] Dashboard hub — save, list, and reload dashboards
- [x] Data quality dashboard — quality score, column health, recommendations
- [x] KPI monitoring — auto-detected KPIs, trend charts, alert timeline
- [x] Autonomous analysis — auto-runs summary, quality check, insights, anomalies, root cause, recommendations
- [x] Command palette (⌘K)
- [x] Ephemeral storage banner

### Analytics features (dataset-level)
- [x] AI insights generation
- [x] Anomaly detection workspace
- [x] Root cause analysis with waterfall decomposition
- [x] Recommendations engine (rule-based + LLM narrative)

---

## Planned / In progress

### Short term
- [ ] Rate limiting per user on LLM-heavy endpoints
- [ ] Structured JSON logging with correlation IDs
- [ ] Pagination on dataset list, report list, and audit log
- [ ] Export query results to CSV or Excel
- [ ] GitHub Actions CI running tests on every push

### Medium term
- [ ] PostgreSQL-backed agent sessions (removes single-worker constraint)
- [ ] S3/R2 storage adapter for uploads and reports (removes ephemeral disk dependency)
- [ ] Scheduled report delivery via email
- [ ] Background task queue for long-running jobs (report generation, large dataset analysis)
- [ ] OpenTelemetry instrumentation

### Longer term
- [ ] Team workspaces — share datasets and dashboards across users
- [ ] RBAC — viewer/editor/admin roles within a workspace
- [ ] SSO via SAML/OIDC (in addition to Google OAuth)
- [ ] Multi-dataset joins in the analytics layer
- [ ] More analytics operations: percentile, rolling average, period-over-period change, cohort
- [ ] Mobile-responsive layout
- [ ] Alert delivery for KPI threshold breaches
- [ ] Docker Compose for local setup
