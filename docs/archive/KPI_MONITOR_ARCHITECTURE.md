# KPI Monitoring Agent — Architecture
**Status:** Awaiting approval
**Author:** Staff Analytics Engineer
**Date:** 2026-06-14
**Branch target:** `fresh-deploy`

---

## 0. Scope and Constraints

This document proposes the KPI Monitoring Agent — a user-configurable system that
registers KPI definitions tied to datasets, evaluates them on a 5-minute cadence,
compares values against user-defined thresholds, and generates alerts and
rule-based recommendations. Anomaly escalation delegates to the existing
`AnomalyDetectionService` (no code duplication).

**Security constraints (never relaxed):**
- No `eval()` anywhere
- No raw LLM-generated SQL — KPI values computed with deterministic pandas aggregation
- All KPIs and alerts scoped by `owner_sub` (JWT sub)
- No cross-user data exposure — every store method filters by `owner_sub`
- Threshold configuration requires authentication; values never come from untrusted input
- Do NOT allow arbitrary aggregation formulas — only the permitted aggregation enum

**Architectural constraints:**
- No new frameworks (no Celery, no Redis pub/sub, no websockets)
- No breaking changes to existing routes or schemas
- No new base classes
- Background monitoring uses the same `asyncio.ensure_future()` pattern as the
  existing `_periodic_session_expire` task in `main.py`
- SQLite storage uses the same `aiosqlite` + WAL mode pattern as `ConversationStore`

---

## 1. System Architecture

```
Browser: /kpi-monitor   (global route — not dataset-scoped)
  └─ KPIMonitorWorkspace.tsx  (Client Component)
       │  GET  /api/v1/kpi/status          → KPI health cards
       │  POST /api/v1/kpi/register        → KPI registration form
       │  POST /api/v1/kpi/check           → on-demand check cycle
       │  DELETE /api/v1/kpi/{id}          → KPI deletion (with confirm)
       │  PATCH /api/v1/kpi/{id}/thresholds → threshold editor
       │
       │  Renders:
       │    KPIHealthCards     │  RegisterKPIPanel
       │    ThresholdEditor    │  AlertTimeline
       ▼

FastAPI Backend  (/api/v1/kpi)
  └─ KPIMonitorRouter
       ├─ KPIMonitorService
       │    ├─ KPIStore (aiosqlite)         ← registry + alerts + snapshots
       │    ├─ KPICheckEngine               ← deterministic pandas value computation
       │    └─ KPIAlertEngine               ← threshold comparison + recommendations
       │
       └─ Shared deps:
            ├─ DatasetService               ← load_dataframe()
            └─ AnomalyDetectionService      ← escalation only (critical alerts)

main.py lifespan:
  └─ KPIStore.initialize()                 ← CREATE TABLE IF NOT EXISTS + WAL
  └─ asyncio.ensure_future(
       _periodic_kpi_check(kpi_svc, interval=300)
     )                                      ← background check every 5 min
```

**Why SQLite instead of JSON files?**

All other store classes (DashboardStore, ConnectionService) use one JSON file per
record. KPI monitoring is fundamentally different:

- Alerts accumulate over time and must be queried by severity, KPI, and time range
- Snapshots need atomic upserts (one row per KPI, always current)
- Cross-KPI queries ("show all WARNING KPIs") are O(1) in SQL vs O(n) filesystem scan
- The `ConversationStore` already proves the aiosqlite + WAL pattern works at process
  level — this is not a new dependency

---

## 2. The Six KPI Types

| KPI Type | Default Aggregation | Direction | Example Column |
|---|---|---|---|
| `revenue` | `sum` | `higher_better` | `order_total`, `revenue` |
| `profit` | `sum` | `higher_better` | `profit`, `net_income` |
| `churn` | `mean` | `lower_better` | `churned`, `churn_flag` (0/1) |
| `retention` | `mean` | `higher_better` | `retained`, `retention_flag` (0/1) |
| `conversion_rate` | `mean` | `higher_better` | `converted`, `conversion_flag` (0/1) |
| `inventory_turnover` | `mean` | `higher_better` | `turnover_ratio` |

All types use the same computation engine. `kpi_type` controls:
1. Default `aggregation` suggestion shown in the UI
2. Recommendation templates (different advice for churn vs revenue)
3. Display formatting (currency for revenue/profit, % for churn/retention/conversion)

The system is open to custom KPI names — `kpi_type` is validated against an enum,
but `name` is a free text field.

---

## 3. Permitted Aggregations

```python
class KPIAggregation(str, Enum):
    SUM   = "sum"    # total revenue, total profit
    MEAN  = "mean"   # churn rate, retention rate, conversion rate
    COUNT = "count"  # order count, customer count
    LAST  = "last"   # last known value (useful for inventory snapshots)
    MAX   = "max"    # peak value in period
    MIN   = "min"    # trough value in period
```

Only these six values are accepted — no formula strings, no eval.

---

## 4. SQLite Schema (`kpi_store/kpi_registry.db`)

