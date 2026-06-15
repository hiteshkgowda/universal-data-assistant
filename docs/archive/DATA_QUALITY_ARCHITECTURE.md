# Data Quality Agent — Architecture
**Status:** Awaiting approval
**Author:** Senior Data Platform Architect
**Date:** 2026-06-14
**Branch target:** `fresh-deploy`

---

## 0. Scope and Constraints

This document proposes the architecture for a Data Quality Agent that
automatically analyses uploaded datasets across 10 quality dimensions and
produces per-column health scores, ranked issues, and rule-based recommendations.

**Security constraints (never relaxed):**
- No `eval()` anywhere
- No raw LLM-generated SQL; no LLM touches column selection or data computation
- All analysis is deterministic pandas/numpy — results are reproducible
- Results scoped by `owner_sub` — no cross-user data exposure
- No destructive mutations to the dataset

**Architectural constraints:**
- No new frameworks, no new base classes
- No breaking changes to existing routes or schemas
- No additional agent files in `agents/` — all 10 checks are fully deterministic;
  LLM is optionally used only for recommendation text (with rule-based fallback)
- Follows the exact same pattern as `AnomalyDetectionService` (engine + service + TTL cache)

---

## 1. System Architecture Diagram

```
Browser: /datasets/{id}/data-quality
  └─ DataQualityWorkspace.tsx  (Client Component)
       │  On mount → POST /api/v1/data-quality/analyze
       │  Returns immediately with cached result if available
       │
       │  Renders:
       │    QualityScoreCard  │  ColumnHealthTable
       │    IssueSeverityList │  RecommendationsPanel
       ▼

FastAPI Backend  (/api/v1/data-quality)
  └─ DataQualityRouter
       └─ DataQualityService
            ├─ TTLCache[dataset_id → DataQualityReport]     (TTL=300s)
            └─ DataQualityEngine  ← 10 deterministic checkers
                 │
                 ├─  1. MissingValueChecker
                 ├─  2. DuplicateRowChecker
                 ├─  3. FormatValidationChecker
                 ├─  4. SchemaConsistencyChecker
                 ├─  5. OutlierChecker
                 ├─  6. CardinalityChecker
                 ├─  7. DataDriftChecker
                 ├─  8. NullDistributionChecker
                 ├─  9. ColumnCompletenessChecker
                 └─ 10. TypeValidationChecker
```

**No new storage volume** — results live in the in-memory TTL cache (same as
`AnomalyDetectionService`, `InsightGenerationService`, `RecommendationService`).
Data quality analysis is fast enough (<200ms on 50K rows) that disk persistence
is unnecessary.

---

## 2. The Ten Checks — Algorithms

### Check 1 — Missing Values

**Type:** Deterministic (pandas)
**Per column:**
```
null_count  = df[col].isnull().sum()
null_ratio  = null_count / len(df)

severity thresholds:
  critical if null_ratio > 0.50   (more than half the column is empty)
  high     if null_ratio > 0.20
  medium   if null_ratio > 0.05
  low      if null_ratio > 0.00
```
**Dataset level:** columns with ANY nulls, total null cells, overall null ratio.

---

### Check 2 — Duplicate Rows

**Type:** Deterministic (pandas)
```
dup_count = df.duplicated().sum()
dup_ratio = dup_count / len(df)

severity:
  critical if dup_ratio > 0.20
  high     if dup_ratio > 0.05
  medium   if dup_ratio > 0.01
  low      if dup_ratio > 0.00
```
Duplicate detection uses all columns (full-row hash). Sample cap: first 10,000 rows.

---

### Check 3 — Invalid Formats

**Type:** Deterministic (regex, pandas)
Applied to object/string columns only. Checks for common structural patterns.

```
Pattern library (applied in sequence; first match wins):
  email    → r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
  phone    → r"^\+?[\d\s\-()/]{7,20}$"
  date_iso → r"^\d{4}-\d{2}-\d{2}$"
  url      → r"^https?://"
  postal   → r"^\d{5}(-\d{4})?$"

For each matched column:
  valid_ratio = (values matching pattern).mean()
  
  issue if valid_ratio < 1.0 AND valid_ratio > 0.0:
    (mixed: some values violate the inferred format)
    severity:
      high   if valid_ratio < 0.70
      medium if valid_ratio < 0.90
      low    if valid_ratio < 1.00
```

No regex is applied to columns with no recognisable pattern — only columns
where ≥70% of non-null values match a pattern are treated as having an inferred type.

---

### Check 4 — Schema Consistency

**Type:** Deterministic (pandas dtype inference)
Detects columns where the declared dtype does not match the stored values.

