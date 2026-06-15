# AI Code Audit

Scope: `backend/` (Python) and `frontend-next/src/` (TypeScript).
Goal: Identify patterns that signal generated code rather than code maintained over time. No behavior changes — findings only.

---

## HIGH

### H1 — Four parallel planner families, all structurally identical

**Files**: `llm_provider.py`, `forecast_planner.py`, `crud_planner.py`, `agent_planner.py`, `groq_provider.py`

Every LLM-backed feature (query, forecast, CRUD, agent) has its own triple of classes: `OllamaXxxPlanner`, `GroqXxxPlanner`, `FallbackXxxPlanner`. That's 12 classes across 5 files with near-identical bodies.

**All four Ollama planners have identical `__init__`:**
```python
def __init__(self, settings: Settings) -> None:
    self._base_url = settings.ollama_base_url.rstrip("/")
    self._model = settings.ollama_model
    self._client: httpx.AsyncClient | None = None
```
Lines: `llm_provider.py:69`, `forecast_planner.py:51`, `crud_planner.py:82`, `agent_planner.py:272` — 4 verbatim copies.

**All four Fallback planners have identical `__init__` and `set_client`:**
```python
def __init__(self, primary: Any, secondary: Any) -> None:
    self._primary = primary
    self._secondary = secondary

def set_client(self, client: httpx.AsyncClient) -> None:
    for p in (self._primary, self._secondary):
        if hasattr(p, "set_client"):
            p.set_client(client)
```
Lines: `groq_provider.py:168-175`, `groq_provider.py:192-199`, `crud_planner.py:158-165`, `agent_planner.py:410-417` — 4 copies, differing only in the method name being delegated.

**`FallbackQueryPlanner` and `FallbackForecastPlanner` share docstrings verbatim:**
```
"Calls primary; on LLMError logs a warning and delegates to secondary."
```
`groq_provider.py:166` and `groq_provider.py:190`.

**Root cause**: Each feature was built independently by generating the same three-class structure from scratch instead of writing a generic `FallbackPlanner[T]` or shared base. This is the clearest AI-generation signal in the codebase.

---

### H2 — Three agent classes with duplicated HTTP dispatch

**Files**: `agents/insight_agent.py`, `agents/root_cause_agent.py`, `agents/recommendation_agent.py`

Each agent independently implements `_call_groq()`, `_call_ollama()`, `_call_llm()`, and `generate()`. The only meaningful differences are the system prompt and response type.

**`_call_groq()` in InsightAgent vs RootCauseAgent** — identical payload structure, identical header format, identical response extraction (`data["choices"][0]["message"]["content"]`), identical `raise_for_status()`. The variable names differ (`response` vs `resp`).

**`generate()` in InsightAgent vs RootCauseAgent** — structurally identical 3-part pattern:
```python
if self._client is None:
    logger.warning("XxxAgent: no HTTP client — using statistical fallback.")
    return self._fallback_from_findings(findings)
try:
    return await self._call_llm(findings, question)
except Exception as exc:
    logger.warning("XxxAgent: LLM call failed (%s) — using fallback.", exc)
    return self._fallback_from_findings(findings)
```
`insight_agent.py:86-109` and `root_cause_agent.py:104-122`.

**`_call_llm()` dispatch** — identical `if self._settings.groq_api_key: ... else: ...` pattern in all three agents (`insight_agent.py:115`, `root_cause_agent.py:128`, `recommendation_agent.py` inline in `enhance()`).

---

### H3 — Seven exception classes with copy-pasted docstrings, most never raised

**File**: `backend/app/core/exceptions.py:72-96`

```python
class AgentExecutionError(DataAssistantError):
    """Raised when the agent graph encounters an unrecoverable execution failure."""

class AnomalyDetectionError(DataAssistantError):
    """Raised when the anomaly detection pipeline encounters an unrecoverable error."""

class InsightGenerationError(DataAssistantError):
    """Raised when the insight generation pipeline encounters an unrecoverable error."""

class RootCauseError(DataAssistantError):
    """Raised when the root cause analysis pipeline encounters an unrecoverable error."""

class RecommendationError(DataAssistantError):
    """Raised when the recommendation engine encounters an unrecoverable error."""

class MemoryError(DataAssistantError):
    """Raised when the conversational memory system encounters an unrecoverable error."""

class DashboardError(DataAssistantError):
    """Raised when the dashboard generator encounters an unrecoverable error."""
```

The docstring template `"Raised when the X encounters an unrecoverable error."` is copy-pasted with only the noun changed. More critically: `AnomalyDetectionError`, `InsightGenerationError`, `RootCauseError`, `MemoryError`, and `DashboardError` are **defined but never raised** anywhere in the codebase. The services catch exceptions internally and return error responses rather than propagating these types.