```sql
-- KPI definitions
CREATE TABLE IF NOT EXISTS kpi_registry (
    kpi_id             TEXT PRIMARY KEY,  -- secrets.token_hex(16)
    owner_sub          TEXT NOT NULL,
    name               TEXT NOT NULL,
    kpi_type           TEXT NOT NULL,
    dataset_id         TEXT NOT NULL,
    value_column       TEXT NOT NULL,
    aggregation        TEXT NOT NULL DEFAULT 'sum',
    date_column        TEXT,            -- if NULL, no period comparison
    period             TEXT NOT NULL DEFAULT 'monthly',
    direction          TEXT NOT NULL DEFAULT 'higher_better',
    warning_threshold  REAL,           -- NULL = no warning threshold
    critical_threshold REAL,           -- NULL = no critical threshold
    enabled            INTEGER NOT NULL DEFAULT 1,
    description        TEXT,
    created_at         TEXT NOT NULL,  -- ISO 8601 UTC
    updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kpi_owner
    ON kpi_registry (owner_sub, enabled, kpi_type);

-- Per-KPI latest snapshot (upserted on every check)
CREATE TABLE IF NOT EXISTS kpi_snapshots (
    kpi_id          TEXT PRIMARY KEY,
    owner_sub       TEXT NOT NULL,
    current_value   REAL,
    previous_value  REAL,
    pct_change      REAL,
    trend           TEXT NOT NULL DEFAULT 'flat',  -- up | down | flat
    status          TEXT NOT NULL DEFAULT 'unknown',
    -- status: ok | warning | critical | error | unknown
    last_checked_at TEXT NOT NULL,
    check_time_ms   REAL,
    FOREIGN KEY (kpi_id) REFERENCES kpi_registry(kpi_id) ON DELETE CASCADE
);

-- Alert history (append-only, never updated)
CREATE TABLE IF NOT EXISTS kpi_alerts (
    alert_id        TEXT PRIMARY KEY,
    kpi_id          TEXT NOT NULL,
    owner_sub       TEXT NOT NULL,
    severity        TEXT NOT NULL,    -- critical | warning | info | resolved
    current_value   REAL NOT NULL,
    threshold       REAL,
    previous_value  REAL,
    pct_change      REAL,
    message         TEXT NOT NULL,
    recommendations TEXT,             -- JSON array of strings
    escalated       INTEGER DEFAULT 0,  -- 1 = AnomalyDetectionService was triggered
    created_at      TEXT NOT NULL,
    FOREIGN KEY (kpi_id) REFERENCES kpi_registry(kpi_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alerts_owner_time
    ON kpi_alerts (owner_sub, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_kpi_time
    ON kpi_alerts (kpi_id, created_at DESC);
```

---

## 5. KPI Value Computation (KPICheckEngine)

```python
class KPICheckEngine:
    """Deterministic pandas engine. No eval. No LLM. No raw SQL."""

    _PERIOD_MAP: dict[str, str] = {
        "daily":   "D",
        "weekly":  "W",
        "monthly": "M",
        "quarterly": "Q",
        "yearly":  "Y",
    }

    def compute(
        self,
        df: pd.DataFrame,
        kpi: KPIDefinition,
    ) -> KPICheckResult:
        """Compute current and previous period values for one KPI.

        Returns:
            KPICheckResult with current_value, previous_value,
            pct_change, trend, and raw_row_count.
        """
        col = kpi.value_column
        if col not in df.columns:
            raise KPIError(f"Column '{col}' not found in dataset.")

        series = pd.to_numeric(df[col], errors="coerce").dropna()
        if series.empty:
            raise KPIError(f"Column '{col}' has no numeric values.")

        # ── Period-based computation ──────────────────────────────────────
        if kpi.date_column and kpi.date_column in df.columns:
            df = df.copy()
            df["__date__"] = pd.to_datetime(df[kpi.date_column], errors="coerce")
            df = df.dropna(subset=["__date__"])
            df = df.sort_values("__date__")

            freq = self._PERIOD_MAP.get(kpi.period, "M")
            df["__period__"] = df["__date__"].dt.to_period(freq)

            grouped = (
                df.groupby("__period__")[col]
                .apply(lambda s: _aggregate(s, kpi.aggregation))
                .dropna()
            )

            if len(grouped) == 0:
                raise KPIError("No data after period grouping.")
            current_value = float(grouped.iloc[-1])
            previous_value = float(grouped.iloc[-2]) if len(grouped) >= 2 else None

        # ── Whole-dataset computation (no date column) ────────────────────
        else:
            current_value = float(_aggregate(series, kpi.aggregation))
            previous_value = None

        pct_change = _pct_change(current_value, previous_value)
        trend = _trend(pct_change)

        return KPICheckResult(
            kpi_id=kpi.kpi_id,
            current_value=current_value,
            previous_value=previous_value,
            pct_change=pct_change,
            trend=trend,
        )

def _aggregate(series: pd.Series, agg: str) -> float:
    """Apply the permitted aggregation. No eval."""
    match agg:
        case "sum":   return series.sum()
        case "mean":  return series.mean()
        case "count": return float(series.count())
        case "last":  return float(series.iloc[-1])
        case "max":   return series.max()
        case "min":   return series.min()
        case _:
            raise KPIError(f"Unknown aggregation: {agg!r}")

def _pct_change(current: float, previous: Optional[float]) -> Optional[float]:
    if previous is None or abs(previous) < 1e-9:
        return None
    return round((current - previous) / abs(previous) * 100, 4)

def _trend(pct: Optional[float]) -> str:
    if pct is None:   return "flat"
    if pct > 1.0:     return "up"
    if pct < -1.0:    return "down"
    return "flat"
```

---

## 6. Alert Generation (KPIAlertEngine)