```
For each object-typed column:
  numeric_ratio = pd.to_numeric(df[col], errors="coerce").notna().mean()
  date_ratio    = pd.to_datetime(df[col], errors="coerce").notna().mean()

  if numeric_ratio > 0.90:
    issue("stored_as_string_should_be_numeric", severity="medium")
  elif 0.10 < numeric_ratio < 0.90:
    issue("mixed_types_numeric_and_string", severity="high")

  elif date_ratio > 0.80 (and not already numeric):
    issue("stored_as_string_should_be_datetime", severity="low")

For numeric columns:
  if column name contains ID/KEY/CODE keywords AND unique_ratio > 0.95:
    issue("id_stored_as_numeric", severity="low")
    (numeric ID cols lose leading zeros, sorting semantics)
```

---

### Check 5 — Outliers

**Type:** Deterministic (IQR, applied to all numeric columns)

Two tiers of outlier detection — IQR is chosen because it is the same method
used in the existing `AnomalyDetectionEngine` and is free of distribution
assumptions.

```
For each numeric column:
  Q1, Q3 = df[col].quantile([0.25, 0.75])
  IQR     = Q3 - Q1

  if IQR == 0: skip (constant column — flagged by CardinalityChecker)

  mild_fence_low    = Q1 - 1.5 * IQR
  mild_fence_high   = Q3 + 1.5 * IQR
  extreme_fence_low = Q1 - 3.0 * IQR
  extreme_fence_high= Q3 + 3.0 * IQR

  mild_count    = outside mild fences
  extreme_count = outside extreme fences
  mild_ratio    = mild_count / non_null_count

  severity:
    critical if mild_ratio > 0.15
    high     if mild_ratio > 0.05  OR extreme_count > 0
    medium   if mild_ratio > 0.01
    low      if mild_count > 0
```

**Note:** This check surfaces different information than `AnomalyDetectionService`.
The anomaly service identifies *which rows* are anomalous and their scores.
The data quality outlier check produces a *quality dimension score* per column and is
used only for computing `column_score.outlier_health`. They do not conflict.

---

### Check 6 — Cardinality Issues

**Type:** Deterministic (pandas nunique)

Two sub-patterns detected:

**6a. Constant columns** (zero or one unique value — useless for analysis):
```
if n_unique <= 1:
  issue("constant_column", severity="high")
```

**6b. Near-unique string columns** (likely IDs misclassified as categories):
```
For object/string columns:
  unique_ratio = n_unique / len(df)
  if unique_ratio > 0.95 AND n_unique > 10:
    issue("high_cardinality", severity="low")
    (note: this may be intentional — severity is low)
```

**6c. Binary-encoded categoricals** (numeric column with only 0/1 or 0/1/NaN):
```
For numeric columns:
  if set(df[col].dropna().unique()).issubset({0, 1, 0.0, 1.0}):
    issue("binary_encoded_as_numeric", severity="info")
    (probable boolean — not an error, but worth noting)
```

---

### Check 7 — Data Drift Indicators

**Type:** Deterministic (pandas, split-half comparison)

Detects whether the statistical properties of numeric columns shift significantly
between the first and second halves of the dataset rows. This is a lightweight
proxy for distribution drift — without requiring an external baseline.

```
mid = len(df) // 2

For each numeric column (min 20 rows required):
  first_half_mean  = df.iloc[:mid][col].mean()
  second_half_mean = df.iloc[mid:][col].mean()

  if abs(first_half_mean) < 1e-9: skip (near-zero baseline)

  pct_shift = abs(second_half_mean - first_half_mean) / abs(first_half_mean)

  Also compute variance shift:
    first_std  = df.iloc[:mid][col].std()
    second_std = df.iloc[mid:][col].std()
    std_ratio  = second_std / max(first_std, 1e-9)

  severity:
    high   if pct_shift > 0.50 (mean shifted >50%)
    medium if pct_shift > 0.20 (mean shifted >20%)
    low    if pct_shift > 0.10 (mean shifted >10%)

    also flag:
    high   if std_ratio > 3.0 or std_ratio < 0.33 (variance tripled/thirded)
```

---

### Check 8 — Null Distribution

**Type:** Deterministic (pandas, dataset-level summary)

Provides the aggregate view that complements per-column null detection (Check 1).

```
total_cells       = len(df) * len(df.columns)
total_null_cells  = df.isnull().sum().sum()
overall_null_ratio= total_null_cells / total_cells

null_by_column    = sorted list of (col, null_count, null_ratio)
completely_null   = columns where null_ratio == 1.0
highly_null       = columns where null_ratio > 0.50
partially_null    = columns where 0 < null_ratio <= 0.50

# Issue: any fully-null column is always critical
if completely_null:
  issue("fully_null_columns", severity="critical",
        columns=completely_null)

# Issue: overall dataset null ratio
if overall_null_ratio > 0.20:
  issue("high_overall_null_rate", severity="high")
elif overall_null_ratio > 0.05:
  issue("elevated_null_rate", severity="medium")
```

