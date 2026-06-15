# AI Copilot Workspace — Architecture
**Route:** `/copilot`  
**Status:** AWAITING APPROVAL — no implementation started

---

## 1. Purpose

A single unified workspace that lets users converse with their data on the left while a live intelligence panel on the right automatically surfaces insights, anomalies, root causes, recommendations, forecasts, and session memory — all from one screen.

---

## 2. Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  AppShell (sidebar + topbar — unchanged)                         │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  CopilotWorkspace  (h-full, flex flex-row, no scroll)       ││
│  │                                                              ││
│  │  ┌─────────────────────┐  ┌──────────────────────────────┐  ││
│  │  │  CopilotChat        │  │  CopilotIntelligencePanel    │  ││
│  │  │  (w-[45%] min-w-80) │  │  (flex-1)                    │  ││
│  │  │                     │  │                               │  ││
│  │  │  ┌───────────────┐  │  │  [Tab bar]                   │  ││
│  │  │  │ Dataset       │  │  │  Insights · Root Causes ·    │  ││
│  │  │  │ selector      │  │  │  Recs · Anomalies ·          │  ││
│  │  │  └───────────────┘  │  │  Forecasts · Session         │  ││
│  │  │                     │  │                               │  ││
│  │  │  Conversation       │  │  [Active tab content]        │  ││
│  │  │  thread (scroll)    │  │  (scrollable)                 │  ││
│  │  │                     │  │                               │  ││
│  │  │  [Question input]   │  │                               │  ││
│  │  └─────────────────────┘  └──────────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

- Left panel is **45 % width** (min 320 px), right panel takes the rest.
- A thin 1 px border separates the panels — no drag-to-resize in v1.
- Both panels are independently scrollable.
- The entire workspace fills the viewport with no outer scroll.

---

## 3. Data Flow

```
User types question
        │
        ▼
CopilotChat → POST /api/v1/chart
        │         returns { answer, table_data, chart_spec }
        │
        ├─ append chat turn (left panel updates)
        │
        └─ if table_data.length > 0
               ├─ auto-fire POST /api/v1/insights/generate
               │      (table_data passed as payload)
               │      active tab switches to "insights"
               │
               └─ store table_data in CopilotState
                      (available for user-triggered tabs)

User clicks "Analyze" in a tab
        │
        ├─ Root Causes → POST /api/v1/root-cause
        ├─ Recommendations → POST /api/v1/recommendations
        ├─ Anomalies → POST /api/v1/anomalies
        └─ Forecasts → POST /api/v1/forecast

Session Context tab
        └─ GET /api/v1/memory/context  (refetchInterval: 30 s)
```

**Why `/api/v1/chart` for chat, not `/api/v1/query`?**
`/chart` returns both `table_data` (rows) and `chart_spec` (Plotly JSON), making the chat richer and providing the `table_data` that feeds Insights automatically. `/query` only returns `answer + query_plan`.

**Why auto-trigger only Insights?**
Insights is the only endpoint that takes `table_data` directly from the query result. The other five endpoints need additional user context (time columns, metric columns, forecast horizon) or are heavier — they are user-triggered with "Analyze" buttons.

---

## 4. State — `useCopilot` hook

```typescript
// src/hooks/use-copilot.ts

type CopilotTab =
  | "insights"
  | "root-cause"
  | "recommendations"
  | "anomalies"
  | "forecast"
  | "session";

interface CopilotChatTurn {
  role: "user" | "assistant" | "error";
  id: string;
  timestamp: string;
  // user
  content?: string;
  // assistant
  answer?: string;
  table_data?: Record<string, unknown>[];
  chart_spec?: Record<string, unknown> | null;
  chart_type?: string | null;
  // error
  message?: string;
}

interface CopilotState {
  datasetId: string | null;
  setDatasetId: (id: string) => void;

  // Chat
  chatTurns: CopilotChatTurn[];
  chatPending: boolean;
  sendMessage: (question: string) => void;
  clearChat: () => void;

  // Shared signal from last chat result
  lastTableData: Record<string, unknown>[] | null;
  lastQuestion: string | null;

  // Tab control
  activeTab: CopilotTab;
  setActiveTab: (tab: CopilotTab) => void;

  // Insights (auto-triggered after chat)
  insightsResult: InsightResponse | null;
  insightsPending: boolean;
  insightsError: string | null;
  runInsights: (question?: string) => void;

  // Other tabs expose only their mutation — tab components own local state
  // (see section 7 for each tab's internal design)
}
```