```python
class KPIAlertEngine:
    """Rule-based threshold comparison and recommendation generation.

    Zero LLM. Zero eval.
    """

    def evaluate(
        self,
        kpi: KPIDefinition,
        result: KPICheckResult,
    ) -> KPIEvaluation:
        """Compare result against thresholds and produce status + alert."""
        status = self._compute_status(kpi, result.current_value)
        alert: Optional[KPIAlert] = None

        if status in ("warning", "critical"):
            breached = (
                kpi.critical_threshold
                if status == "critical"
                else kpi.warning_threshold
            )
            msg = self._make_message(kpi, result, status, breached)
            recs = self._make_recommendations(kpi, result, status)
            alert = KPIAlert(
                kpi_id=kpi.kpi_id,
                severity=status,
                current_value=result.current_value,
                threshold=breached,
                previous_value=result.previous_value,
                pct_change=result.pct_change,
                message=msg,
                recommendations=recs,
                escalated=False,
            )

        return KPIEvaluation(status=status, alert=alert)

    def _compute_status(self, kpi: KPIDefinition, value: float) -> str:
        """Determine status based on direction and threshold breach."""
        higher_better = kpi.direction == "higher_better"

        def _breaches_critical() -> bool:
            if kpi.critical_threshold is None:
                return False
            if higher_better:
                return value < kpi.critical_threshold   # below critical floor
            return value > kpi.critical_threshold       # above critical ceiling

        def _breaches_warning() -> bool:
            if kpi.warning_threshold is None:
                return False
            if higher_better:
                return value < kpi.warning_threshold
            return value > kpi.warning_threshold

        if _breaches_critical():
            return "critical"
        if _breaches_warning():
            return "warning"
        return "ok"
```

---

## 7. Alert Recommendation Templates

All recommendations are generated deterministically — no LLM call required.

```python
_REC_TEMPLATES: dict[tuple[str, str], list[str]] = {
    ("revenue", "critical"): [
        "Revenue has fallen below the critical floor ({val} vs threshold {thr}). "
        "Investigate pipeline health and recent order cancellations immediately.",
        "Check for data pipeline delays — a missing data batch can cause revenue "
        "to appear lower than actuals.",
        "Review the top 5 revenue-contributing segments in the dataset for recent drop-off.",
    ],
    ("revenue", "warning"): [
        "Revenue is approaching the warning threshold ({val} vs {thr}). "
        "Monitor daily and prepare contingency messaging for stakeholders.",
    ],
    ("churn", "critical"): [
        "Churn rate ({val:.1%}) has exceeded the critical ceiling ({thr:.1%}). "
        "Initiate an emergency retention campaign for at-risk cohorts.",
        "Run Root Cause Analysis on the churn column to identify the primary "
        "driver segments.",
    ],
    ("churn", "warning"): [
        "Churn rate is elevated at {val:.1%} (warning threshold: {thr:.1%}). "
        "Review recent product changes or pricing adjustments.",
    ],
    ("retention", "critical"): [
        "Retention rate ({val:.1%}) has dropped below the critical floor. "
        "Cross-reference against churn drivers using Root Cause Analysis.",
    ],
    ("retention", "warning"): [
        "Retention rate ({val:.1%}) is below the warning threshold ({thr:.1%}). "
        "Consider proactive re-engagement campaigns for lapsing customers.",
    ],
    ("conversion_rate", "critical"): [
        "Conversion rate ({val:.2%}) is critically low. "
        "Audit funnel entry-to-exit ratios and check for A/B test anomalies.",
    ],
    ("conversion_rate", "warning"): [
        "Conversion rate has dipped to {val:.2%} (threshold: {thr:.2%}). "
        "Review recent landing page or checkout flow changes.",
    ],
    ("profit", "critical"): [
        "Profit ({val}) is below the critical floor ({thr}). "
        "Examine cost of goods sold and operating expense trends.",
    ],
    ("profit", "warning"): [
        "Profit margin is narrowing — current value {val} is near the warning "
        "threshold of {thr}. Check for recent cost increases.",
    ],
    ("inventory_turnover", "critical"): [
        "Inventory turnover ({val:.2f}×) is below the critical threshold. "
        "High stock levels may indicate demand shortfall or supply chain miscalculation.",
    ],
    ("inventory_turnover", "warning"): [
        "Inventory turnover is trending lower at {val:.2f}× (threshold: {thr:.2f}×). "
        "Evaluate reorder points and slow-moving SKUs.",
    ],
}
```

Trend-based additions (appended when `pct_change` is significant):
```python
if abs(pct_change) > 20 and trend == "down":
    recs.append(f"{kpi.name} fell {abs(pct_change):.1f}% vs prior period — "
                "consider running Anomaly Detection to identify the root cause.")
```

---

## 8. Anomaly Escalation

When a KPI reaches **critical** status, the check cycle optionally escalates to
`AnomalyDetectionService` to confirm the critical value is statistically anomalous
(not just a threshold breach from a manually-set threshold that is slightly off).

```python
# In KPIMonitorService.check():
if eval_result.status == "critical" and kpi.date_column:
    try:
        anomaly_response = await self._anomaly_svc.detect(
            df=df,
            request_dict={
                "dataset_id": kpi.dataset_id,
                "columns": [kpi.value_column],
                "methods": ["iqr", "zscore"],
            },
        )
        is_anomalous = any(
            ca.column == kpi.value_column and ca.total_anomalies > 0
            for ca in anomaly_response.column_anomalies
        )
        if is_anomalous:
            alert.escalated = True
            alert.recommendations.append(
                f"Statistical anomaly confirmed in '{kpi.value_column}' — "
                "this is not a normal variation. Escalate to data team."
            )
    except Exception as exc:
        logger.warning("KPI escalation: anomaly check failed: %s", exc)
```

Escalation is fire-and-forget — it enriches the alert but never blocks the check
cycle. If `AnomalyDetectionService` is unavailable, the alert is saved without
escalation.

---

## 9. Background Monitoring (`main.py` lifespan addition)