This check does NOT duplicate Check 1 — it adds dataset-aggregate context that
is useful for the quality score and executive summary section.

---

### Check 9 — Column Completeness

**Type:** Deterministic (pandas)

Extends null detection to include **effective completeness**: counting empty
strings, whitespace-only strings, and placeholder values as "not complete".

```
For each column:
  null_count = df[col].isnull().sum()

  For object columns only — additional effective incompleteness:
    empty_str_count    = (df[col].str.strip() == "").sum()
    placeholder_count  = df[col].isin(["N/A","NA","n/a","na","null","NULL",
                                        "None","none","-","?"]).sum()

    effective_null_count = null_count + empty_str_count + placeholder_count
    completeness = 1.0 - (effective_null_count / len(df))

  For non-object columns:
    completeness = 1.0 - (null_count / len(df))

  Column completeness score:
    completeness_pts = int(completeness * 40)  (0–40 pts within column_score)
```

---

### Check 10 — Type Validation

**Type:** Deterministic (pandas dtype inspection + coercion probing)

Validates that the stored dtype is the most appropriate type for each column's
actual values. Does NOT modify the dataset.

```
For each column:
  actual_dtype = str(df[col].dtype)

  # Numeric type checks
  if pd.api.types.is_numeric_dtype(df[col]):
    if df[col].isnull().any() and df[col].dtype in (int64, int32):
      issue("int_with_nulls", severity="low")
      (pandas int with NaN → should be float or nullable Int64)

    if col.lower().endswith(("_id","_key","_code","id","key")):
      if df[col].nunique() > 0.95 * len(df):
        issue("id_column_as_numeric", severity="info")

  # Object type checks
  if df[col].dtype == object:
    numeric_ratio = pd.to_numeric(df[col], errors="coerce").notna().mean()
    sample = df[col].dropna().head(200)

    # Should be datetime?
    try:
      date_ratio = pd.to_datetime(sample, errors="coerce").notna().mean()
    except:
      date_ratio = 0.0

    if numeric_ratio > 0.90:
      issue("should_be_numeric", severity="medium", col=col)
    elif date_ratio > 0.80:
      issue("should_be_datetime", severity="low", col=col)
    elif 0.10 < numeric_ratio < 0.90:
      issue("mixed_numeric_string", severity="high", col=col)

  # Boolean check
  if df[col].dtype == bool:
    pass  # valid type, no issue
```

---

## 3. Quality Score Computation (0-100, fully deterministic)

```
5 dimensions, each 0–20 pts:

completeness_pts  = int((1.0 - overall_null_ratio) * 20)
uniqueness_pts    = int((1.0 - dup_ratio) * 20)
validity_pts      = int(format_pass_rate * 20)        # % of format checks passing
consistency_pts   = int(consistency_pass_rate * 20)   # % of columns with valid types
outlier_health_pts= int((1.0 - worst_outlier_ratio) * 20)

quality_score = min(100, sum of all 5 components)

# Deduction modifiers (applied after base score):
  -10 if any completely-null column exists
  -5  if drift detected in >50% of numeric columns
  -5  if duplicate ratio > 0.10
```

---

## 4. Per-Column Score (0-100, deterministic)

```
For each column:
  completeness_pts  = int((1 - effective_null_ratio) * 40)
  
  uniqueness_pts:
    20 if unique_ratio between 0.01 and 0.90  (healthy cardinality)
    10 if unique_ratio < 0.01                 (near-constant)
    10 if unique_ratio > 0.90 and dtype==object (near-unique strings)
    20 if dtype!=object                        (numerics don't suffer high-card penalty)

  type_pts:
    20 if no type issues
    10 if low-severity issue (info/low)
    5  if medium/high type issue
    0  if critical type issue

  outlier_pts = int((1 - outlier_ratio) * 20)
    where outlier_ratio = mild_outlier_count / non_null_count (0 for non-numeric)

  column_score = min(100, completeness_pts + uniqueness_pts + type_pts + outlier_pts)

column_health: "good" if ≥80, "fair" if ≥60, "poor" if ≥40, "critical" if <40
```

---

## 5. Response Schema (`backend/app/schemas/data_quality.py`)

