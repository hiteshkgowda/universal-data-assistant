# Comment Review Report

Scope: `backend/` (Python) and `frontend-next/src/` (TypeScript/TSX).

Approach:
- **Remove** comments that say what the next line obviously does.
- **Rewrite** comments that make vague claims or use buzzword labels.
- **Keep** comments that explain a constraint, a non-obvious invariant, or a surprising edge case.

The section dividers (`# ---- # / # Section Name # ---- #`) are kept where they help navigate a file longer than ~200 lines; removed only where the following function already has a descriptive name and the divider is a duplicate label.

---

## Category 1 — Test file module docstrings

Six test files open with `"""Enterprise tests — ...` which sounds like a grade or audit category, not a description of what's tested.

| File | Current | Proposed |
|---|---|---|
| `backend/tests/test_ownership_isolation.py` | `"""Enterprise tests — ownership isolation.` | `"""Tests for ownership isolation.` |
| `backend/tests/test_audit_logging.py` | `"""Enterprise tests — audit logging.` | `"""Tests for audit logging.` |
| `backend/tests/test_crud_lifecycle.py` | `"""Enterprise tests — CRUD lifecycle.` | `"""Tests for CRUD lifecycle.` |
| `backend/tests/test_insight_engine.py` | `"""Enterprise tests — AI Insight Generation Engine.` | `"""Tests for the insight generation engine.` |
| `backend/tests/test_report_generation.py` | `"""Enterprise tests — report generation.` | `"""Tests for report generation.` |
| `backend/tests/test_rollback.py` | `"""Enterprise tests — rollback functionality.` | `"""Tests for CRUD rollback.` |

The rest of each docstring (coverage breakdown, what's mocked, what's real) is kept verbatim — it's useful.

---

## Category 2 — Comments that name what code does, not why

### `backend/agents/__init__.py` — line 1

```python
# AI agent modules for the DataPilot AI.
```

**Problem**: The directory is called `agents/`. The comment is the filename in prose form.

**Action**: Remove. The `__init__.py` has no exports so there's nothing to say.

---

### `backend/app/services/crud_executor.py` — lines 65–67

```python
# ------------------------------------------------------------------ #
# Execute
# ------------------------------------------------------------------ #

def execute(
```

**Problem**: `# Execute` before `def execute(...)`. The section divider just repeats the function name.

**Action**: Remove the divider. The function docstring already covers the intent.

---

### `backend/app/services/kpi_monitor_service.py` — line 240

```python
    # Health
    crit_count = sum(1 for a in alerts if a.severity == "critical")
    health: Literal["healthy", "warning", "critical", "unknown"] = (
```

**Problem**: A one-word label for 4 lines of code. The variable is named `health`, so the comment is redundant.

**Action**: Remove.

---

### `backend/app/services/kpi_monitor_service.py` — line 322

```python
    # Cap and sort
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    recs.sort(key=lambda r: priority_order[r.priority])
    return recs[:20]
```

**Problem**: "Cap and sort" describes what the two operations do. Any reader can see that.

**Action**: Remove.

---

### `backend/app/services/agent_graph.py` — line 439

```python
    if explain_only:
        # Return the verified plan as the final answer
        plan = state.get("plan", [])
```

**Problem**: The next line fetches `plan` from state and the subsequent code assembles it into a string. The comment describes what it does, not why `explain_only` takes this path (aggregator is reused for this because the plan is already verified at this point).

**Proposed rewrite**:
```python
    if explain_only:
        # Plan was already verified — aggregator formats it directly without running tools.
        plan = state.get("plan", [])
```

---

## Category 3 — Overclaiming comments

### `backend/agents/insight_agent.py` — line 220

```python
    # Statistical fallback (guaranteed correct — no LLM)
```

**Problem**: "Guaranteed correct" is an overclaim. The fallback is deterministic — it uses computed stats rather than an LLM — but that's not the same as guaranteed correct. (A bug in `_safe_float()` or a bad DataFrame would still produce wrong output.)

**Proposed rewrite**:
```python
    # Statistical fallback — deterministic, no LLM call. Used when both Groq and Ollama fail.
```

---

## Category 4 — Comment that explains setup-time reason (keep with minor edit)

### `backend/app/services/dataset_service.py` — line 76

```python
        # Ensure the storage directory exists up front.
        self._upload_dir.mkdir(parents=True, exist_ok=True)
```

**Problem**: "Ensure the storage directory exists up front" tells you WHAT happens. The WHY — doing it in `__init__` catches misconfiguration at startup rather than on the first upload — is worth saying.

**Proposed rewrite**:
```python
        # Fail at startup if the upload dir can't be created, rather than on first upload.
        self._upload_dir.mkdir(parents=True, exist_ok=True)
```

---

## What's already good — keep these

The following comments are **not changed** because they explain constraints or non-obvious behaviour:

- `backend/app/services/forecast_service.py:113` — `# horizon null is intentional and accepted by the schema — leave it.` — explains that the null is not a bug.
- `backend/app/services/agent_graph.py:424–425` — `# Use 'or' fallback instead of dict default so an explicit None in state doesn't bypass the fallback string.` — explains a non-obvious Python gotcha.
- `backend/app/services/agent_graph.py:429–430` — `# Preserve FAILED status set by planner/verifier/recovery — do not overwrite with DONE.` — explains the aggregator's multi-caller contract.
- `backend/app/api/dependencies.py:30–37` — Checkpointer registry block — explains why `AsyncSqliteSaver` can't use `@lru_cache` (async context manager requirement).
- `backend/app/services/analytics_service.py:107–119` — four-step pipeline comments inside `analyze()` — these are inline documentation of a non-obvious execution order.
- `frontend-next/src/lib/auth.ts:83–87` — JWT decode-without-verify explanation, 60s pre-expiry refresh window — both explain non-obvious invariants.
- `frontend-next/src/lib/api/client.ts:64–74` — 401 token refresh + single-retry logic — explains the flow that prevents auth loops.
- `frontend-next/src/hooks/use-ask.ts:46–47` — `// Initialize empty — localStorage is not available during SSR.` — explains an SSR constraint.
- `frontend-next/src/providers/QueryProvider.tsx:8–9` — explains why QueryClient is created in state rather than at module level.

---

## Summary

| Change type | Count |
|---|---|
| Test docstring prefix ("Enterprise tests →" ) | 6 files |
| Remove dead section dividers | 2 (crud_executor, kpi_monitor) |
| Remove one-word section labels | 2 (kpi_monitor health, cap-and-sort) |
| Remove module-level no-op comment | 1 (agents/__init__.py) |
| Rewrite to explain why, not what | 3 (agent_graph explain_only, insight_agent fallback, dataset_service mkdir) |
| **Total files touched** | **9** |

---

*Awaiting approval before modifying any code.*