```python
async def _periodic_kpi_check(kpi_svc: KPIMonitorService, interval: int = 300) -> None:
    """Run a KPI check cycle for all users every ``interval`` seconds (default 5 min).

    Identical pattern to _periodic_session_expire.
    """
    while True:
        await asyncio.sleep(interval)
        try:
            results = await kpi_svc.check_all_users()
            new_alerts = sum(1 for r in results if r.alert_generated)
            if new_alerts:
                logger.info(
                    "KPI Monitor: %d alert(s) in scheduled check (%d KPIs checked).",
                    new_alerts, len(results),
                )
        except Exception as exc:
            logger.warning("KPI Monitor: periodic check failed: %s", exc)
```

The background task runs `check_all_users()` which iterates over all enabled KPIs
across all users. Each check loads the dataset into the dataframe cache (which is
shared with other services via `DatasetService`) so repeated loads within the same
TTL window are free.

---

## 10. API Specification

### `POST /api/v1/kpi/register`
Register a new KPI definition.

**Request:**
```json
{
  "name": "Monthly Revenue",
  "kpi_type": "revenue",
  "dataset_id": "abc123...",
  "value_column": "revenue",
  "date_column": "order_date",
  "period": "monthly",
  "aggregation": "sum",
  "direction": "higher_better",
  "warning_threshold": 100000,
  "critical_threshold": 80000,
  "description": "Total monthly revenue from all channels"
}
```

**Response:** `KPIDefinition` (201 Created)
```json
{
  "kpi_id": "7f3a9b...",
  "name": "Monthly Revenue",
  "kpi_type": "revenue",
  "dataset_id": "abc123...",
  "value_column": "revenue",
  "date_column": "order_date",
  "period": "monthly",
  "aggregation": "sum",
  "direction": "higher_better",
  "warning_threshold": 100000,
  "critical_threshold": 80000,
  "enabled": true,
  "created_at": "2026-06-14T10:00:00Z",
  "updated_at": "2026-06-14T10:00:00Z",
  "description": "Total monthly revenue from all channels"
}
```

---

### `GET /api/v1/kpi/status`
Get current status of all KPIs with latest snapshot for the current user.

**Response:** `KPIStatusResponse`
```json
{
  "count": 3,
  "critical_count": 1,
  "warning_count": 1,
  "ok_count": 1,
  "kpis": [
    {
      "definition": { ...KPIDefinition... },
      "snapshot": {
        "current_value": 72340.5,
        "previous_value": 98200.0,
        "pct_change": -26.3,
        "trend": "down",
        "status": "critical",
        "last_checked_at": "2026-06-14T09:55:00Z",
        "check_time_ms": 84.2
      },
      "recent_alerts": [
        {
          "alert_id": "...",
          "severity": "critical",
          "message": "Monthly Revenue has fallen below the critical floor...",
          "recommendations": ["..."],
          "escalated": true,
          "created_at": "2026-06-14T09:55:00Z"
        }
      ]
    }
  ]
}
```

---

### `POST /api/v1/kpi/check`
Trigger an immediate check cycle for all (or specific) KPIs.

**Request:**
```json
{
  "kpi_ids": null,
  "force": false
}
```
`force=false` skips a KPI if it was checked within the last `kpi_min_check_interval_seconds`
(default 60s) — prevents accidental hammering. `force=true` always re-checks.

**Response:** `KPICheckResponse`
```json
{
  "checked": 3,
  "alerts_generated": 1,
  "escalated": 1,
  "results": [
    {
      "kpi_id": "7f3a9b...",
      "name": "Monthly Revenue",
      "status": "critical",
      "current_value": 72340.5,
      "previous_value": 98200.0,
      "pct_change": -26.3,
      "trend": "down",
      "alert_generated": true,
      "escalated": true,
      "check_time_ms": 84.2
    }
  ]
}
```

---

### `PATCH /api/v1/kpi/{kpi_id}/thresholds`
Update warning/critical thresholds (and optionally direction, enabled).
Used by the Threshold Editor in the UI.

**Request:**
```json
{
  "warning_threshold": 90000,
  "critical_threshold": 70000,
  "direction": "higher_better",
  "enabled": true
}
```
**Response:** `KPIDefinition` (200 OK, updated record)

---

### `DELETE /api/v1/kpi/{kpi_id}`
Delete a KPI and all its alerts. Scoped to the current user.
**Response:** 204 No Content

---

### `GET /api/v1/kpi/{kpi_id}/alerts`
Get alert history for one KPI (paginated, most recent first).
**Query params:** `limit=50&offset=0&severity=critical`
**Response:** `KPIAlertListResponse` (list of `KPIAlert`)

---

## 11. Pydantic Schemas (`backend/app/schemas/kpi_monitor.py`)