```python
class IssueCategory(str, Enum):
    MISSING_VALUES      = "missing_values"
    DUPLICATE_ROWS      = "duplicate_rows"
    INVALID_FORMAT      = "invalid_format"
    SCHEMA_CONSISTENCY  = "schema_consistency"
    OUTLIERS            = "outliers"
    CARDINALITY         = "cardinality"
    DATA_DRIFT          = "data_drift"
    NULL_DISTRIBUTION   = "null_distribution"
    COLUMN_COMPLETENESS = "column_completeness"
    TYPE_VALIDATION     = "type_validation"

class IssueSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH     = "high"
    MEDIUM   = "medium"
    LOW      = "low"
    INFO     = "info"

class QualityIssue(BaseModel):
    issue_id: str          # e.g. "missing_values_revenue" (stable, dedupe-safe)
    category: IssueCategory
    severity: IssueSeverity
    column: Optional[str]  # None for dataset-level issues
    title: str             # "High null rate in 'revenue' (42.3%)"
    description: str       # Detailed explanation with specific numbers
    affected_rows: Optional[int]
    affected_ratio: Optional[float]  # 0.0–1.0

class ColumnQualityScore(BaseModel):
    column: str
    dtype: str
    score: int             # 0–100
    health: str            # "good" | "fair" | "poor" | "critical"
    completeness: float    # 0.0–1.0 (effective completeness)
    null_count: int
    null_ratio: float
    unique_count: int
    unique_ratio: float
    outlier_count: int     # 0 for non-numeric
    outlier_ratio: float
    issues: list[str]      # list of issue_ids that reference this column
    has_type_mismatch: bool

class QualityDimension(BaseModel):
    name: str              # "Completeness", "Uniqueness", etc.
    score: int             # 0–20 pts
    max_score: int = 20
    description: str       # brief findings text

class DataQualityRequest(BaseModel):
    dataset_id: str
    columns: Optional[list[str]] = None  # None = all columns
    include_samples: bool = Field(
        default=False,
        description="Include up to 5 example values per column in the response.",
    )

class DataQualityReport(BaseModel):
    dataset_id: str
    dataset_name: str
    row_count: int
    column_count: int
    analysed_at: datetime
    analysis_time_ms: float
    cache_hit: bool

    # Top-level score
    quality_score: int            # 0–100
    quality_grade: str            # "A" (≥90) | "B" (≥75) | "C" (≥60) | "D" (≥40) | "F" (<40)

    # Score breakdown by dimension
    dimensions: list[QualityDimension]

    # Issues ranked by severity
    issues: list[QualityIssue]    # ordered: critical first

    # Per-column health
    column_scores: list[ColumnQualityScore]   # ordered: worst first

    # Rule-based recommendations
    recommendations: list[str]

    # Dataset-level statistics
    total_null_cells: int
    overall_null_ratio: float
    duplicate_row_count: int
    duplicate_ratio: float
    columns_with_issues: int
    critical_issue_count: int
    high_issue_count: int
    medium_issue_count: int
    low_issue_count: int
```

---

## 6. Service Architecture (`backend/app/services/data_quality_service.py`)

### Engine class (`DataQualityEngine`)

```python
class DataQualityEngine:
    """10-check deterministic quality engine. Zero LLM. Zero eval."""

    _SAMPLE_ROWS = 50_000          # cap for large datasets
    _FORMAT_SAMPLE = 500           # rows sampled for format checks
    _DATE_PROBE_SAMPLE = 200       # rows sampled for date type detection

    def analyse(
        self,
        df: pd.DataFrame,
        meta: DatasetMetadata,
        columns: Optional[list[str]] = None,
    ) -> DataQualityReport:
        start = time.perf_counter()
        df = df.head(self._SAMPLE_ROWS)
        if columns:
            df = df[[c for c in columns if c in df.columns]]

        issues: list[QualityIssue] = []
        col_scores: list[ColumnQualityScore] = []

        # Run all 10 checks
        issues += self._check_missing_values(df)
        issues += self._check_duplicate_rows(df)
        issues += self._check_invalid_formats(df)
        issues += self._check_schema_consistency(df)
        issues += self._check_outliers(df)
        issues += self._check_cardinality(df)
        issues += self._check_data_drift(df)
        issues += self._check_null_distribution(df)
        col_scores = self._check_column_completeness(df, issues)  # populates col_scores
        issues += self._check_type_validation(df)

        # Dedup + sort issues
        issues = _dedup_issues(issues)
        issues.sort(key=lambda i: _SEVERITY_RANK[i.severity], reverse=True)

        # Update col_scores with type issues
        col_scores = self._enrich_column_scores(df, issues, col_scores)

        # Compute quality score
        quality_score, dimensions = self._compute_quality_score(df, issues, col_scores)

        # Generate rule-based recommendations
        recommendations = _generate_recommendations(issues, col_scores, quality_score)

        elapsed_ms = round((time.perf_counter() - start) * 1000, 3)

        return DataQualityReport(
            quality_score=quality_score,
            quality_grade=_grade(quality_score),
            dimensions=dimensions,
            issues=issues,
            column_scores=sorted(col_scores, key=lambda c: c.score),  # worst first
            recommendations=recommendations,
            ...
        )
```

