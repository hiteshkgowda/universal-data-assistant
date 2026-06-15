# Executive Briefing Mode — Compatibility Report

## Feature scope
- `/briefing` page generating board-level summaries from existing analysis engines
- Four output sections: Executive Summary, Risks, Opportunities, Actions
- Optional deep-dive: Forecast Outlook, Root Cause Analysis (on-demand)
- No new backend endpoints, services, schemas, or storage

---

## Backend analysis

### No backend changes required

All data is sourced from existing, fully-functional endpoints:

| Section | Source endpoint | Response fields used |
|---|---|---|
| Executive Summary | `POST /api/v1/insights/generate` | `summary`, `key_insights[]`, `trends[]` |
| Risks | `GET /api/v1/datasets/{id}/monitor` | `alerts[]` (severity=critical/high), `overall_health`, `kpis[]` |
| Risks (deep) | `POST /api/v1/root-cause` | `root_causes[]`, `problem`, `total_change_pct` |
| Opportunities | `POST /api/v1/insights/generate` | `trends[]` |
| Opportunities (deep) | `POST /api/v1/recommendations` | `recommendations[]` where `source ∈ {insight, forecast, cross_signal}` |
| Actions | `POST /api/v1/recommendations` | `recommendations[]` sorted by priority |
| Forecast Outlook | `POST /api/v1/forecast` | `answer`, `method_used`, `horizon`, `chart_spec` |

No new schemas, routes, services, or storage volumes are added.

---

## Frontend analysis

### API reuse — no new API files

| Existing file | Function reused |
|---|---|
| `src/lib/api/kpi-monitor.ts` | `getKPIMonitor(datasetId)` |
| `src/lib/api/insights.ts` | `generateInsights({ dataset_id, question })` |
| `src/lib/api/recommendations.ts` | `generateRecommendations({ dataset_id, llm_enhance: true })` |
| `src/lib/api/forecast.ts` | `runForecast({ dataset_id, question })` |
| `src/lib/api/root-cause.ts` | `analyzeRootCause({ dataset_id, question })` |
| `src/hooks/use-datasets.ts` | `useDatasets()` |

No new API client files. No new types — all response shapes are already in `src/lib/api/types.ts`.

### New files (2)

| File | Purpose |
|---|---|
| `src/app/briefing/page.tsx` | Server component, wraps workspace in AppShell |
| `src/components/briefing/BriefingWorkspace.tsx` | Full workspace: dataset picker, briefing generation, 4-section layout |

### Modified files (1)

| File | Change |
|---|---|
| `src/components/layout/Sidebar.tsx` | Add `Presentation` icon + `/briefing` nav item under "Analysis" group |

---

## Data flow

```
User selects dataset + clicks "Generate Briefing"
        │
        ├─ getKPIMonitor(datasetId)         ← GET  (KPI monitor, cached 30s)
        │       └─ alerts[]                 → Risks section
        │       └─ kpis[]                   → KPI summary strip
        │       └─ overall_health           → Health badge in header
        │
        ├─ generateInsights(datasetId, q)   ← POST (with LLM timeout)
        │       └─ summary                  → Executive Summary
        │       └─ key_insights[]           → Executive Summary bullets
        │       └─ trends[]                 → Opportunities section
        │
        └─ generateRecommendations(id)      ← POST (with LLM timeout)
                └─ recommendations[]        → Actions section (all, by priority)
                                            → Opportunities (insight/forecast/cross_signal)

User clicks "Add Forecast Outlook"
        │
        └─ runForecast({ dataset_id, question: "Forecast trend" })
                └─ answer, chart_spec       → Forecast Outlook section

User clicks "Add Root Cause Analysis"
        │
        └─ analyzeRootCause({ dataset_id, question: "Why did key metric change?" })
                └─ root_causes[], problem   → Root Cause section under Risks
```

---

## Fixed prompts used for each auto-triggered LLM call

| Call | Fixed question string |
|---|---|
| Insights | `"Provide an executive summary covering key performance drivers, trends, and strategic opportunities."` |
| Forecast | `"What is the overall trend forecast for the next 3 periods?"` |
| RCA | `"What are the main drivers of change in the key metrics?"` |

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Insights + Recommendations run in parallel — both LLM calls | Low | Both use `LLM_TIMEOUT_MS`; failures are handled per-section with error states |
| KPI Monitor may return 0 alerts (healthy dataset) | None | Risks section shows "No active alerts" message gracefully |
| Forecast requires numeric time-series data | Low | On error, section shows "Forecast not available for this dataset" |
| RCA may not find a clear metric/period column | Low | On error, section shows "RCA not available" with the error message |
| No new route conflicts | None | `/briefing` is a new Next.js route, not registered in FastAPI |

---

## Implementation order

1. `src/components/briefing/BriefingWorkspace.tsx` — full workspace component
2. `src/app/briefing/page.tsx` — page wrapper
3. `src/components/layout/Sidebar.tsx` — add nav item