```python
class KPIType(str, Enum):
    REVENUE          = "revenue"
    PROFIT           = "profit"
    CHURN            = "churn"
    RETENTION        = "retention"
    CONVERSION_RATE  = "conversion_rate"
    INVENTORY_TURNOVER = "inventory_turnover"

class KPIAggregation(str, Enum):
    SUM   = "sum"
    MEAN  = "mean"
    COUNT = "count"
    LAST  = "last"
    MAX   = "max"
    MIN   = "min"

class KPIPeriod(str, Enum):
    DAILY     = "daily"
    WEEKLY    = "weekly"
    MONTHLY   = "monthly"
    QUARTERLY = "quarterly"
    YEARLY    = "yearly"

class KPIDirection(str, Enum):
    HIGHER_BETTER = "higher_better"
    LOWER_BETTER  = "lower_better"

class KPIAlertSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING  = "warning"
    INFO     = "info"
    RESOLVED = "resolved"

class KPIStatus(str, Enum):
    OK      = "ok"
    WARNING = "warning"
    CRITICAL= "critical"
    ERROR   = "error"
    UNKNOWN = "unknown"

class RegisterKPIRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    kpi_type: KPIType
    dataset_id: str
    value_column: str
    date_column: Optional[str] = None
    period: KPIPeriod = KPIPeriod.MONTHLY
    aggregation: Optional[KPIAggregation] = None  # None → default per kpi_type
    direction: Optional[KPIDirection] = None       # None → default per kpi_type
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None
    description: Optional[str] = Field(None, max_length=500)

class KPIDefinition(BaseModel):
    kpi_id: str
    owner_sub: str
    name: str
    kpi_type: KPIType
    dataset_id: str
    value_column: str
    date_column: Optional[str]
    period: KPIPeriod
    aggregation: KPIAggregation
    direction: KPIDirection
    warning_threshold: Optional[float]
    critical_threshold: Optional[float]
    enabled: bool
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

class KPISnapshot(BaseModel):
    current_value: Optional[float]
    previous_value: Optional[float]
    pct_change: Optional[float]
    trend: str   # "up" | "down" | "flat"
    status: KPIStatus
    last_checked_at: datetime
    check_time_ms: Optional[float]

class KPIAlert(BaseModel):
    alert_id: str
    kpi_id: str
    severity: KPIAlertSeverity
    current_value: float
    threshold: Optional[float]
    previous_value: Optional[float]
    pct_change: Optional[float]
    message: str
    recommendations: list[str]
    escalated: bool
    created_at: datetime

class KPIStatusEntry(BaseModel):
    definition: KPIDefinition
    snapshot: Optional[KPISnapshot]
    recent_alerts: list[KPIAlert]

class KPIStatusResponse(BaseModel):
    count: int
    critical_count: int
    warning_count: int
    ok_count: int
    kpis: list[KPIStatusEntry]

class KPICheckRequest(BaseModel):
    kpi_ids: Optional[list[str]] = None
    force: bool = False

class KPICheckResultItem(BaseModel):
    kpi_id: str
    name: str
    status: KPIStatus
    current_value: Optional[float]
    previous_value: Optional[float]
    pct_change: Optional[float]
    trend: str
    alert_generated: bool
    escalated: bool
    check_time_ms: float

class KPICheckResponse(BaseModel):
    checked: int
    alerts_generated: int
    escalated: int
    results: list[KPICheckResultItem]

class UpdateThresholdsRequest(BaseModel):
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None
    direction: Optional[KPIDirection] = None
    enabled: Optional[bool] = None
```

---

## 12. Service Architecture (`backend/app/services/kpi_monitor_service.py`)

```python
class KPIMonitorService:
    """Orchestrates KPI registration, evaluation, alerting, and escalation."""

    def __init__(
        self,
        kpi_store: KPIStore,
        dataset_service: DatasetService,
        anomaly_service: AnomalyDetectionService,
        min_check_interval_seconds: float = 60.0,
    ) -> None:
        self._store = kpi_store
        self._datasets = dataset_service
        self._anomaly_svc = anomaly_service
        self._engine = KPICheckEngine()
        self._alert_engine = KPIAlertEngine()
        self._min_interval = min_check_interval_seconds

    async def register(
        self, request: RegisterKPIRequest, owner_sub: str
    ) -> KPIDefinition: ...

    async def status(self, owner_sub: str) -> KPIStatusResponse: ...

    async def check(
        self,
        request: KPICheckRequest,
        owner_sub: str,
    ) -> KPICheckResponse: ...

    async def update_thresholds(
        self,
        kpi_id: str,
        request: UpdateThresholdsRequest,
        owner_sub: str,
    ) -> KPIDefinition: ...

    async def delete(self, kpi_id: str, owner_sub: str) -> None: ...

    async def check_all_users(self) -> list[KPICheckResultItem]:
        """Called by the background task. Checks all enabled KPIs across all users."""
        ...
```

No `set_client()` — the engine is fully deterministic (no direct LLM calls).
Anomaly escalation reuses the shared `AnomalyDetectionService` instance, which
already has its own TTL cache.

---

## 13. Store Architecture (`backend/app/services/kpi_store.py`)

```python
class KPIStore:
    """Async aiosqlite store for KPI registry, snapshots, and alerts."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = str(db_path)

    async def initialize(self) -> None:
        """Create tables and enable WAL mode. Safe to call multiple times."""
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.executescript(_DDL)
            await db.commit()

    async def save_kpi(self, kpi: KPIDefinition) -> None: ...
    async def get_kpi(self, kpi_id: str, owner_sub: str) -> KPIDefinition: ...
    async def list_kpis(self, owner_sub: str, enabled_only: bool = True) -> list[KPIDefinition]: ...
    async def list_all_enabled(self) -> list[KPIDefinition]: ...  # background task
    async def update_kpi(self, kpi: KPIDefinition) -> None: ...
    async def delete_kpi(self, kpi_id: str, owner_sub: str) -> None: ...

    async def upsert_snapshot(self, snapshot: KPISnapshot, kpi_id: str, owner_sub: str) -> None: ...
    async def get_snapshot(self, kpi_id: str) -> Optional[KPISnapshot]: ...

    async def save_alert(self, alert: KPIAlert, owner_sub: str) -> None: ...
    async def list_alerts(
        self, kpi_id: str, owner_sub: str,
        limit: int = 50, offset: int = 0,
        severity: Optional[str] = None,
    ) -> list[KPIAlert]: ...
    async def recent_alerts_for_user(
        self, owner_sub: str, limit: int = 20
    ) -> list[KPIAlert]: ...
```

All methods accept `owner_sub` and filter by it. The `list_all_enabled()` method
(for the background task) omits the `owner_sub` filter to scan all users — this is
the only cross-user query and is only callable from the internal background task,
never from a route.