### Service class (`DataQualityService`)

```python
class DataQualityService:
    """Process-wide singleton that coordinates the engine and cache."""

    def __init__(
        self,
        dataset_service: DatasetService,
        cache_ttl: float = 300.0,
        cache_max_entries: int = 30,
    ) -> None:
        self._datasets = dataset_service
        self._engine = DataQualityEngine()
        self._cache: TTLCache[str, DataQualityReport] = TTLCache(
            ttl_seconds=cache_ttl,
            max_entries=cache_max_entries,
        )

    async def analyse(
        self,
        request: DataQualityRequest,
        owner_sub: str,
    ) -> DataQualityReport:
        cache_key = _cache_key(request, owner_sub)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached.model_copy(update={"cache_hit": True})

        df, meta = await run_in_threadpool(
            self._datasets.load_dataframe, request.dataset_id
        )
        report = await run_in_threadpool(
            self._engine.analyse, df, meta, request.columns
        )
        self._cache.put(cache_key, report)
        return report
```

No `set_client()` — the engine is fully deterministic (no LLM). The service
does not need an HTTP client.

---

## 7. Rule-Based Recommendations (`_generate_recommendations`)

Recommendations are generated deterministically from the issue list.
No LLM is called. The function maps each issue category and severity to
a template string with injected column names and specific numbers.

```python
_REC_TEMPLATES = {
    (IssueCategory.MISSING_VALUES, IssueSeverity.CRITICAL):
        "Drop or impute column '{col}' — {pct:.0%} of values are missing, "
        "making it unreliable for analysis.",
    (IssueCategory.MISSING_VALUES, IssueSeverity.HIGH):
        "Investigate missing data in '{col}' ({pct:.0%} null). "
        "Consider median/mode imputation or a separate 'missing' category.",
    (IssueCategory.DUPLICATE_ROWS, IssueSeverity.HIGH):
        "Remove {count:,} duplicate rows ({pct:.1%} of dataset) before analysis "
        "to prevent double-counting in aggregations.",
    (IssueCategory.SCHEMA_CONSISTENCY, ...):
        "Cast column '{col}' from object to numeric — {pct:.0%} of values are "
        "valid numbers stored as strings, causing incorrect aggregations.",
    (IssueCategory.TYPE_VALIDATION, ...):
        "Convert column '{col}' to datetime type — {pct:.0%} of values match "
        "ISO date format, enabling time-series analysis.",
    (IssueCategory.OUTLIERS, IssueSeverity.HIGH):
        "Investigate {count:,} outliers in '{col}' ({pct:.1%} of non-null values). "
        "Consider capping at the IQR fences or investigating data collection errors.",
    (IssueCategory.DATA_DRIFT, ...):
        "'{col}' shows a {pct:.0%} mean shift between dataset halves — "
        "verify this reflects genuine business change, not a pipeline error.",
    (IssueCategory.CARDINALITY, ...):
        "Column '{col}' is {state}. {action}",
    ...
}

def _generate_recommendations(issues, col_scores, quality_score) -> list[str]:
    recs = []
    for issue in issues[:20]:  # cap at top 20 issues
        template_key = (issue.category, issue.severity)
        if template_key in _REC_TEMPLATES:
            recs.append(_REC_TEMPLATES[template_key].format(**_issue_context(issue)))
    # Always include a general rec if score < 60
    if quality_score < 60:
        recs.append("Overall data quality is below threshold — "
                    "address critical and high-severity issues before using "
                    "this dataset for downstream reporting or ML.")
    return _deduplicate_recs(recs)[:15]  # max 15 recommendations
```

---

## 8. API Specification

### `POST /api/v1/data-quality/analyze`

Run all 10 quality checks on a stored dataset.

**Request:**
```json
{
  "dataset_id": "abc123...",
  "columns": null,           // null = all columns
  "include_samples": false
}
```