`useCopilot` is instantiated once in `CopilotWorkspace` and passed as props to children. No React Context is used — explicit prop threading keeps data flow auditable.

---

## 5. File Map

### New files

| File | Role |
|------|------|
| `src/app/copilot/page.tsx` | Server page — `<CopilotWorkspace />` |
| `src/components/copilot/CopilotWorkspace.tsx` | Owns `useCopilot`, renders split layout |
| `src/components/copilot/CopilotChat.tsx` | Left panel: dataset selector + thread + input |
| `src/components/copilot/CopilotIntelligencePanel.tsx` | Right panel: tab bar + active tab |
| `src/components/copilot/tabs/InsightsTab.tsx` | Displays `InsightResponse`; has "Re-run" button |
| `src/components/copilot/tabs/RootCauseTab.tsx` | Form + result for `/root-cause` |
| `src/components/copilot/tabs/RecommendationsTab.tsx` | Result for `/recommendations` |
| `src/components/copilot/tabs/AnomaliesTab.tsx` | Result for `/anomalies` |
| `src/components/copilot/tabs/ForecastTab.tsx` | Form + result for `/forecast` |
| `src/components/copilot/tabs/SessionContextTab.tsx` | Memory turns list; auto-refreshes |

### Modified files

| File | Change |
|------|--------|
| `src/components/layout/Sidebar.tsx` | Add `{ href: "/copilot", label: "Copilot", icon: BrainCircuit }` to Analysis group |

---

## 6. Component Details

### `CopilotWorkspace.tsx`

```
"use client"
useCopilot() → all state
renders: flex h-full
  ├─ CopilotChat (props: state slice)
  └─ CopilotIntelligencePanel (props: state slice)
```

### `CopilotChat.tsx`

Header row:
- `DatasetSelector` (reused from `src/components/ask/DatasetSelector.tsx`)
- Row count pill (from preview)
- Clear button (clears chatTurns only)

Body:
- `ConversationThread` adapted for copilot turns (reuses existing render logic)
- Shows `PlotlyChart` inline when `chart_spec` present
- Shows `ResultTable` inline when `table_data` present

Footer:
- `QuestionInput` (reused from `src/components/ask/QuestionInput.tsx`)
- Small "auto-analyzing…" badge when `insightsPending` is true

### `CopilotIntelligencePanel.tsx`

Tab bar — 6 tabs with icon + label:

| Tab | Icon (lucide) | Label |
|-----|--------------|-------|
| insights | Sparkles | Insights |
| root-cause | GitFork | Root Causes |
| recommendations | Zap | Recs |
| anomalies | AlertTriangle | Anomalies |
| forecast | TrendingUp | Forecasts |
| session | BookOpen | Session |

Active tab has `bg-primary text-primary-foreground` pill; others are ghost.

Content area: `flex-1 overflow-y-auto` — each tab component fills this.

### `InsightsTab.tsx`

- If `insightsPending`: spinner + "Auto-analyzing query results…"
- If `insightsResult`: renders `summary`, `key_insights`, `trends`, `recommendations` — same layout as existing `InsightWorkspace`
- "Re-run" button (re-fires `runInsights` with current question)
- Empty state: "Ask a question in the chat to auto-generate insights"

### `RootCauseTab.tsx`

Compact form (collapsible):
- Question input (pre-filled from `lastQuestion`)
- Optional: metric_column, period_column selectors (column names from preview)
- "Analyze" button → `useMutation` → POST `/api/v1/root-cause`

Result: `problem` string, `root_causes` list (rank + dimension + impact badge), `contribution_analysis` table, `recommendations` list

### `RecommendationsTab.tsx`