---

### H4 — `_safe_float()` defined twice, identically

**Files**: `backend/app/services/insight_service.py:482` and `backend/app/services/root_cause_service.py:551`

```python
def _safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None
```

Word-for-word identical in both files. Neither file imports from the other. A developer maintaining these files over time would have moved this to `app/core/` or a shared `utils.py` the second time they needed it.

---

## MEDIUM

### M1 — `_cache_key()` defined five times across services

**Files**: `kpi_monitor_service.py:336`, `data_quality_service.py:276`, `root_cause_service.py:538`, `anomaly_service.py:101`, `recommendation_service.py:875`

Two of the five are **byte-for-byte identical** (different files, same single line):
```python
def _cache_key(self, dataset_id: str) -> str:
    return hashlib.sha256(dataset_id.encode()).hexdigest()[:16]
```
`kpi_monitor_service.py:336` and `data_quality_service.py:276`.

The other three vary in signature but share the same SHA-256 + hexdigest pattern. No shared utility exists.

---

### M2 — `set_client()` appears 17 times as a one-liner

**Files**: across all planner files + agent files

```python
def set_client(self, client: httpx.AsyncClient) -> None:
    self._client = client
```

This exists because client injection wasn't designed into a base class — each class was written independently with its own copy. The docstrings for this method also vary between three near-identical phrasings:
- `"Attach the shared, lifespan-managed HTTP client."` (`llm_provider.py:75`)
- `"Attach the shared HTTP client. Called once from the app lifespan."` (`insight_agent.py:78`)
- `"Inject the shared lifespan HTTP client. Called once at startup."` (`root_cause_agent.py:97`)

---

### M3 — `"Provide a process-wide :class:`X` instance."` in 14 docstrings

**File**: `backend/app/api/dependencies.py:150-378`

Every cached factory function has the same template docstring. Some examples:
```python
"""Provide a process-wide :class:`ConnectionService` instance."""   # line 150
"""Provide a process-wide :class:`DatasetService` instance."""      # line 157
"""Provide a process-wide :class:`AnalyticsService` instance."""    # line 175
"""Provide a process-wide :class:`VisualizationService` instance.""" # line 188
# ... 10 more identical templates
```

The docstring adds no information over what the function name already says. A developer who wrote these by hand would not have typed "Provide a process-wide" 14 times.

---

### M4 — Markdown fence stripping implemented twice

**Files**: `backend/app/services/agent_planner.py:163` and `backend/agents/recommendation_agent.py:186`

`agent_planner.py` has a named function `_strip_fences()`:
```python
def _strip_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        parts = content.split("```")
        content = parts[1] if len(parts) > 1 else content
        if content.startswith("json"):
            content = content[4:]
    return content.strip()
```

`recommendation_agent.py` has an inline version inside `_parse_response()`:
```python
text = raw.strip()
if text.startswith("```"):
    text = text.split("```", 2)[1]
    if text.startswith("json"):
        text = text[4:]
```

Different split strategy (`split("```")` vs `split("```", 2)`), different variable names, same logic. One of these was written independently from memory of the other.

---

### M5 — Three identical priority union types in `types.ts`

**File**: `frontend-next/src/lib/api/types.ts`

```typescript
export type RecommendationPriority = "critical" | "high" | "medium" | "low";  // ~line 248
export type KPIPriority            = "critical" | "high" | "medium" | "low";  // ~line 611
// DataQualityRecommendation also uses this exact union inline
```

Three separately declared types with identical members. A developer who grew this codebase would have written this once as a shared `Priority` type and imported it.

---

### M6 — JSON parse error handling pattern repeated in five locations

All five Ollama/Groq planner implementations (across `llm_provider.py`, `forecast_planner.py`, `groq_provider.py` ×2, `crud_planner.py`) independently duplicate:

```python
try:
    plan = json.loads(content)
except (json.JSONDecodeError, TypeError) as exc:
    raise LLMError(f"<source> returned invalid JSON: {content!r}") from exc
if not isinstance(plan, dict):
    raise LLMError(f"<source> returned a non-object plan: {plan!r}")
return plan
```

`crud_planner.py` extracted this into `_parse_json(content, source)`. The other four files did not use it and re-implemented it inline. `agent_planner.py` has `_parse_response()` which does the same thing with slightly different variable names.

---

## LOW

### L1 — `timeoutMs: 120_000` repeated in 7 frontend API modules

**Files**: `chart.ts`, `forecast.ts`, `anomalies.ts`, `insights.ts`, `root-cause.ts`, `recommendations.ts`, `dashboards.ts`

Every LLM-backed API function passes `{ timeoutMs: 120_000 }`. The constant is not named, not shared, just repeated. If the timeout ever changes, seven files need updating.

---

### L2 — Section divider comment style applied uniformly

**Pattern**: `// ── Section name ───────────────────────────────────────────────────` used in `AgentTimeline.tsx`, `AgentWorkspace.tsx`, `SettingsWorkspace.tsx`, `AssistantMessage.tsx`, `KPIMonitorDashboard.tsx`, and others.