**Response:** `DataQualityReport`
```json
{
  "dataset_id": "abc123...",
  "dataset_name": "sales_q4.csv",
  "row_count": 5203,
  "column_count": 12,
  "analysed_at": "2026-06-14T10:23:45Z",
  "analysis_time_ms": 142.3,
  "cache_hit": false,
  "quality_score": 71,
  "quality_grade": "C",
  "dimensions": [
    { "name": "Completeness",    "score": 17, "max_score": 20, "description": "..." },
    { "name": "Uniqueness",      "score": 19, "max_score": 20, "description": "..." },
    { "name": "Validity",        "score": 14, "max_score": 20, "description": "..." },
    { "name": "Consistency",     "score": 11, "max_score": 20, "description": "..." },
    { "name": "Outlier Health",  "score": 10, "max_score": 20, "description": "..." }
  ],
  "issues": [
    {
      "issue_id": "null_dist_high_overall",
      "category": "null_distribution",
      "severity": "high",
      "column": null,
      "title": "Elevated dataset null rate (23.4%)",
      "description": "3 of 12 columns have >20% nulls. ...",
      "affected_rows": 1218,
      "affected_ratio": 0.234
    }
  ],
  "column_scores": [
    {
      "column": "customer_id",
      "dtype": "object",
      "score": 42,
      "health": "poor",
      "completeness": 0.88,
      "null_count": 624,
      "null_ratio": 0.12,
      "unique_count": 5199,
      "unique_ratio": 0.999,
      "outlier_count": 0,
      "outlier_ratio": 0.0,
      "issues": ["high_cardinality_customer_id", "type_val_customer_id"],
      "has_type_mismatch": false
    }
  ],
  "recommendations": [
    "Drop or impute column 'email' — 51.2% of values are missing, ...",
    "Cast column 'revenue' from object to numeric — 97.3% of values ...",
    "Remove 47 duplicate rows (0.9% of dataset) before analysis ..."
  ],
  "total_null_cells": 1218,
  "overall_null_ratio": 0.234,
  "duplicate_row_count": 47,
  "duplicate_ratio": 0.009,
  "columns_with_issues": 5,
  "critical_issue_count": 0,
  "high_issue_count": 3,
  "medium_issue_count": 5,
  "low_issue_count": 4
}
```

**Auth:** Bearer JWT required. Ownership check on dataset.
**Cache:** In-memory TTL 300s, key = `sha256(dataset_id|columns_sorted|owner_sub)`
**Timeout:** 60s (worst-case 50K rows × 12 cols is ~180ms)

---

## 9. Configuration Changes

### `backend/app/core/config.py`

```python
# ── Data Quality Service ──────────────────────────────────────────────────────
data_quality_cache_ttl_seconds: float = 300.0
data_quality_cache_max_entries: int = 30
data_quality_sample_rows: int = 50_000
```

No new storage field, no `_STORAGE_FIELDS` change, no new storage volume.

### `backend/app/core/exceptions.py`

```python
class DataQualityError(DataAssistantError):
    """Raised when the data quality engine encounters an unrecoverable error."""
```

---

## 10. Dependency Injection (`backend/app/api/dependencies.py`)

```python
@lru_cache(maxsize=1)
def get_data_quality_service() -> DataQualityService:
    from app.services.data_quality_service import DataQualityService  # noqa

    settings = get_settings()
    return DataQualityService(
        dataset_service=get_dataset_service(),
        cache_ttl=settings.data_quality_cache_ttl_seconds,
        cache_max_entries=settings.data_quality_cache_max_entries,
    )
```

No lifespan changes — no LLM client needed.

---

## 11. Router Registration (`backend/app/main.py`)

```python
# Add to route imports:
from app.api.routes import data_quality

# Add to create_app():
app.include_router(data_quality.router, prefix=API_PREFIX)
```

No lifespan changes (no `set_client()` needed).

---

## 12. Frontend Architecture

### 12.1 TypeScript types (appended to `frontend-next/src/lib/api/types.ts`)

```typescript
export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";
export type IssueCategory =
  | "missing_values" | "duplicate_rows" | "invalid_format"
  | "schema_consistency" | "outliers" | "cardinality"
  | "data_drift" | "null_distribution" | "column_completeness"
  | "type_validation";

export interface QualityIssue {
  issue_id: string; category: IssueCategory; severity: IssueSeverity;
  column: string | null; title: string; description: string;
  affected_rows: number | null; affected_ratio: number | null;
}

export interface ColumnQualityScore {
  column: string; dtype: string; score: number; health: string;
  completeness: number; null_count: number; null_ratio: number;
  unique_count: number; unique_ratio: number;
  outlier_count: number; outlier_ratio: number;
  issues: string[]; has_type_mismatch: boolean;
}

export interface QualityDimension {
  name: string; score: number; max_score: number; description: string;
}

export interface DataQualityReport {
  dataset_id: string; dataset_name: string;
  row_count: number; column_count: number;
  analysed_at: string; analysis_time_ms: number; cache_hit: boolean;
  quality_score: number; quality_grade: string;
  dimensions: QualityDimension[];
  issues: QualityIssue[];
  column_scores: ColumnQualityScore[];
  recommendations: string[];
  total_null_cells: number; overall_null_ratio: number;
  duplicate_row_count: number; duplicate_ratio: number;
  columns_with_issues: number;
  critical_issue_count: number; high_issue_count: number;
  medium_issue_count: number; low_issue_count: number;
}

export interface DataQualityRequest {
  dataset_id: string;
  columns?: string[] | null;
  include_samples?: boolean;
}
```

