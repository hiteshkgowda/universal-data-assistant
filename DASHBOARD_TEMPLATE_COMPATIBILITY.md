# Dashboard Templates — Compatibility Report

## Feature scope
- 4 dashboard templates: Sales, Finance, Marketing, Operations
- Frontend template gallery embedded in the existing `/dashboards` hub
- Each template pre-configures a `prompt` string + `max_kpis` / `max_charts` that
  are passed to the **existing** `POST /api/v1/dashboards/generate` endpoint
- No new backend routes, schemas, services, or storage

---

## Why zero backend changes are needed

### Existing `GenerateDashboardRequest` already supports templates

```python
class GenerateDashboardRequest(BaseModel):
    dataset_id: str
    prompt: str = Field(default="Create an executive dashboard", max_length=500)
    max_kpis: int = Field(default=6, ge=1, le=10)
    max_charts: int = Field(default=6, ge=1, le=10)
```

A template is just a named set of `(prompt, max_kpis, max_charts)` values.
The backend already accepts and acts on these. No new fields, no new endpoint.

### The 4 deterministic engines are domain-agnostic

All four engines (KPI selection, chart recommendation, layout, scoring) operate on
column names and statistics — not on the template name. The `prompt` field is only
used by the LLM for naming the dashboard and generating recommendations.
The engines will automatically surface revenue/sales columns for a Sales template,
margin/cost columns for a Finance template, etc., based on keyword scoring in
`_score_column()` — which already includes domain-specific keywords for all 4 domains:

| Template | Keywords already in `_HIGH_KW` / `_MED_KW` |
|---|---|
| Sales | `revenue`, `sales`, `orders`, `customers`, `conversion`, `volume` |
| Finance | `profit`, `income`, `earnings`, `cost`, `spend`, `margin`, `gmv`, `arr`, `mrr` |
| Marketing | `clicks`, `impressions`, `sessions`, `cac`, `rate`, `conversion`, `churn`, `nps` |
| Operations | `volume`, `units`, `transactions`, `count`, `cost`, `score`, `value` |

No keyword additions needed in the backend — the existing scoring tables already
cover all 4 template domains.

---

## Backend changes

**None.** Zero new routes, schemas, services, or storage.

---

## Frontend changes

### New files (1)

| File | Purpose |
|---|---|
| `src/components/dashboard/DashboardTemplateGallery.tsx` | 4-card template gallery; calls `onSelect(template)` callback |

### Modified files (1)

| File | Change |
|---|---|
| `src/components/dashboard/DashboardHub.tsx` | Add "Start from a template" section above the dashboard list; when a template is selected, open the create modal with template prompt pre-filled |

### No changes to

- `src/lib/api/dashboards.ts` — `generateDashboard()` already accepts the prompt
- `src/lib/api/types.ts` — `GenerateDashboardRequest` already has all needed fields
- `src/components/dashboard/DashboardGeneratorWorkspace.tsx` — not touched
- Any backend file

---

## Template definitions (frontend-only)

```typescript
interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;         // sent as-is to POST /dashboards/generate
  max_kpis: number;
  max_charts: number;
  kpiHints: string[];     // display-only — shows user what KPIs to expect
}
```

| Template | Prompt sent to backend | KPI hints shown |
|---|---|---|
| Sales | `"Create a sales performance dashboard showing revenue trends, order volume by category, top customers, and customer acquisition metrics."` | Revenue, Orders, Customers, Conversion |
| Finance | `"Create a financial overview dashboard with profit margins, cost analysis, income, earnings, and budget tracking metrics."` | Profit, Revenue, Cost, Margin |
| Marketing | `"Create a marketing analytics dashboard featuring conversion rates, campaign spend, click-through rates, sessions, impressions, and CAC."` | Conversions, Sessions, CTR, CAC |
| Operations | `"Create an operations efficiency dashboard with transaction volume, processing costs, quality scores, unit counts, and operational spend."` | Volume, Cost, Units, Score |

---

## Data flow

```
User → DashboardHub (template gallery section)
           │
           └─ clicks "Sales" template
                   │
                   ▼
           CreateModal opens with:
             prompt = "Create a sales performance dashboard..."
             max_kpis = 6
             max_charts = 4
             (user can still edit prompt before generating)
                   │
                   ▼
           generateDashboard({ dataset_id, prompt, max_kpis, max_charts })
           → POST /api/v1/dashboards/generate  ← EXISTING endpoint, unchanged
                   │
                   ▼
           DashboardGeneratorService.generate()  ← EXISTING logic, unchanged
           (KPISelectionEngine + ChartRecommendationEngine + LayoutEngine + ScoringEngine + LLM naming)
                   │
                   ▼
           saveDashboard({ dashboard_config })  ← EXISTING endpoint, unchanged
                   │
                   ▼
           router.push(`/dashboards/${id}`)
```

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Template prompt does not match dataset columns | None | Engines are data-driven; LLM naming falls back deterministically |
| User edits the prompt and removes template intent | None | Template just initializes the textarea; user owns the final prompt |
| DashboardHub.tsx modification breaks existing flow | Low | Only adding a new section + template pre-fill; existing create button and flow unchanged |
| Template KPI hints mislead user | None | Hints are labelled "Expected KPIs" and explained as approximate |