---

## 14. Configuration Changes

### `backend/app/core/config.py`

```python
# ── KPI Monitoring Agent ──────────────────────────────────────────────────────
kpi_store_dir: Path = Path("kpi_store")

# Cache TTL for dataframe loads during checks
# (KPI check uses DatasetService.load_dataframe which has its own LRU cache;
# this setting controls the background task's check interval, not a new cache)
kpi_monitor_check_interval_seconds: float = 300.0    # background task cadence
kpi_min_check_interval_seconds: float = 60.0         # per-KPI minimum between checks
kpi_max_kpis_per_user: int = 20                      # prevent runaway registrations
kpi_alert_history_days: int = 30                     # alerts older than N days excluded from status
```

### `_STORAGE_FIELDS` addition

```python
_STORAGE_FIELDS: tuple[str, ...] = (
    ...existing fields...,
    "kpi_store_dir",    # ← add this
)
```

### `backend/app/core/storage.py`

Add `("kpi_store", settings.kpi_store_dir)` to `self._volumes` in `StorageManager.__init__`.

### `backend/app/core/exceptions.py`

```python
class KPIError(DataAssistantError):
    """Raised when KPI computation or storage encounters an error."""

class KPINotFoundError(DataAssistantError):
    """Raised when a requested KPI does not exist or is not owned by the caller."""
```

---

## 15. Dependency Factory (`backend/app/api/dependencies.py`)

```python
@lru_cache(maxsize=1)
def get_kpi_monitor_service() -> KPIMonitorService:
    from app.services.kpi_store import KPIStore
    from app.services.kpi_monitor_service import KPIMonitorService

    settings = get_settings()
    store = KPIStore(settings.kpi_store_dir / "kpi_registry.db")
    return KPIMonitorService(
        kpi_store=store,
        dataset_service=get_dataset_service(),
        anomaly_service=get_anomaly_service(),
        min_check_interval_seconds=settings.kpi_min_check_interval_seconds,
    )
```

---

## 16. main.py Changes

```python
# Imports to add:
from app.api.routes import kpi_monitor
from app.api.dependencies import get_kpi_monitor_service

# In lifespan, after _mem_svc initialization:
_kpi_svc = get_kpi_monitor_service()
await _kpi_svc._store.initialize()   # CREATE TABLE IF NOT EXISTS + WAL
_kpi_task = asyncio.ensure_future(
    _periodic_kpi_check(_kpi_svc, interval=settings.kpi_monitor_check_interval_seconds)
)

# Cancel alongside _expire_task in finally:
_kpi_task.cancel()

# In create_app():
app.include_router(kpi_monitor.router, prefix=API_PREFIX)
```

```python
async def _periodic_kpi_check(kpi_svc, interval: int = 300) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            results = await kpi_svc.check_all_users()
            new_alerts = sum(1 for r in results if r.alert_generated)
            if new_alerts:
                logger.info("KPI Monitor: %d alert(s) in scheduled check.", new_alerts)
        except Exception as exc:
            logger.warning("KPI Monitor: periodic check failed: %s", exc)
```

---

## 17. Frontend Architecture

### 17.1 Route

**Route:** `/kpi-monitor` (global, not dataset-scoped — a user monitors KPIs across datasets)

Not `/datasets/[id]/kpi` because:
- A user may monitor revenue from Dataset A and churn from Dataset B simultaneously
- The alert timeline and status cards are cross-dataset by design

### 17.2 TypeScript types (appended to `frontend-next/src/lib/api/types.ts`)

```typescript
export type KPIType = "revenue"|"profit"|"churn"|"retention"|"conversion_rate"|"inventory_turnover";
export type KPIAggregation = "sum"|"mean"|"count"|"last"|"max"|"min";
export type KPIPeriod = "daily"|"weekly"|"monthly"|"quarterly"|"yearly";
export type KPIDirection = "higher_better"|"lower_better";
export type KPIStatus = "ok"|"warning"|"critical"|"error"|"unknown";
export type KPIAlertSeverity = "critical"|"warning"|"info"|"resolved";

export interface KPIDefinition {
  kpi_id: string; name: string; kpi_type: KPIType;
  dataset_id: string; value_column: string; date_column: string | null;
  period: KPIPeriod; aggregation: KPIAggregation; direction: KPIDirection;
  warning_threshold: number | null; critical_threshold: number | null;
  enabled: boolean; description: string | null;
  created_at: string; updated_at: string;
}

export interface KPISnapshot {
  current_value: number | null; previous_value: number | null;
  pct_change: number | null; trend: "up"|"down"|"flat";
  status: KPIStatus; last_checked_at: string; check_time_ms: number | null;
}

export interface KPIAlert {
  alert_id: string; kpi_id: string; severity: KPIAlertSeverity;
  current_value: number; threshold: number | null;
  previous_value: number | null; pct_change: number | null;
  message: string; recommendations: string[];
  escalated: boolean; created_at: string;
}

export interface KPIStatusEntry {
  definition: KPIDefinition; snapshot: KPISnapshot | null; recent_alerts: KPIAlert[];
}

export interface KPIStatusResponse {
  count: number; critical_count: number; warning_count: number; ok_count: number;
  kpis: KPIStatusEntry[];
}

export interface RegisterKPIRequest {
  name: string; kpi_type: KPIType; dataset_id: string;
  value_column: string; date_column?: string | null; period?: KPIPeriod;
  aggregation?: KPIAggregation; direction?: KPIDirection;
  warning_threshold?: number | null; critical_threshold?: number | null;
  description?: string | null;
}

export interface KPICheckRequest { kpi_ids?: string[] | null; force?: boolean; }

export interface KPICheckResultItem {
  kpi_id: string; name: string; status: KPIStatus;
  current_value: number | null; previous_value: number | null;
  pct_change: number | null; trend: string;
  alert_generated: boolean; escalated: boolean; check_time_ms: number;
}

export interface KPICheckResponse {
  checked: number; alerts_generated: number; escalated: number;
  results: KPICheckResultItem[];
}

export interface UpdateThresholdsRequest {
  warning_threshold?: number | null; critical_threshold?: number | null;
  direction?: KPIDirection; enabled?: boolean;
}
```