### 12.2 API client (`frontend-next/src/lib/api/data-quality.ts`)

```typescript
export async function analyzeDataQuality(
  request: DataQualityRequest
): Promise<DataQualityReport>
```

### 12.3 `DataQualityWorkspace.tsx` — Component Layout

```
<AppShell mainClassName="overflow-hidden p-0">
  ─── Header ─────────────────────────────────────────────────────────
  ArrowLeft (→ dataset)  |  ShieldCheck icon  |  "Data Quality"
  Grade badge (A/B/C/D/F with color)  |  Score chip  |  [Re-run] button

  ─── Loading state ──────────────────────────────────────────────────
  Spinner + "Analysing {n} columns across 10 quality dimensions…"

  ─── Quality Score Card ─────────────────────────────────────────────
  Animated circular score gauge (0–100)
  Grade pill: A (green) / B (teal) / C (amber) / D (orange) / F (red)
  5 dimension bars:
    ████████████████░░░░  Completeness    17/20
    ████████████████████  Uniqueness      20/20
    ██████████████░░░░░░  Validity        14/20
    ██████████░░░░░░░░░░  Consistency     11/20
    ██████████░░░░░░░░░░  Outlier Health  10/20
  Dataset stats: {rows} rows · {cols} cols · {nulls} null cells ·
                 {dups} duplicates

  ─── Issue Severity Badges (summary row) ────────────────────────────
  ● 0 Critical   ● 3 High   ● 5 Medium   ● 4 Low
  (clicking filters the issues list below)

  ─── Issues Panel ───────────────────────────────────────────────────
  Severity filter tabs: All | Critical | High | Medium | Low
  Per issue card:
    [SEVERITY BADGE]  Title                        [CATEGORY TAG]
    Description with specific numbers
    Affected: {n} rows ({pct}%)   Column: {col}

  ─── Column Health Table ────────────────────────────────────────────
  Sortable columns: Column | Type | Score | Health | Completeness |
                    Nulls | Unique | Outliers | Issues
  Score bar in cell (0–100, color-coded green/amber/red)
  Health badge: ● Good / ● Fair / ● Poor / ● Critical
  Issue count chip per row

  ─── Recommendations Panel ──────────────────────────────────────────
  Section header: "Recommendations ({count})"
  Numbered list; each item:
    Priority icon (from first issue category)  Action text
```

**State machine:**
```
idle
  ↓ mount → POST /api/v1/data-quality/analyze (auto-trigger, no user input)
"analysing" (spinner, ~200ms)
  ↓ response
"ready" (full results rendered)
  ↓ user clicks [Re-run] (clears cache, re-sends POST)
"analysing" again
```

### 12.4 Page (`frontend-next/src/app/datasets/[id]/data-quality/page.tsx`)

```tsx
// Identical pattern to insights/page.tsx
export default async function DataQualityPage({ params }) {
  const { id } = await params;
  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <DataQualityWorkspace datasetId={id} />
    </AppShell>
  );
}
```

### 12.5 MetaPanel

Add "Data Quality" quick action with `ShieldCheck` icon:
```tsx
{
  href: `/datasets/${dataset.id}/data-quality`,
  icon: ShieldCheck,
  label: "Data Quality",
}
```

### 12.6 Topbar

```typescript
if (pathname.includes("/data-quality")) return "Data Quality";
```

---

## 13. Complete File List

### Backend — new files (4)

| File | Description |
|---|---|
| `backend/app/schemas/data_quality.py` | All Pydantic models |
| `backend/app/services/data_quality_service.py` | `DataQualityEngine` (10 checkers) + `DataQualityService` (TTL cache) |
| `backend/app/api/routes/data_quality.py` | Single endpoint: POST /analyze |
| `backend/tests/test_data_quality.py` | 25-test suite |

### Backend — modified files (4)

| File | Change |
|---|---|
| `backend/app/core/config.py` | 3 new settings fields |
| `backend/app/core/exceptions.py` | `DataQualityError` |
| `backend/app/api/dependencies.py` | `get_data_quality_service()` factory |
| `backend/app/main.py` | Router registration |

### Frontend — new files (3)

| File | Description |
|---|---|
| `frontend-next/src/lib/api/data-quality.ts` | `analyzeDataQuality()` client |
| `frontend-next/src/components/data-quality/DataQualityWorkspace.tsx` | Full UI |
| `frontend-next/src/app/datasets/[id]/data-quality/page.tsx` | Route page |

### Frontend — modified files (3)

| File | Change |
|---|---|
| `frontend-next/src/lib/api/types.ts` | Append TypeScript types |
| `frontend-next/src/components/datasets/MetaPanel.tsx` | Add quick action |
| `frontend-next/src/components/layout/Topbar.tsx` | Add page title |

