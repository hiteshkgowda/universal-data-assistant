# Project Evolution

This document describes how the project grew phase by phase. Each phase started because something in the previous one felt incomplete or exposed a gap. The architecture didn't emerge fully formed — it was shaped by constraints encountered along the way.

---

## Phase 1 — Data upload and analytics

### Problem being solved

The starting point was straightforward: let a user upload a CSV or Excel file and ask basic questions about it — row counts, column sums, group-by aggregations. Most tools that do this either require SQL knowledge or wrap everything in a fixed UI with a preset list of operations. The goal was something more open-ended.

The first version had no LLM at all. It was a FastAPI backend that accepted file uploads, parsed them with pandas, and exposed a handful of hard-coded analytics endpoints.

### Challenges encountered

File parsing turned out to be more involved than expected. CSV files from different sources had different encodings (UTF-8, latin-1, cp1252), different delimiters (comma, semicolon, pipe), and inconsistent handling of header rows. Excel files had merged cells and multi-row headers. The initial approach of just calling `pd.read_csv()` and `pd.read_excel()` with default arguments failed on roughly a third of real-world files.

The fix was a `TableLoader` class that tries a sequence of encoding and dialect combinations, validates the result has at least one row and one column, and raises a `ParseError` if everything fails. That error bubbles up to a 422 response with a message that includes the file name and what was tried.

Storing files on the local filesystem introduced a second problem: how do you associate a file with its metadata (column names, dtypes, row count, file type) without a database? The solution was a sidecar JSON file stored alongside each uploaded file, keyed by a UUID that became the dataset ID. This was a deliberate choice to avoid setting up a database for what was still a prototype.

### Design decisions

The DataFrame cache was added when it became clear that parsing the same 50MB Excel file on every analytics request was unacceptably slow. An `LRUCache` bounded to 8 entries was added to `DatasetService`. The bound is intentional: unbounded caching on a server with limited RAM will eventually cause OOM errors, and 8 datasets covers most realistic single-user sessions.

Resource IDs are 32-character lowercase hex strings (UUID4 with hyphens stripped). A regex validator on every route parameter rejects anything else at the API boundary. This prevents path traversal attacks where a caller supplies `../other-user/dataset` as an ID.

### Lessons learned

Filesystem storage for metadata is convenient but creates a subtle problem: the JSON sidecar and the uploaded file can get out of sync if a write is interrupted. The current code writes the file first, then the metadata, which means a partial upload leaves an orphaned file with no metadata — the dataset simply doesn't appear in listings. That's an acceptable failure mode for a single-user prototype but would need atomic operations (temp file + rename) for production use.

---

## Phase 2 — Natural language querying

### Problem being solved

The analytics endpoints from Phase 1 required the caller to know the exact operation name (`sum`, `group_by`, `top_n`, etc.) and pass column names explicitly. That's fine for a programmatic client but not for a user who just wants to type a question. The goal was to let a user write "what was the total revenue by region last year" and get back an answer.

### Challenges encountered