### 17.3 API client (`frontend-next/src/lib/api/kpi-monitor.ts`)

```typescript
export async function getKPIStatus(): Promise<KPIStatusResponse>
export async function registerKPI(r: RegisterKPIRequest): Promise<KPIDefinition>
export async function checkKPIs(r: KPICheckRequest): Promise<KPICheckResponse>
export async function updateThresholds(id: string, r: UpdateThresholdsRequest): Promise<KPIDefinition>
export async function deleteKPI(id: string): Promise<void>
export async function getKPIAlerts(id: string, params?: {limit?:number; severity?:string}): Promise<KPIAlert[]>
```

### 17.4 `KPIMonitorWorkspace.tsx` — Component Layout

```
<AppShell>
  ─── Header ─────────────────────────────────────────────────────────
  Activity icon  │  "KPI Monitor"
  Summary badges: ● {n} Critical  ● {n} Warning  ● {n} OK
  [Run Check] button  │  [+ Register KPI] button  │  Last checked: {time}

  ─── KPI Health Cards (responsive grid) ─────────────────────────────
  Card per KPI:
    ┌─────────────────────────────────────────┐
    │ [TYPE BADGE]   REVENUE         [●CRIT]  │
    │ $72,340.50                              │
    │ ▼ -26.3% vs prev period                 │
    │ ────────────────────────────────────── │
    │ ⚠ Warn: $100,000 │ 🔴 Crit: $80,000   │
    │ Last check: 3m ago · 84ms              │
    │ [Edit Thresholds]  [Run Check]         │
    └─────────────────────────────────────────┘

  Status badge colors:
    critical → red bg (bg-red-50 border-red-200 text-red-700)
    warning  → amber bg
    ok       → emerald bg
    unknown  → muted bg

  Trend arrows:
    up   → TrendingUp (green if higher_better, red if lower_better)
    down → TrendingDown (red if higher_better, green if lower_better)
    flat → Minus (muted)

  ─── Threshold Editor (sheet/drawer, opens per-KPI) ─────────────────
  Triggered by [Edit Thresholds] — opens a side sheet (Sheet from shadcn/ui)
  Fields:
    Warning threshold  [number input]
    Critical threshold [number input]
    Direction          [toggle: Higher Better / Lower Better]
    Enabled            [toggle]
  [Save] button → PATCH /api/v1/kpi/{id}/thresholds

  ─── Register KPI Panel (dialog/modal) ──────────────────────────────
  Triggered by [+ Register KPI]:
    KPI Name          [text]
    KPI Type          [select: Revenue / Profit / Churn / Retention / Conversion / Inventory]
    Dataset           [select: lists user's datasets from DatasetService]
    Value Column      [text — will add combobox after dataset selected]
    Date Column       [text, optional]
    Period            [select: Daily / Weekly / Monthly / Quarterly / Yearly]
    Aggregation       [select: Sum / Mean / Count / Last / Max / Min]
    Direction         [toggle: Higher Better / Lower Better]
    Warning Threshold [number, optional]
    Critical Threshold[number, optional]
    Description       [textarea, optional]
  [Register] button → POST /api/v1/kpi/register

  ─── Alert Timeline ─────────────────────────────────────────────────
  Section header: "Recent Alerts ({n})"
  Severity filter: All | Critical | Warning | Info
  Timeline list (newest first):
    ● [CRIT badge]  Monthly Revenue  2026-06-14 09:55
      "Revenue has fallen below the critical floor ($72,340 vs $80,000)"
      Recommendations (collapsible):
        • "Investigate pipeline health..."
        • "Check for data pipeline delays..."
      [🔺 Escalated — statistical anomaly confirmed]  (if escalated)
```

**Data-fetching strategy:**
- `useQuery({ queryKey: ["kpi-status"], queryFn: getKPIStatus, refetchInterval: 60_000 })`
  — auto-refresh every 60s without user action
- `useMutation(checkKPIs)` → `[Run Check]` button invalidates `kpi-status`
- `useMutation(registerKPI)` → `[Register]` invalidates `kpi-status`
- `useMutation(updateThresholds)` → `[Save]` in threshold editor invalidates `kpi-status`
- `useMutation(deleteKPI)` → requires user confirmation before executing

### 17.5 Page

```tsx
// frontend-next/src/app/kpi-monitor/page.tsx
export const metadata: Metadata = { title: "KPI Monitor" };

export default function KPIMonitorPage() {
  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <KPIMonitorWorkspace />
    </AppShell>
  );
}
```

### 17.6 Sidebar + Topbar additions