Uniform decorative dividers across unrelated files are a marker of generated output — a developer applying dividers would apply them inconsistently based on habit and need. The length is always padded to the same column width.

---

### L3 — `_empty_response()` and `_error_response()` parallel helpers

**Files**: `insight_service.py:495`, `root_cause_service.py:581`

Both services define a module-level helper that constructs an empty/error version of their response type:

```python
# insight_service.py
def _empty_response(message: str) -> InsightResponse:
    return InsightResponse(summary=message, key_insights=[], trends=[], ...)

# root_cause_service.py
def _error_response(message: str) -> RootCauseResponse:
    return RootCauseResponse(problem=f"Analysis could not be completed: {message}", ...)
```

Different names (`_empty_response` vs `_error_response`), different response types, same structural purpose. A developer who wrote both would have used the same naming convention.

---

### L4 — `RecommendationAgent._call_groq` hardcodes the API URL

**File**: `backend/agents/recommendation_agent.py:131`

```python
resp = await self._client.post(
    "https://api.groq.com/openai/v1/chat/completions",   # ← hardcoded
    ...
)
```

Every other Groq caller uses `self._settings.groq_base_url`. This one hardcodes the URL, presumably because `recommendation_agent.py` was generated independently from the other files that established the settings-based pattern.

---

### L5 — Frontend hook structure repeated ~10 times

**Files**: `hooks/use-agent.ts`, `hooks/use-crud.ts`, `hooks/use-forecast.ts`, `hooks/use-connections.ts`, etc.

Every mutation hook follows:
```typescript
export function useXxx() {
  return useMutation({
    mutationFn: (req: XxxRequest) => xxxApi(req),
    onError: (err: Error) => {
      toast.error("Xxx failed", { description: err.message });
    },
  });
}
```

This is structurally fine — it's a thin TanStack Query wrapper, not an abstraction problem. But the error toast message format (`"Xxx failed"`, `{ description: err.message }`) is applied so uniformly across all hooks that it reads as generated from a template, not written by someone making case-by-case decisions about error UX.

---

## Summary table

| ID | Finding | Severity | Files affected |
|---|---|---|---|
| H1 | Four planner families — 12 classes with structurally identical bodies | High | 5 planner files |
| H2 | Three agent classes with duplicated LLM dispatch pattern | High | 3 agent files |
| H3 | Seven exception classes with template docstrings, most never raised | High | `exceptions.py` |
| H4 | `_safe_float()` defined twice, word-for-word | High | 2 service files |
| M1 | `_cache_key()` defined five times across services | Medium | 5 service files |
| M2 | `set_client()` as a one-liner, 17 definitions | Medium | 9+ files |
| M3 | 14 identical `"Provide a process-wide"` docstrings | Medium | `dependencies.py` |
| M4 | Markdown fence stripping implemented twice, differently | Medium | 2 files |
| M5 | Three identical priority union types in `types.ts` | Medium | `types.ts` |
| M6 | JSON parse error handling block repeated five times | Medium | 4 planner files |
| L1 | `timeoutMs: 120_000` repeated in 7 API modules | Low | 7 API files |
| L2 | Uniform decorative section divider comments | Low | 10+ components |
| L3 | `_empty_response` vs `_error_response` naming inconsistency | Low | 2 service files |
| L4 | Groq API URL hardcoded in one file, settings-based in all others | Low | `recommendation_agent.py` |
| L5 | Hook mutation structure repeated ~10 times | Low | 6 hook files |

---

## What this means for each High finding

**H1 (planner families)**: The cleanest fix is a generic `_OllamaClient` and `_GroqClient` that take a system prompt and return a parsed dict, then thin named classes that just supply the prompt. `FallbackXxxPlanner` can be replaced with one generic `Fallback` that wraps any method name via a callable. This would cut ~200 lines.

**H2 (agent dispatch)**: A shared `_LLMAgent` base class or mixin with `_call_groq()`, `_call_ollama()`, and `generate()` logic, parameterised by system prompt and fallback function. The three agents become subclasses with only `_build_user_prompt()` and `_parse_response()` different.

**H3 (unused exceptions)**: The five never-raised exception classes can be removed entirely. `AnomalyDetectionError`, `InsightGenerationError`, `RootCauseError`, `MemoryError`, `DashboardError` — none of these are caught anywhere in route handlers.

**H4 (`_safe_float`)**: Move to `backend/app/core/utils.py` (or `backend/app/core/math.py`), import in both services.
