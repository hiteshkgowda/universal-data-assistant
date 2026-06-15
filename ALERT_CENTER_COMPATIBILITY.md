# Alert Center — Compatibility Report

## Feature scope
- `/alerts` page displaying active and historical alerts across datasets
- Severity-grouped KPI alerts (from KPI Monitor)
- Anomaly scan panel (from Anomaly Detection)
- Related recommendations (from KPI Monitor + optionally Recommendation Engine)
- Alert history stored in browser localStorage (no backend persistence needed)

---

## Backend analysis

### No backend changes required

All alert-producing logic already exists and is fully reused:

| Source | Endpoint | Returns |
|---|---|---|
| KPI Monitor | `GET /api/v1/datasets/{id}/monitor` | `alerts[]`, `recommendations[]`, `overall_health`, `kpis[]` |
| Anomaly Detection | `POST /api/v1/anomalies` | `anomalies[]`, `severity`, `affected_metrics`, `possible_reasons` |
| Recommendations | `POST /api/v1/recommendations` | `recommendations[]`, `summary` |

`KPIMonitorResponse.alerts` (type `KPIAlert[]`) already contains: `severity`, `kpi_name`, `message`, `value`, `threshold`, `row_index`, `label`.

`KPIMonitorResponse.recommendations` (type `KPIRecommendation[]`) already contains: `priority`, `kpi`, `issue`, `action`.

No new schemas, routes, services, or storage volumes are added.

---

## Frontend analysis

### Why localStorage for history
Persisting alert history in the backend would require a new store, a new schema, new routes, and storage volume — violating Rules 3, 5, 8. Browser localStorage is zero-dependency, zero-backend, survives page navigations, and naturally scopes to the user's browser. Each alert scan result is stamped with a timestamp and stored per dataset (last 10 runs kept per dataset_id). This achieves "historical alerts" without any backend changes.

### New files (3)
| File | Purpose |
|---|---|
| `src/app/alerts/page.tsx` | Server component, wraps workspace in `AppShell` |
| `src/components/alerts/AlertCenterWorkspace.tsx` | Full workspace: dataset picker, active/historical tabs, alert cards, anomaly panel, recommendations |
| `src/components/alerts/AlertHistoryStore.ts` | Pure helper — read/write alert snapshots to localStorage |

### Modified files (1)
| File | Change |
|---|---|
| `src/components/layout/Sidebar.tsx` | Add `Bell` icon + `/alerts` nav item under "Analysis" group |

### Existing API files reused (no changes)
- `src/lib/api/kpi-monitor.ts` — `getKPIMonitor`
- `src/lib/api/anomalies.ts` — `detectAnomalies`
- `src/lib/api/recommendations.ts` — `generateRecommendations`
- `src/lib/api/datasets.ts` — `listDatasets`

### Existing hooks reused (no changes)
- `src/hooks/use-datasets.ts` — `useDatasets`

No new hooks files, no new API client files.

---

## Data flow

```
User selects dataset
        │
        ▼
getKPIMonitor(datasetId)  ←── GET /datasets/{id}/monitor (cached 30s)
        │
        ├─ alerts[]            → Active Alerts tab
        ├─ recommendations[]   → Recommendations section
        └─ overall_health      → Health badge
        │
        ▼
AlertHistoryStore.push(datasetId, snapshot)  →  localStorage
        │
        ▼
AlertHistoryStore.list(datasetId)  →  Historical tab (sorted by timestamp)

User clicks "Scan Anomalies"
        │
        ▼
detectAnomalies({ dataset_id, methods: all })  ←── POST /anomalies
        │
        └─ anomalies[], severity, affected_metrics  → Anomaly panel
```

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| localStorage not available (SSR) | None | AlertHistoryStore guards with `typeof window !== 'undefined'` |
| Many datasets = many concurrent KPI requests | Low | Only runs for the selected dataset, not all at once |
| localStorage quota exceeded | Low | Keep last 10 snapshots per dataset; each snapshot is small (KPI alerts only, no chart_spec) |
| Existing KPI monitor caching interferes | None | Uses same `useQuery` with staleTime=30s; cache serves "active" view |

---

## Implementation order
1. `src/components/alerts/AlertHistoryStore.ts` — pure localStorage helper
2. `src/components/alerts/AlertCenterWorkspace.tsx` — full workspace
3. `src/app/alerts/page.tsx` — page wrapper
4. `src/components/layout/Sidebar.tsx` — add nav item
