# Explainability Panel — Compatibility Report

## Feature scope
- `ExplainabilityDrawer.tsx` — slide-in panel displaying confidence, evidence,
  supporting data, and reasoning path for any analysis result
- Accepts existing `InsightResponse`, `RootCauseResponse`, `RecommendationResponse`,
  and `ForecastResponse` objects as props — zero new API calls
- Reuses existing types from `src/lib/api/types.ts` exactly as-is

---

## Reasoning: why no backend changes are needed

All four required display dimensions are already present in existing responses:

### Confidence
| Source | Field | Type |
|---|---|---|
| `Recommendation` | `confidence` | `number` (0–1, exact float from rule engine) |
| `RecommendationResponse` | `llm_enhanced` | `boolean` (LLM raised or didn't affect score) |
| Aggregate | average of `recommendations[].confidence` | computed on frontend |

No backend field needs to be added. `Recommendation.confidence` was designed for exactly this.

### Evidence
| Source | Field | Description |
|---|---|---|
| `Recommendation.data_points[]` | `string[]` | Specific quoted facts supporting the recommendation (e.g. "revenue dropped 12.4%") |
| `InsightResponse.key_insights[]` | `string[]` | Top findings with specific numbers from the stat engine |
| `RootCauseResponse.root_causes[]` | `RootCause[]` | Each causal factor with `dimension`, `value`, `contribution_pct`, `description` |
| `RootCauseResponse.problem` | `string` | One-sentence problem statement with exact numbers |

### Supporting data
| Source | Field | Description |
|---|---|---|
| `RootCauseResponse.contribution_analysis[]` | `ContributionFactor[]` | Full period-over-period decomposition table |
| `InsightResponse.top_performers / underperformers` | `dict[]` | Ranked performers with values |
| `InsightResponse.trends[]` | `string[]` | Directional trend descriptions |
| `ForecastResponse.table_data[]` | `dict[]` | Forecast values with periods |
| `ForecastResponse.method_used` | `string` | Statistical method (e.g. "Holt-Winters ETS") |
| `ForecastResponse.fallback_used` | `boolean` | Whether the primary model fell back |

### Reasoning path
The system's two-layer architecture is already fully documented in the response metadata:

```
Step 1 — Raw Data
  └─ known from: dataset context passed to the drawer (rows, columns)

Step 2 — Statistical Engine (deterministic, no LLM)
  └─ InsightStatEngine: produces StatisticalFindings from table_data
     RCAEngine: computes ContributionFactor[] from DataFrames
     ForecastService: Holt-Winters → OLS → Naïve chain (method_used)
     known from: InsightResponse.generation_time_ms, ForecastResponse.method_used

Step 3 — LLM Enhancement (optional)
  └─ known from: RecommendationResponse.llm_enhanced
                 InsightResponse.cache_hit
                 ForecastResponse.fallback_used (inverse proxy for LLM success)

Step 4 — Pydantic Validation + Output
  └─ always: every response went through typed Pydantic model
```

No backend changes required. All reasoning-path metadata is in-response.

---

## Backend changes

**None.** Zero new routes, schemas, services, or storage.

---

## Frontend changes

### New files (1)
| File | Purpose |
|---|---|
| `src/components/explainability/ExplainabilityDrawer.tsx` | Slide-in drawer accepting existing response objects as props |

### Modified files (0)
None. The drawer is a standalone, importable component. Callers wire it in.

### Existing types reused (no changes to `types.ts`)
- `InsightResponse` — summary, key_insights, trends, top_performers, underperformers, generation_time_ms, cache_hit
- `RootCauseResponse` — problem, root_causes, contribution_analysis, total_change_pct, current/previous totals, cache_hit
- `Recommendation` — confidence, data_points, source, priority, action, reason, expected_impact
- `RecommendationResponse` — recommendations, summary, llm_enhanced, generation_time_ms
- `ForecastResponse` — answer, method_used, fallback_used, horizon, frequency, data_points, table_data

### Props interface
```typescript
interface ExplainabilityDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  datasetFilename?: string;
  insights?: InsightResponse | null;
  rootCause?: RootCauseResponse | null;
  recommendations?: RecommendationResponse | null;
  forecast?: ForecastResponse | null;
}
```

The drawer is fully composable — callers pass only the responses they have.
Any subset of the four inputs renders gracefully (empty sections hide themselves).

---

## Data flow inside the drawer (frontend-only)

```
Props received
    │
    ├─ Confidence section
    │     avgConfidence = mean(recommendations[].confidence)
    │     per-rec bars: rec.confidence × 100%
    │     llm_enhanced badge: RecommendationResponse.llm_enhanced
    │
    ├─ Evidence section
    │     InsightResponse.key_insights[]          → Evidence bullets (stat engine output)
    │     Recommendation[].data_points[]          → Grounding facts per recommendation
    │     RootCauseResponse.root_causes[]         → Causal factors with contribution %
    │
    ├─ Supporting data section
    │     RootCauseResponse.contribution_analysis → Ranked decomposition table
    │     InsightResponse.top_performers/
    │                      underperformers        → Performance table
    │     ForecastResponse.table_data             → Forecast values
    │     ForecastResponse.method_used            → Model chain badge
    │
    └─ Reasoning path section
          4-step chain (always shown):
            [Raw Data] → [Statistical Engine] → [LLM Layer] → [Pydantic Output]
          Metadata overlaid:
            StatEngine: method_used, generation_time_ms - llm overhead
            LLM: llm_enhanced, cache_hit, fallback_used
            Output: cache_hit timestamps
```

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Caller passes no props at all | None | All props are optional; drawer shows "No data provided" gracefully |
| `top_performers`/`underperformers` are `dict[]` (untyped) | None | Rendered generically with Object.entries |
| Drawer overlays on mobile | Low | Drawer width capped at 480px with backdrop, scrollable body |
| `contribution_analysis` can be long | Low | Show top 8 contributors, rest hidden behind "Show all" toggle |