**Total: 7 new files, 7 modified files. Zero new agents. Zero new storage volumes.**

---

## 14. Test Plan (`backend/tests/test_data_quality.py`)

| Class | Tests | Coverage |
|---|---|---|
| `TestMissingValueChecker` | 3 | zero nulls → no issue, >50% null → critical, mixed columns |
| `TestDuplicateRowChecker` | 2 | no dups → score 20, >5% dups → high severity |
| `TestFormatValidationChecker` | 3 | clean email col, mixed email col, no recognised format |
| `TestSchemaConsistencyChecker` | 2 | pure-numeric object col, mixed-type col |
| `TestOutlierChecker` | 2 | no outliers, extreme outliers → high severity |
| `TestCardinalityChecker` | 2 | constant col → high, near-unique strings → low |
| `TestDataDriftChecker` | 2 | stable data → no drift, 60% mean shift → high |
| `TestTypeValidationChecker` | 2 | date strings → should_be_datetime, numeric strings |
| `TestQualityScore` | 3 | perfect data → ≥95, all-null df → <20, typical → 60–80 |
| `TestHTTPEndpoint` | 4 | 200 with valid dataset, 404 wrong owner, 404 missing, cache hit returns faster |

---

## 15. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `pd.to_datetime` on 500-row sample too slow | Low | Already capped at `_DATE_PROBE_SAMPLE=200` rows |
| Format checker false-positives | Low | Only flags columns where ≥70% of values match a pattern AND some don't |
| Drift check misleading for time-ordered data | Low | Document that drift = statistical shift; does not imply causality |
| IQR outlier check conflicts with AnomalyService | None | Different purpose (column score vs anomaly row list) — no API overlap |
| Large schema (12 cols × 10 checks) produces oversized JSON | Low | Column scores capped at 500 columns; issues capped at 100 |
| Format regex `re.compile` per request | Low | Patterns compiled at module level (module-scope constants) |
| `df.duplicated()` on 50K × 50-col df is slow | Low | Sample cap at 50K rows; duplicated() runs on column hash |

---

## 16. What Is NOT in Scope

- Rule-based vs reference-schema validation (comparing against a provided schema JSON)
- Cross-dataset consistency checks (comparing two datasets)
- Automated data repair / imputation
- Custom format patterns (user-supplied regex)
- Streaming / row-level feedback during analysis
- Integration with dbt / Great Expectations / Pandera
- Profiling report export (PDF)

---

## 17. Execution Order (if approved)

```
1.  backend/app/schemas/data_quality.py         (no deps)
2.  backend/app/core/config.py                  (add 3 cache fields)
3.  backend/app/core/exceptions.py              (add DataQualityError)
4.  backend/app/services/data_quality_service.py  (engine + service)
5.  backend/app/api/routes/data_quality.py      (single endpoint)
6.  backend/app/api/dependencies.py             (factory)
7.  backend/app/main.py                         (router registration)
8.  backend/tests/test_data_quality.py          (25 tests)
9.  frontend-next/src/lib/api/types.ts          (append types)
10. frontend-next/src/lib/api/data-quality.ts   (API client)
11. frontend-next/src/components/data-quality/
    DataQualityWorkspace.tsx                    (full workspace)
12. frontend-next/src/app/datasets/[id]/
    data-quality/page.tsx                       (route page)
13. frontend-next/src/components/datasets/
    MetaPanel.tsx                               (add quick action)
14. frontend-next/src/components/layout/
    Topbar.tsx                                  (add page title)
```

---

## 18. Open Questions

1. **Separate vs unified cache key:** Should re-running with `columns=["revenue","orders"]`
   be cached separately from a full-dataset run? Recommended: **yes** — the cache key
   includes the sorted column list, so partial runs are cached independently.

2. **`include_samples` scope:** Should sample values (up to 5 per column) be included
   in the response by default? Recommended: **no** — opt-in via `include_samples=true`
   to keep the default payload compact.

3. **Drift check minimum rows:** The data drift check skips columns with fewer than
   20 rows. Is this threshold acceptable? Recommended: **yes** — split-half comparison
   is meaningless on fewer than 10 rows per half.

4. **Score deductions:** The architecture proposes optional deductions (-10 for
   fully-null columns, -5 for drift in >50% of columns, -5 for >10% duplicates)
   applied after the base 5-dimension score. Should these be applied, or should
   the score be strictly additive from the 5 dimensions?
   Recommended: **apply deductions** — a dataset with a fully-null column should
   never score above 90 regardless of other dimensions.

---

## Approval

To proceed with implementation, reply: **"Approved — begin implementation"**
or provide feedback on any of the open questions above.

**Do not start coding until this document is approved.**
