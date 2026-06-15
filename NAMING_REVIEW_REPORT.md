# Naming Review Report

Scope: `backend/` (Python) — class names, function names, module docstrings.
Constraints: no API route changes, no database schema changes, no Pydantic schema field changes.

---

## Summary of issues

| Category | Count |
|---|---|
| "AI X" prefix in module docstrings | 7 files |
| "Generation/Detection/Analysis" suffix bloat on class names | 10 classes |
| Dashboard internal engine verbosity | 4 classes |
| `RecommendationRuleEngine` | 1 class |
| Minor docstring bugs | 2 |

---

## Category 1 — "AI X" in module docstrings

These files open with `"""AI Executive Dashboard Generator"""` or similar. "AI" adds no information — the LLM involvement is already described in the body text.

| File | Current first line | Proposed |
|---|---|---|
| `backend/app/services/dashboard_generator.py` | `"""AI Executive Dashboard Generator.` | `"""Dashboard generator — four deterministic engines + one optional LLM call.` |
| `backend/agents/insight_agent.py` | `"""AI Insight Generation Agent.` | `"""Insight agent — LLM reasoning layer over statistical findings.` |
| `backend/agents/recommendation_agent.py` | `"""LLM Enhancement Agent for the Recommendation Engine.` | `"""Recommendation agent — polishes rule-based recommendations with an LLM call.` |
| `backend/app/schemas/insight.py` | `"""Schemas for the AI Insight Generation Engine.` | `"""Schemas for insight generation.` |
| `backend/app/schemas/dashboard.py` | `"""Pydantic schemas for the AI Executive Dashboard Generator.` | `"""Pydantic schemas for dashboard generation.` |
| `backend/app/api/routes/dashboards.py` | `"""AI Executive Dashboard Generator routes.` | `"""Dashboard routes.` |
| `backend/app/api/routes/insights.py` | `"""AI Insight Generation Engine route.` | `"""Insights route.` |

**Config comments** (`backend/app/core/config.py` lines 107, 266, 272):
```python
# AI Executive Dashboard Generator — saved dashboard JSON files.  →  # Dashboard generator — saved dashboard JSON files.
# AI Executive Dashboard Generator                                →  # Dashboard generator
# AI Insight Generation Engine                                    →  # Insight service
```

**API route summary** (`backend/app/api/routes/insights.py`):
```python
summary="Generate AI insights from query result data"  →  summary="Generate insights from query result data"
```
(This is the OpenAPI `summary` string shown in docs, not a route path — not an API contract.)

---

## Category 2 — "Generation/Detection/Analysis" suffix bloat

These class names are longer than they need to be. The pattern in the rest of the codebase is `XxxService` (not `XxxGenerationService`), `XxxEngine` (not `XxxDetectionEngine`), and `XxxTool` (not `XxxGenerationTool`). The extra word in the middle doesn't help distinguish anything since each name is already unique.

### Services

| Old name | New name | Used in |
|---|---|---|
| `InsightGenerationService` | `InsightService` | `insight_service.py`, `dependencies.py`, `routes/query.py`, `routes/insights.py` |
| `AnomalyDetectionService` | `AnomalyService` | `anomaly_service.py`, `dependencies.py`, `routes/anomalies.py`, `tests/test_anomaly_detection.py` |
| `DashboardGeneratorService` | `DashboardService` | `dashboard_generator.py`, `dependencies.py`, `routes/dashboards.py`, `main.py` |

Before/after at a usage site (`dependencies.py`):
```python
# Before
from app.services.insight_service import InsightGenerationService
def get_insight_service() -> InsightGenerationService:

# After
from app.services.insight_service import InsightService
def get_insight_service() -> InsightService:
```

### Engines

| Old name | New name | Used in |
|---|---|---|
| `InsightStatEngine` | `InsightEngine` | `insight_service.py`, `schemas/insight.py` (docstring) |
| `AnomalyDetectionEngine` | `AnomalyEngine` | `analytics/anomaly_detector.py`, `anomaly_service.py`, `tests/test_anomaly_detection.py` |

Note: `RCAEngine` stays — it's already short and precise.

### Tools (in `agent_tools.py`)

| Old name | New name | Used in |
|---|---|---|
| `InsightGenerationTool` | `InsightTool` | `agent_tools.py`, `tests/test_agent_integration.py` |
| `AnomalyDetectionTool` | `AnomalyTool` | `agent_tools.py` |
| `RootCauseAnalysisTool` | `RootCauseTool` | `agent_tools.py` |

All other tools (`AnalyticsTool`, `ForecastTool`, `ReportTool`, `CrudPreviewTool`, `CrudExecuteTool`, `SqlQueryTool`, `DatasetPreviewTool`, `RecommendationTool`) already follow the short pattern — only these three diverge.

Before/after:
```python
# Before
class InsightGenerationTool:   class AnomalyDetectionTool:   class RootCauseAnalysisTool:

# After
class InsightTool:             class AnomalyTool:            class RootCauseTool:
```

### Exception classes (`core/exceptions.py`)

Both exceptions are **defined but never raised** in the codebase (no raise site found). They're listed for completeness.

| Old name | New name |
|---|---|
| `InsightGenerationError` | `InsightError` |
| `AnomalyDetectionError` | `AnomalyError` |

---

## Category 3 — Dashboard internal engine names

Four private engine classes in `dashboard_generator.py`, each suffixed with `Engine` or `RecommendationEngine`. They're only referenced inside `dashboard_generator.py` itself (as `self._kpi_engine`, `self._chart_engine`, etc.) and in `tests/test_dashboard_generator.py`. None are exported in any API response.

