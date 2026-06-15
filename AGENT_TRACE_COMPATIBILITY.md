# Agent Trace Viewer — Compatibility Report

## Feature scope
- `/agents/trace` page — inspect any agent session's execution plan, step timing, inputs/outputs
- Session selector (from localStorage) + `?session_id=xxx` deep-link
- Reuses existing `GET /agent/session/{session_id}` backend endpoint
- One minimal additive schema change: `plan` field added to `AgentSessionInfo`

---

## Existing infrastructure reused

### Backend
| Existing asset | Reused as |
|---|---|
| `GET /agent/session/{session_id}` | Primary data source — returns full session snapshot |
| `AgentOrchestrator.get_session()` | Already reads `plan` from LangGraph state; just not surfaced |
| `PlannedToolCall` schema | Already defined; reused in the new `plan` field |
| `ToolResult` schema | Already in `completed_results`; drives step status |
| `AgentState.plan` | Already stored in LangGraph checkpoint |

### Frontend
| Existing asset | Reused as |
|---|---|
| `getAgentSession(sessionId)` in `agent.ts` | Fetch session data from backend |
| `AgentSessionInfo` type | Primary display type (with new `plan` field) |
| `PlannedToolCall` / `ToolResult` types | Already typed; drive step cards |
| `StoredSession` / `loadSessions()` in `components/agent/types.ts` | Session list for the selector |
| `SESSION_STORAGE_KEY` localStorage | Source of known session IDs |

---

## Backend changes

### 1. `backend/app/schemas/agent.py` — additive field on `AgentSessionInfo`
```python
# Add to AgentSessionInfo:
plan: list[PlannedToolCall] = Field(default_factory=list)
```
Backward-compatible: clients that don't read `plan` are unaffected.

### 2. `backend/app/services/agent_orchestrator.py` — surface `plan` in `get_session()`
```python
# In AgentSessionInfo(...) constructor call, add:
plan=[PlannedToolCall(**p) for p in plan if isinstance(p, dict)],
```

---

## Frontend changes

### Modified files (3)

| File | Change |
|---|---|
| `src/lib/api/types.ts` | Add `plan: PlannedToolCall[]` to `AgentSessionInfo` |
| `src/components/layout/Sidebar.tsx` | Add Trace nav item under Operations group |

### New files (2)

| File | Purpose |
|---|---|
| `src/app/agents/trace/page.tsx` | Next.js page route |
| `src/components/agent/AgentTraceWorkspace.tsx` | Full trace viewer component |

---

## Data flow inside the trace viewer

```
URL: /agents/trace?session_id=xxx
          │
          ├─ session_id present?
          │     YES → useQuery(getAgentSession(sessionId))
          │     NO  → loadSessions() from localStorage → session picker
          │
          └─ AgentSessionInfo rendered:
                user_goal, status, final_answer, error
                │
                ├─ Plan steps (from plan[])
                │     PlannedToolCall: tool_name, step_label, requires_approval
                │     Execution status derived:
                │       index < completed_results.length → done (match by index)
                │       index = current_step AND running/suspended → in-progress
                │       index > current_step → pending
                │
                └─ Per-completed step details (from completed_results[])
                      ToolResult: duration_ms, error, output.answer
```

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Sessions older than LangGraph MemorySaver restart are gone | Low | Show graceful error on 404 from backend; localStorage entries remain for display |
| `plan` array may be empty if session was a direct chat reply | None | Trace viewer shows "No plan steps" gracefully |
| Session not owned by current user | None | Backend returns 404 (existing security behaviour) |
| Plan/results mismatch on recovery (replan changes plan mid-run) | Low | Display plan as-is from final LangGraph state; completed_results indexed by position |