- "Generate" button → POST `/api/v1/recommendations` with `query_results: lastTableData`
- Uses `lastTableData` as signal source automatically — no form needed
- Result: priority-grouped recommendation cards (`critical` → `high` → `medium` → `low`)
- Each card: action, reason, expected_impact, confidence bar

### `AnomaliesTab.tsx`

- "Detect Anomalies" button → POST `/api/v1/anomalies` with `dataset_id`
- Optional column selector (multi-select from preview column_names)
- Result: severity badge, affected_metrics chips, `ColumnAnomaly` list, `PlotlyChart` if `chart_spec` present

### `ForecastTab.tsx`

Compact form:
- Question input (pre-filled: "Forecast the next 30 days")
- "Forecast" button → POST `/api/v1/forecast`
- Result: `answer`, method_used badge, `PlotlyChart` if chart_spec present, data table

### `SessionContextTab.tsx`

- `useQuery({ queryFn: () => getMemoryContext(sessionId), refetchInterval: 30_000 })`
- Shows `summary` string at top
- `turn_count` and `datasets_referenced` pills
- Scrollable list of `ConversationTurn` cards (type badge + question + answer snippet)
- "Clear Session" button → DELETE `/api/v1/memory/clear`

---

## 7. Animations

All consistent with project style (Framer Motion v12):

```typescript
const fadeIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2 } },
};
const stagger: Variants = {
  show: { transition: { staggerChildren: 0.05 } },
};
```

- Tab content mounts with `AnimatePresence mode="wait"` + `fadeIn`
- Chat turns append with `fadeIn`
- Intelligence results stagger-in with `stagger` + `fadeIn`
- Tab switch: no slide — just opacity fade (avoids layout jank in split view)

---

## 8. APIs Used

All endpoints already exist. No new backend code required.

| Tab | Endpoint | Method |
|-----|----------|--------|
| Chat | `/api/v1/chart` | POST |
| Insights | `/api/v1/insights/generate` | POST |
| Root Causes | `/api/v1/root-cause` | POST |
| Recommendations | `/api/v1/recommendations` | POST |
| Anomalies | `/api/v1/anomalies` | POST |
| Forecasts | `/api/v1/forecast` | POST |
| Session | `/api/v1/memory/context` | GET |
| Session clear | `/api/v1/memory/clear` | DELETE |

---

## 9. Sidebar Change

Add one item to the **Analysis** group in `Sidebar.tsx`:

```diff
  {
    label: "Analysis",
    items: [
+     { href: "/copilot", label: "Copilot", icon: BrainCircuit },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
```

---

## 10. Open Questions

**Q1 — Dataset required?**
Chat requires a `dataset_id`. Should `/copilot` open with an empty state (pick a dataset first) or redirect to `/datasets` if none uploaded? Proposed: show inline dataset picker empty state, same as existing Ask workspace.

**Q2 — Copilot tab persistence?**
Should the active tab survive page navigation (e.g. via `searchParams` or `localStorage`)? Proposed: no persistence in v1, tab resets to "insights" on mount.

**Q3 — Auto-trigger scope?**
Auto-trigger only Insights, or also Anomalies (which just needs `dataset_id`, no table_data)? Proposed: Insights only (anomaly detection is slow; user-triggered gives better control).

**Q4 — Mobile layout?**
The split layout collapses badly below ~900 px. Proposed: stack vertically on mobile with a tab toggle between "Chat" and "Intelligence" views (a single `activeView: "chat" | "intelligence"` toggle button in the header).

---

## 11. Implementation Plan (awaiting approval)

Once approved, implementation order:

1. `useCopilot` hook (state + mutations, no UI)
2. `CopilotWorkspace` skeleton (layout only, no tab content)
3. `CopilotChat` (wire existing ConversationThread + QuestionInput)
4. `InsightsTab` (auto-trigger path proves the data flow)
5. Remaining 5 tabs in order: RootCause → Recommendations → Anomalies → Forecast → Session
6. `SessionContextTab` + `refetchInterval`
7. Sidebar entry
8. Mobile responsive stack

---

**Total new files:** 10  
**Modified files:** 1  
**New backend files:** 0  
**New API functions:** 0 (all existing)