| Old name | New name | Rationale |
|---|---|---|
| `KPISelectionEngine` | `KPISelector` | `Selector` suffix is common for "picks from a set"; shorter |
| `ChartRecommendationEngine` | `ChartEngine` | "Recommendation" is already implied by what a chart engine does |
| `LayoutRecommendationEngine` | `LayoutEngine` | Same |
| `DashboardScoringEngine` | `DashboardScorer` | `Scorer` is standard; `-Engine` adds nothing when the class computes one value |

Before/after in `DashboardService.__init__()`:
```python
# Before
self._kpi_engine    = KPISelectionEngine()
self._chart_engine  = ChartRecommendationEngine()
self._layout_engine = LayoutRecommendationEngine()
self._score_engine  = DashboardScoringEngine()

# After
self._kpi_engine    = KPISelector()
self._chart_engine  = ChartEngine()
self._layout_engine = LayoutEngine()
self._score_engine  = DashboardScorer()
```

Test class names in `tests/test_dashboard_generator.py` update accordingly:
- `TestChartRecommendationEngine` → `TestChartEngine`
- `TestLayoutRecommendationEngine` → `TestLayoutEngine`
- `TestDashboardScoringEngine` → `TestDashboardScorer`
- `TestKPISelectionEngine` → `TestKPISelector`

---

## Category 4 — `RecommendationRuleEngine`

`RecommendationRuleEngine` is used in `recommendation_service.py` (class definition + `self._engine = RecommendationRuleEngine()`) and in `tests/test_recommendation_engine.py`. It's private to the service layer — not exported in any import chain outside these two files.

**Proposed**: `RuleEngine`

Within the context of `recommendation_service.py`, `RuleEngine` is unambiguous. The containing module is already named `recommendation_service`, so the class name doesn't need to repeat "Recommendation".

```python
# Before
class RecommendationRuleEngine:
    ...
class RecommendationService:
    def __init__(...):
        self._engine = RecommendationRuleEngine()

# After
class RuleEngine:
    ...
class RecommendationService:
    def __init__(...):
        self._engine = RuleEngine()
```

---

## Category 5 — Minor docstring bugs

### `backend/app/services/agent_orchestrator.py` — line 1

```python
"""Agent orchestrator — public entry point for Phase 9 (Phase 9).
```

"Phase 9 (Phase 9)" is a copy-paste duplication. Phase numbers are implementation history, not documentation. Proposed:

```python
"""Agent orchestrator — public entry point for the LangGraph agent.
```

### `backend/app/services/insight_service.py` — line 388

```python
"""Coordinate statistical analysis, LLM reasoning, and response caching.
```

This is accurate and short, but uses "Coordinate" (what-not-why). After renaming to `InsightService`, the docstring can be tightened:

```python
"""Run InsightEngine → InsightAgent pipeline with TTL caching."""
```

---

## What's kept unchanged

| Name | Reason |
|---|---|
| `RCAEngine` | Already short; "RCA" is the accepted acronym for root cause analysis |
| `InsightAgent`, `RecommendationAgent`, `RootCauseAgent` | Consistent pattern; all three are LLM reasoning wrappers |
| `AnalyticsService`, `ForecastService`, `ReportService`, etc. | Already follow the short `XxxService` pattern |
| `ConfirmationTokenService` | Descriptive; "Token" is load-bearing here |
| `RecommendationService` | Stays; owns `RuleEngine` |
| `JsonlAuditLogger`, `AuditLogger` | Appropriate; log format matters |
| All Pydantic schema classes | Names appear in OpenAPI docs and serialised responses |
| `DashboardGeneratorWorkspace` (frontend) | React component name; out of scope |
| `AnomalyDetection` (frontend component) | React component name; out of scope |

---

## File-level change summary

| File | Change type |
|---|---|
| `backend/app/services/dashboard_generator.py` | Class renames: `DashboardGeneratorService`, all 4 engine classes |
| `backend/app/services/insight_service.py` | Class renames: `InsightGenerationService`, `InsightStatEngine`; docstring fix |
| `backend/app/services/anomaly_service.py` | Class rename: `AnomalyDetectionService` |
| `backend/analytics/anomaly_detector.py` | Class rename: `AnomalyDetectionEngine` |
| `backend/app/services/recommendation_service.py` | Class rename: `RecommendationRuleEngine` |
| `backend/app/services/agent_tools.py` | Class renames: 3 tool classes |
| `backend/app/services/agent_orchestrator.py` | Docstring fix |
| `backend/app/core/exceptions.py` | Class renames: `InsightGenerationError`, `AnomalyDetectionError` |
| `backend/app/api/dependencies.py` | Import + type annotation updates |
| `backend/app/api/routes/dashboards.py` | Import + type annotation updates; docstring |
| `backend/app/api/routes/insights.py` | Import + type annotation updates; docstrings |
| `backend/app/api/routes/anomalies.py` | Import + type annotation updates |
| `backend/app/api/routes/query.py` | Import + type annotation update |
| `backend/app/schemas/insight.py` | Docstring only |
| `backend/app/schemas/dashboard.py` | Docstring only |
| `backend/app/schemas/recommendation.py` | Docstring only |
| `backend/app/core/config.py` | Comment updates only |
| `backend/agents/insight_agent.py` | Docstring only |
| `backend/agents/recommendation_agent.py` | Docstring only |
| `backend/tests/test_dashboard_generator.py` | Test class renames, import updates |
| `backend/tests/test_anomaly_detection.py` | Import + usage updates |
| `backend/tests/test_recommendation_engine.py` | Import + usage updates |
| `backend/tests/test_agent_integration.py` | Import + usage updates |

---

*Awaiting approval before modifying any code.*