The obvious approach is to ask an LLM to write pandas code and then execute it. The problem with that is significant: `exec()` on LLM-generated code is untestable (you can't unit-test a string), unpredictable (the model might write code that deletes files, imports os, or runs for 10 minutes), and unauditable (you have no fixed record of what operation was actually executed).

The alternative that was settled on: ask the LLM to choose from a fixed enumeration of operations and fill in column names. The LLM picks `Operation.GROUP_BY_SUM` and says `column=revenue, group_by=region`. Python code then dispatches to the pandas implementation of that specific operation. The LLM never writes code that gets executed.

This required designing the `Operation` enum carefully. The initial list had 8 operations. It grew to 15 as users asked questions that didn't fit existing categories. Each new operation required a new Pydantic field on `QueryPlan` and a new branch in the pandas dispatch table.

Getting the LLM to consistently output valid JSON was harder than expected. Groq's `response_format=json_object` parameter helped, but the model would occasionally produce output where column names didn't match the actual dataset columns (different casing, abbreviated, or hallucinated). The fix was a semantic validation pass after Pydantic validation: compare the plan's column name against the real DataFrame columns in a case-insensitive lookup.

### Design decisions

`QueryPlan` uses `model_config = ConfigDict(extra="forbid")`. Any LLM output that includes fields not in the schema raises a `ValidationError` immediately. This was added after an early test where the model returned an `operation` field with an underscore variant (`group_by_sum` vs `groupbysum`) and the error was silent.

The Groq → Ollama fallback chain was added when it became clear that Groq's API has rate limits and occasional outages. `FallbackQueryPlanner` tries Groq first, catches `LLMError`, and retries with a local Ollama instance. Ollama is slower but doesn't have rate limits. The calling service can't tell which planner ran.

A single shared `httpx.AsyncClient` is created in the FastAPI `lifespan()` function and injected into every planner. Creating a new `httpx.AsyncClient` per request would leave connections unclosed and waste resources on connection setup. The lifespan pattern ensures it's closed cleanly on shutdown.

### Lessons learned

The `Operation` enum is now the main constraint on what questions the system can answer. When a user asks something outside the enum (e.g., "calculate the year-over-year growth rate"), the system returns a validation error instead of a wrong answer. That's the right failure mode — a clear error is better than a confidently wrong result — but it means the enum needs to grow as the question space grows.

Column name matching still has edge cases. If the user asks "total sales" and the column is called `Total Sales (USD)`, the current matching doesn't handle that. A fuzzy match (edit distance or token overlap) would help but adds complexity. The current version returns a validation error for column names that don't match, which is honest if frustrating.

---

## Phase 3 — Visualizations and reporting

### Problem being solved

Text answers ("total revenue by region: North=1.2M, South=0.9M") are accurate but hard to scan. Users wanted charts alongside query results. Separately, there was a need to bundle multiple query results into a downloadable PDF report.

### Challenges encountered

The first instinct for chart generation was to ask the LLM to write Plotly code. That was rejected for the same reason as Phase 2 — executing LLM-generated code is unsafe and untestable. Instead, the `VisualizationService` wraps `AnalyticsService` and takes the structured `ExecutionResult` (not raw text) as input for chart building.

Chart type selection is deterministic: a small function maps operation type and result shape to a `ChartType`. A `GROUP_BY_SUM` result with fewer than 20 groups gets a bar chart. A time series gets a line chart. A single scalar gets no chart. The LLM is not involved in this decision.

Plotly figure generation runs server-side and returns a JSON-serialisable dict (not an HTML snippet). The frontend renders the spec with `react-plotly.js`. This means the chart spec can be included in a PDF report without a browser — `kaleido` renders it to a PNG. It also means chart generation is fully unit-testable: feed in a result dict, assert on the returned spec dict.

PDF generation with `ReportLab` was more work than expected. ReportLab's API is low-level (you position elements with coordinates), so a `PdfBuilder` class was written to abstract that. The document model (`ReportModel`) takes structured sections (`QASection`, `ChartSection`, `StatRow`) rather than raw ReportLab primitives. This made the PDF layout predictable and the code testable.

### Design decisions

Reports are stored as PDF files on disk alongside a `ReportMetadata` JSON sidecar. The same pattern as datasets. This was the path of least resistance and it works — but it ties report storage to the same ephemeral disk limitation.

Report downloads go through a signed route (`/api/reports/{report_id}/download`) that checks ownership before serving the file. Early versions served the file path directly, which would have allowed path traversal. The route now uses the `report_id` to look up the canonical path from metadata.

### Lessons learned

The `kaleido` package for server-side chart rendering has a known issue on Linux servers without a display: it needs a virtual framebuffer or a specific set of system libraries. The tests mock the chart rendering step rather than requiring a real kaleido installation, which keeps CI simple but means the PDF rendering path is only tested in the actual deployed environment.

---

## Phase 4 — Forecasting

### Problem being solved

Users with time-series data (monthly sales, daily transactions) wanted to extrapolate future values, not just describe the past. "What will revenue look like next quarter?" was a common request.

### Challenges encountered

Time-series forecasting requires picking a model, and the right model depends on the data: its frequency (daily, weekly, monthly), the presence of seasonality, and the volume of historical data. Using a single model unconditionally fails visibly — Holt-Winters with a 12-period seasonal cycle applied to a dataset with only 8 rows produces nonsense.

The solution was a four-level fallback chain:
1. Exponential smoothing (simplest; works with as few as 3 data points)
2. Holt-Winters (handles seasonality; requires at least 2× the seasonal period)
3. Seasonal decomposition + trend extension (via `statsmodels.STL`; needs more data)
4. Linear trend as the final fallback (always works; admits it's a rough estimate)

The chain tries each model in order, catches model-specific errors (convergence failures, insufficient data errors), and falls back. The caller gets the best model that succeeded, plus a note on which one was used.

The LLM's role here is limited to parsing the user's intent into a `ForecastPlan`: which column to forecast, over what horizon, at what frequency. The actual numerical work is entirely statsmodels and numpy.

Frequency detection was a problem. Users don't usually say "monthly frequency" — they say "next 6 months" or "next quarter". The `ForecastPlanner` maps natural language to a pandas resample rule (`M`, `W`, `Q`, etc.) and a seasonal period. Getting the seasonal period wrong for monthly data (should be 12, not 7) breaks the Holt-Winters model. The mapping is maintained as a dict in the service and has been revised several times.

### Design decisions

Forecasts return both the predicted values and confidence intervals (where the model supports them). Confidence intervals are narrow for exponential smoothing on stable data and wide for volatile series — surfacing them makes the uncertainty visible rather than hiding it behind a single point estimate.

The `ForecastOutput` dataclass carries a `model_used` field so the frontend can show which model ran. Users were confused when the same question produced different confidence intervals on different datasets; seeing "model: Holt-Winters (seasonal)" vs "model: linear trend (insufficient data)" explained the difference.

### Lessons learned

The four-level chain introduced a duplication problem: each LLM provider (Groq, Ollama) needed its own planner implementation, and each feature (query, forecast, CRUD, agent) needed its own planner pair. By the time forecasting was added, there were already 8 planner classes sharing essentially the same structure. This is the main known tech debt in the codebase and is noted in `SYSTEM_AUDIT.md`. The fix would be a generic `LLMPlanner[T]` that takes a response schema and handles the provider switching.

---

## Phase 5 — Agent orchestration

### Problem being solved

By Phase 4, the system could answer individual questions, generate charts, and forecast. But each capability was siloed: a single API call, a single result. A user who wanted to "analyse my sales data, forecast next quarter, and generate a report" had to make three separate requests and piece the results together manually. The agent was added to handle multi-step tasks as a single conversation turn.

### Challenges encountered

Rolling a custom agent state machine was tempting but impractical once the scope became clear. A proper agent needs: session state that persists across HTTP requests (so a CRUD approval that arrives 30 seconds later can resume the right session), a way to pause mid-execution for human input, error recovery without restarting from scratch, and a bounded retry policy. Writing all of that from scratch would have taken longer than the agent feature itself.

LangGraph was chosen because it provides a `StateGraph` with SQLite checkpointing out of the box. The graph's state is serialised to a SQLite WAL-mode database after every node, so a suspended session can be resumed by any future HTTP request — not just the one that started it.

The `interrupt()` / `Command(resume=...)` pattern was the most surprising part of the LangGraph API. When the executor runs a CRUD preview, it sets a flag in state and the next node (`approval_gate`) calls `interrupt()`, which saves the graph state and surfaces a payload to the HTTP caller. The session appears "suspended" until the user calls the approve or reject endpoint, which passes a `Command(resume=value)` to the graph. This required understanding that `interrupt()` is not an exception — it's a cooperative yield point.

The verifier node guards against a class of problems that emerged in testing: the LLM occasionally produced plans with `crud_execute` before `crud_preview`, or plans with 20 tool calls when the limit was 10, or plans referencing tool names that didn't exist. Five guard conditions in the verifier catch these and fail fast rather than letting a bad plan partially execute.

### Design decisions

The `recovery` node re-prompts the LLM with the full execution history and the error from the failed step. It asks for a revised plan for the remaining steps only. This is capped at `max_retries` (default 2) to prevent infinite retry loops on fundamentally broken plans.

Each tool in the registry wraps one existing service (e.g., `InsightTool` wraps `InsightService`). The tool adapters are thin — they translate the agent's generic `arguments: dict` into the service's typed method signature and translate the result into a `ToolResult`. The services themselves are unchanged.

The `CRUD_HMAC` token pattern was added because the agent could theoretically re-execute a stale plan. The token is an HMAC-SHA256 signature over the connection ID, operation, table name, filter hash, affected row count, and issue timestamp. The executor rejects tokens older than 5 minutes or bound to different operations.

### Lessons learned

SQLite WAL mode works well for the agent sessions, but it limits the backend to a single OS process. A second worker process would open a second file descriptor on the same SQLite file and writes would corrupt each other. This is why the backend runs with `--workers 1`. The fix is `LangGraph`'s `PostgresSaver` — the service interface for the checkpointer is already abstracted, so swapping the backend doesn't require touching any graph code.

The agent's session state grows unbounded within a session (every tool result is appended to `results`). For long agent runs with many steps, this could become a large object to serialise on each node. A sliding window or result summarisation would be needed for sessions with more than ~50 steps.

---

## Phase 6 — Insight generation

### Problem being solved

Answering a specific question is useful, but a first-time user looking at an unfamiliar dataset doesn't know what questions to ask. The insight feature was meant to fill that gap: given a dataset (or a query result), surface what's interesting about it without the user needing to ask.

### Challenges encountered

The initial version asked the LLM to "find interesting patterns in this data" and passed the raw table as context. The outputs were inconsistent — sometimes the model focused on obvious things (highest value is X), sometimes it hallucinated trends that weren't in the data, and the response format changed between runs.

The fix was a two-layer approach:
1. `InsightEngine` computes statistical findings deterministically: column statistics (mean, std, percentiles, missing count), trend detection via `numpy.polyfit` regression over sorted numeric columns, Pearson correlations between every pair of numeric columns, top/bottom performers within categorical groupings, and growth pattern classification (rising, falling, volatile, flat).
2. `InsightAgent` receives the statistical findings as structured JSON — not the raw data — and reasons about them. The LLM sees numbers that were computed by code, not the raw table.

This means the LLM can't hallucinate a trend that isn't there, because it only sees what `InsightEngine` computed. It can, however, add context, suggest causes, and write in natural language. If the LLM call fails, the statistical findings are returned directly — the fallback is fully informative, just less narrative.

Parsing the LLM's JSON response reliably was harder than expected. The model would sometimes return valid JSON wrapped in markdown fences (` ```json ... ``` `), sometimes add trailing commas, and occasionally return valid JSON that didn't match the `InsightResponse` schema. The parser strips markdown fences before attempting JSON parse, and wraps the Pydantic validation in a try/except that falls back to the statistical findings.

### Design decisions

The insight cache is keyed by a SHA-256 hash of `(dataset_id, question, table_fingerprint)`. The table fingerprint is the SHA-256 of the serialised column names and first-row values — enough to detect when the underlying data changed. Cache hits skip both the statistical computation and the LLM call. The TTL is 1 hour.

`InsightEngine` uses `numpy.polyfit` for trend detection rather than statsmodels, because this is a simple slope-direction check, not a publishable regression. The output is classified as "rising", "falling", "volatile", or "flat" based on slope sign and standard deviation of the residuals. Surfacing a precise R² value would give false confidence in a rough heuristic.

### Lessons learned

Pearson correlation works poorly on non-numeric or low-cardinality columns. The implementation skips columns with fewer than 3 unique values and object-typed columns. This is the right call, but it means correlations are often absent for categorical datasets. Spearman or Cramér's V would handle categorical columns but add complexity that wasn't worth it at this stage.

The two-layer pattern (statistical engine + LLM reasoning) was reused for root cause analysis and recommendations in Phases 7 and 8. It's probably the most reusable design decision in the project.

---

## Phase 7 — Root cause analysis

### Problem being solved

Insight generation tells you what changed. Root cause analysis is one step further: why did it change? When revenue drops 15% between one period and the next, which dimension (region, product, channel, customer segment) explains most of the drop?

### Challenges encountered

Root cause analysis is a well-defined statistical problem: decompose the aggregate change into contributions from each dimension and each member of that dimension. The challenge was that the user's data has no fixed schema. The service has to detect which column is the metric (numeric, business-relevant), which column is the time dimension (date-like or period-like), and which columns are candidate dimensions (categorical, low cardinality).

The auto-detection logic (`_detect_metric`, `_detect_period_col`, `_detect_dimensions`) works by keyword matching and dtype inspection. "Revenue", "sales", "amount", "value" are treated as metric candidates. Date-typed columns or columns with values like "Q1 2024", "Jan", "Week 1" are treated as period candidates. The detection isn't perfect — it fails on datasets with generic column names like "A", "B", "C" — but for business datasets with descriptive headers it works reliably.

Period splitting was harder than metric detection. The service needs to identify two comparable periods ("this quarter" vs "last quarter") from what might be an unstructured list of period labels. The current approach sorts the unique period values and takes the last 25% as "current" and the preceding 75% as "prior". This works for ordered time labels but breaks for unordered ones (e.g., product categories used as a time axis by mistake).

### Design decisions

`RCAEngine` produces `RCAFindings`: a list of `ContributionFactor` objects, each with the dimension, member, period values, absolute change, and percentage of total change explained. The LLM (`RootCauseAgent`) receives these findings and writes a narrative explanation. The same LLM-fallback-to-statistics pattern from Phase 6 applies.

The decomposition uses additive contribution: each dimension member's contribution is `(current_value - prior_value) / total_change`. Contributions sum to 100% by construction. This is simpler than a full-factorial decomposition (which would require more data and more computation) but gives actionable output for most business questions.

### Lessons learned

"Root cause" is an ambitious name for what the service actually does, which is contribution analysis. True root cause analysis would require a causal graph or at minimum some domain knowledge about what causes what. The service finds which segment changed the most, not why the segment changed. The docstrings and frontend copy now call it "contribution analysis" in most places to set more accurate expectations.

---

## Phase 8 — Recommendations

### Problem being solved

After anomaly detection, insight generation, and root cause analysis all existed separately, users wanted the system to synthesise these findings into actionable next steps. "What should I do about this data?" was a frequent question.

### Challenges encountered

The first version asked the LLM to generate recommendations from the raw analysis results. The outputs were inconsistent: sometimes specific and actionable ("investigate the 40% drop in North region Q3 revenue"), sometimes vague ("consider reviewing your sales strategy"). The model also invented recommendations that had no basis in the actual data.

The solution followed the same two-layer pattern from Phase 6: `RuleEngine` generates recommendations deterministically from structured analysis inputs, then `RecommendationAgent` optionally polishes the language.

`RuleEngine` operates on three input types: `AnomalyResponse`, `InsightResponse`, and `ForecastResponse`. Each has its own sub-method (`_from_anomalies`, `_from_insights`, `_from_forecast`). The rule mapping is explicit: a "critical" anomaly in a revenue column generates a "high priority, investigate immediately" recommendation. A "falling" trend with a decline rate above 20% generates a different recommendation than a "falling" trend at 5%.

Cross-signal detection was added after noticing that the same metric often appeared in multiple input sources. If anomaly detection flags "revenue" as critical and the insight layer also classifies "revenue" as falling, a cross-signal recommendation is generated that notes the convergence. This is more actionable than two separate recommendations about the same metric.

### Design decisions

Deduplication uses token-level Jaccard similarity. Two recommendation actions with Jaccard similarity above 0.7 are considered duplicates; the higher-priority one is kept. This is a rough heuristic — the threshold was tuned manually on a set of test cases. A semantic embedding similarity would work better but adds a network call for each comparison.

Priority ranking: `critical → high → medium → low`. Within a priority tier, recommendations are sorted by confidence (which is derived from the signal strength of the underlying finding). The final list is capped at 10 recommendations — surfacing 40 recommendations is as unhelpful as surfacing none.

`RecommendationAgent`'s LLM call is optional: if the agent is unavailable (LLM error, no API key configured), the rule-based recommendations are returned as-is. The frontend shows a subtle indicator when the output was LLM-enhanced vs. purely rule-based.

### Lessons learned

The `_from_forecast` method generates recommendations from a forecast direction and slope. "Revenue is forecast to decline 8% next quarter" generates a preparation recommendation. But the forecast's confidence interval is not factored in — a recommendation generated from a forecast with ±40% uncertainty is not much more reliable than a guess. Including forecast uncertainty in the recommendation priority would improve quality.

---

## Phase 9 — Autonomous analysis

### Problem being solved

By Phase 8, the system could detect anomalies, generate insights, find root causes, and produce recommendations — but all as separate, manually triggered requests. Each required the user to navigate to a separate page and wait. The goal of Phase 9 was twofold: (1) provide a data quality profiling layer that runs before analysis and flags structural problems, and (2) add a KPI monitoring mode that watches a dataset for statistical anomalies across all numeric columns simultaneously, with configurable alert thresholds.

### Challenges encountered

Data quality profiling required agreeing on what "data quality" means without a fixed domain schema. The service computes six dimensions per column: completeness (non-null ratio), uniqueness (distinct value ratio), validity (values within expected ranges where inferable), consistency (pattern matching for typed columns), accuracy (outlier detection), and timeliness (date column recency). Each dimension is scored 0–1; the overall column quality score is a weighted mean.

The tricky part was "validity" without a user-provided schema. The service infers expected ranges from the data itself: a numeric column where 95% of values are positive is assumed to have a "non-negative" constraint. Values outside the inferred constraint score lower on validity. This works for standard business data but produces misleading scores for columns with legitimate negative values (e.g., profit/loss, temperature).

KPI monitoring uses z-scores for alert generation. A z-score above 2.0 triggers a warning alert; above 3.0 triggers a critical alert. These thresholds are configurable constants at the top of `kpi_monitor_service.py`. The sparkline for each KPI includes a ±2σ band so users can see their own data's variability, not just the alert status.

Conversational memory was added in this phase as well. `SessionMemory` (in-process LRU) and `ConversationStore` (SQLite) form a two-layer cache. When the user asks a follow-up question, the last few conversation turns are injected into the agent's context automatically. This is what makes "what caused that drop?" work without the user repeating what "that drop" refers to.

### Design decisions

Memory is recorded fire-and-forget: `asyncio.ensure_future(memory_service.record(...))` is called from the route handler without `await`. This means the HTTP response returns immediately and memory recording happens in the background. The downside is that if the background task fails silently, the turn is lost. Given that memory is a nice-to-have (the system works without it), this was an acceptable tradeoff.

The data quality analysis is cached by dataset SHA-256 with a 1-hour TTL. Running column-by-column profiling on a large dataset is expensive; the TTL prevents it from running on every page load.

### Lessons learned

Z-score-based alerting assumes data is approximately normally distributed. For highly skewed distributions (e.g., transaction values that follow a power law), z-scores are nearly useless — almost everything gets flagged or almost nothing does. The service adds a note to the response when the skew is high, but doesn't switch to a different alerting method. IQR-based alerting would work better for skewed data; the anomaly detector from Phase 2 already has `IQRDetector` but it isn't wired into KPI monitoring.

Conversational memory context can become stale: if the user uploads a new dataset in the middle of a session, the injected context still refers to the old one. The current implementation doesn't detect this. A session reset signal (new dataset upload) should clear the L1 cache.

---

## Phase 10 — Dashboard generation

### Problem being solved

After nine phases, a user could ask complex multi-step questions and get detailed analysis. But presenting a summary to someone else — a manager, a client — still required exporting individual results and assembling them manually. A dashboard that could be generated from a dataset in one step and then customised was the obvious next piece.

### Challenges encountered

Dashboard generation has two distinct problems: deciding what to show (which metrics, which chart types) and arranging it on a canvas. Both are subjective. Two engineers looking at the same dataset would make different choices. The question was whether to let the LLM make those choices or to define deterministic rules.

The LLM was tried for KPI selection first. It would return a list of column names to use as KPIs. The outputs were inconsistent: for the same dataset, different runs would choose different columns, or choose columns that had no business meaning (e.g., an ID column). The KPI selection was moved to a rule-based `KPISelector` that ranks numeric columns by a score derived from keyword matching (revenue, sales, profit, cost score higher), coefficient of variation (low-variance columns aren't interesting), and non-null ratio (mostly-empty columns score low).

Chart type selection followed the same path. `ChartEngine` uses a deterministic mapping from column type and result shape to chart type. A grouped aggregate gets a bar chart. A date + value pair gets a line chart. A correlation matrix gets a heatmap. The LLM is not involved.

Layout packing uses a simple greedy algorithm: KPIs are placed in a top row (each cell 3 columns wide), then charts fill subsequent rows left-to-right (each chart is 6 columns wide). `DashboardScorer` produces a 0–100 score based on KPI count, chart variety, data coverage, and completeness. The score isn't shown to users directly but influences whether a "low quality" warning is displayed.

The LLM is used for exactly two things: generating a dashboard name from the prompt and dataset name, and writing one-sentence recommendation bullets. Both have deterministic fallbacks: the name falls back to a slug derived from the filename and prompt, and the recommendation bullets fall back to trend-based strings generated from KPI data.

The frontend drag-and-drop used `react-grid-layout` v2, which turned out to have a significantly changed API from v1. The v2 API restructures configuration into `gridConfig`, `dragConfig`, and `resizeConfig` sub-objects. The breakage was discovered by reading the `.d.ts` type definition files since the migration guide wasn't current.

### Design decisions

Dashboards are saved as JSON (`DashboardConfig`) and served back to the frontend, which reconstructs the layout. This means a saved dashboard is always re-renderable from its config — charts don't need to be cached as images, and the data is live-fetched when the dashboard loads.

The `DashboardService` TTL cache stores the full `GenerateDashboardResponse` (including all chart specs) for 1 hour. Regenerating a dashboard from scratch — four engine passes plus the LLM call — takes 2–4 seconds on the first run. Cache hits return instantly.

Each saved dashboard stores the `dataset_id` it was generated from. On load, if the dataset no longer exists (deleted by the user), the dashboard page shows an error rather than silently loading with missing data.

### Lessons learned

The four-engine pipeline is fully deterministic and fast, but it produces dashboards that all look similar. For different prompts on the same dataset, `KPISelector` picks the same top columns each time. A user who wants to build a dashboard focused on a specific business question (e.g., "customer retention" vs "revenue growth") gets the same output regardless of prompt. The prompt is currently used only for the LLM name/recommendations, not for influencing which KPIs or charts are selected. Prompt-aware KPI weighting would fix this.

The drag-and-drop layout persists correctly, but there's no undo. If a user rearranges panels and then saves, the previous layout is gone. A layout history stack would be straightforward to add but wasn't prioritised.

---

## Patterns that emerged across phases

Looking back at the ten phases, a few patterns recurred enough to be worth noting:

**Structured plan over generated code.** Every feature that uses an LLM follows the same shape: LLM produces a validated JSON plan, Python code executes it. This was a deliberate choice after Phase 2, applied consistently thereafter. It made testing straightforward and prevented a whole class of security problems.

**Two-layer analysis.** Phases 6, 7, and 8 all use the same structure: a deterministic statistical layer generates findings, an LLM reasoning layer writes the narrative, and the statistical findings are the fallback if the LLM fails. This pattern emerged in Phase 6 and was copied into the subsequent two phases because it worked.

**Filesystem-first storage.** Every persistent artifact (datasets, reports, dashboards, connections, CRUD audit logs) is stored as a file plus a JSON sidecar. This was chosen in Phase 1 for simplicity and kept because changing it mid-project would have been disruptive. It's the main architectural constraint that limits the system to a single server with a single persistent disk.

**Cache at the service layer.** Each analytically expensive service (`InsightService`, `RootCauseService`, `AnomalyService`, `KPIMonitorService`, `DataQualityService`, `DashboardService`) has its own in-process TTL or LRU cache. These caches are invisible to callers and can't be shared across workers. The result is fast responses for repeated requests on a single-worker deployment and cache misses on any multi-worker setup. That tradeoff was acceptable for the scope of the project.