**Sidebar**: Add a "KPI Monitor" navigation item (`Activity` icon) in the main nav
group, between Datasets and Reports (or wherever the sidebar's nav list lives).

**Topbar:**
```typescript
if (pathname === "/kpi-monitor") return "KPI Monitor";
```

---

## 18. Complete File List

### Backend — new files (5)

| File | Description |
|---|---|
| `backend/app/schemas/kpi_monitor.py` | All Pydantic models and enums |
| `backend/app/services/kpi_store.py` | Async aiosqlite store (DDL + CRUD) |
| `backend/app/services/kpi_monitor_service.py` | `KPICheckEngine` + `KPIAlertEngine` + `KPIMonitorService` |
| `backend/app/api/routes/kpi_monitor.py` | 6 endpoints |
| `backend/tests/test_kpi_monitor.py` | 28-test suite |

### Backend — modified files (5)

| File | Change |
|---|---|
| `backend/app/core/config.py` | `kpi_store_dir` + 4 settings fields; `_STORAGE_FIELDS` tuple |
| `backend/app/core/storage.py` | Add `kpi_store` to `_volumes` list |
| `backend/app/core/exceptions.py` | `KPIError`, `KPINotFoundError` |
| `backend/app/api/dependencies.py` | `get_kpi_monitor_service()` factory |
| `backend/app/main.py` | Router + `_periodic_kpi_check` task + store init |

### Frontend — new files (3)

| File | Description |
|---|---|
| `frontend-next/src/lib/api/kpi-monitor.ts` | 6 API client functions |
| `frontend-next/src/components/kpi-monitor/KPIMonitorWorkspace.tsx` | Full workspace |
| `frontend-next/src/app/kpi-monitor/page.tsx` | Route page |

### Frontend — modified files (4)

| File | Change |
|---|---|
| `frontend-next/src/lib/api/types.ts` | Append TypeScript types |
| `frontend-next/src/components/layout/Sidebar.tsx` | Add KPI Monitor nav item |
| `frontend-next/src/components/layout/Topbar.tsx` | Add page title |
| *(dataset selector)* | Register KPI form needs dataset list — uses existing `/api/v1/datasets` |

**Total: 8 new files, 9 modified files.**

---

## 19. Test Plan (`backend/tests/test_kpi_monitor.py`)

| Class | Tests | Coverage |
|---|---|---|
| `TestKPICheckEngine` | 5 | sum/mean aggregation, period split, no date col, missing col → KPIError, zero denom pct_change |
| `TestKPIAlertEngine` | 5 | ok status no alert, warning breach, critical breach, lower_better direction, both thresholds null |
| `TestKPIStore` | 6 | save+get roundtrip, get wrong owner → raises, list scoped to user, upsert snapshot, save alert, list alerts filtered by severity |
| `TestRecommendationTemplates` | 3 | revenue critical → 3 recs, churn warning → 1 rec, trend_down appended |
| `TestHTTPRegister` | 3 | register→201, duplicate name ok (no uniqueness constraint), invalid kpi_type→422 |
| `TestHTTPStatus` | 2 | empty user returns count=0, populated user returns snapshots |
| `TestHTTPCheck` | 3 | check→200 with results, force=false skips recent, force=true re-checks |
| `TestHTTPThresholds` | 1 | PATCH updates only provided fields, others unchanged |

---

## 20. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Background task checks ALL users — large dataset loads in batch | Medium | `DatasetService.load_dataframe` uses LRU cache; checks are O(KPI) not O(dataset rows) |
| SQLite WAL contention with concurrent check + API request | Low | Each aiosqlite connection is opened per-call (same as ConversationStore); WAL allows concurrent reads |
| User registers 20 KPIs × 50K row datasets → 300s background load | Medium | `kpi_max_kpis_per_user=20` cap; KPICheckEngine samples first `_SAMPLE_ROWS=50_000` rows |
| Anomaly escalation delays alert insertion | Low | Escalation wrapped in try/except; alert saved before escalation attempt |
| `PATCH /thresholds` sends null to unset a threshold | Low | Pydantic distinguishes `None` (unset) vs absent via `model_fields_set` — only update provided fields |
| Register form requires dataset column list | Low | UI does a GET /api/v1/datasets/{id} after dataset selection to populate column combobox |
| `_periodic_kpi_check` runs at process start, before `initialize()` | None | `initialize()` is called in lifespan BEFORE `asyncio.ensure_future` |

---

## 21. What Is NOT in Scope

- Push notifications / webhooks when an alert fires (would need WebSocket or SSE)
- Scheduled KPI reports by email
- Multi-column KPI formulas (e.g. revenue - cost = profit computed inline)
- KPI comparison across datasets (joins)
- SLA breach tracking
- Custom aggregation expressions
- Mobile-responsive chart views

---

## 22. Open Questions

1. **Alert deduplication:** Should a second check that finds the same KPI in critical
   status create a new `kpi_alerts` row, or suppress if an unresolved critical alert
   already exists? Recommended: **suppress** — only create a new alert when status
   *transitions* (ok→warning, warning→critical), not on every check while already critical.
   This requires storing `previous_status` in `kpi_snapshots`.

2. **`kpi_max_kpis_per_user`:** 20 is a conservative default. Should this be unlimited
   for development and only enforced in production?
   Recommended: **enforce in both** — the background check scales linearly with total
   KPI count, so a cap of 20 keeps worst-case check time bounded.

3. **Dataset column combobox in Register form:** The form needs to call the existing
   `GET /api/v1/datasets/{id}` endpoint (which returns `column_names`) after the user
   selects a dataset to populate the value/date column dropdowns. Is this acceptable
   UX, or should the column list be part of the KPI status response?
   Recommended: **client-side fetch after dataset selection** — no API change needed.

4. **Alert status `resolved`:** When a KPI transitions from warning/critical back to
   ok, should a `resolved` alert be inserted to mark the end of the incident?
   Recommended: **yes** — this makes the alert timeline self-contained (you can see when
   an incident started and ended without cross-referencing snapshots).

---

## 23. Approval

To proceed with implementation, reply: **"Approved — begin implementation"**
(with any answers to open questions above, especially Q1 and Q4 on alert deduplication
and resolution events).

**Do not start coding until this document is approved.**
