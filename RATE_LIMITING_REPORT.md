# API Rate Limiting Report
**Date:** 2026-06-14  
**Library:** slowapi 0.1.10  
**Test suite:** 614 passed (593 existing + 21 new)

---

## Overview

API rate limiting is now enforced on all six high-cost endpoints.  
Limits are applied per-user or per-IP and return HTTP 429 with a `Retry-After: 3600` header when exceeded.

| Caller type | Limit | Bucket key |
|---|---|---|
| Authenticated (valid Bearer JWT) | **100 requests / hour** | `auth:{jwt.sub}` |
| Anonymous (no token or invalid token) | **20 requests / hour** | `anon:{client_ip}` |

---

## Protected Endpoints

| Route | Handler | Method |
|---|---|---|
| `POST /api/v1/query` | `run_query` | NL query → QueryPlan execution |
| `POST /api/v1/agent/run` | `run_agent` | Multi-step agent session |
| `POST /api/v1/agent/resume/{session_id}` | `resume_agent` | Resume CRUD-approval session |
| `POST /api/v1/agent/explain` | `explain_agent` | Plan-only (no tool execution) |
| `POST /api/v1/insights/generate` | `generate_insights` | AI insight generation |
| `POST /api/v1/recommendations` | `generate_recommendations` | Recommendation engine |
| `POST /api/v1/root-cause` | `root_cause_analysis` | Root cause analysis |
| `POST /api/v1/anomalies` | `detect_anomalies` | Statistical anomaly detection |

`GET /api/v1/agent/session/{session_id}` is intentionally excluded (read-only, no LLM).

---

## Architecture

### Key function (`_rate_limit_key`)

```
Request
  │
  ├─ Authorization: Bearer <token>?
  │     ├─ YES → jwt.decode(token, BACKEND_JWT_SECRET, HS256)
  │     │         ├─ valid → return "auth:{sub}"      ← 100/hour bucket
  │     │         └─ invalid/expired → fall through
  │     └─ NO
  │
  └─ return "anon:{request.client.host}"               ← 20/hour bucket
```

### Dynamic limit function (`_dynamic_limit`)

slowapi calls `_dynamic_limit(key_func(request))`. The function signature must have
a `key` parameter — slowapi detects it via `inspect.signature` and passes the bucket
key string:

```python
def _dynamic_limit(key: str) -> str:
    return "100/hour" if key.startswith("auth:") else "20/hour"
```

### Route signature pattern

Every protected route includes `request: Request` as the first parameter. slowapi
searches the function signature by type annotation (`starlette.requests.Request`),
not by name. Body parameters are renamed to `body` to avoid naming conflicts:

```python
@router.post("/query", ...)
@limiter.limit(_dynamic_limit)
async def run_query(
    request: Request,        # required by slowapi
    body: QueryRequest,      # renamed from 'request' to avoid collision
    ...
)
```

### App wiring (`main.py`)

```python
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
```

---

## HTTP 429 Response

```json
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 3600

{
  "detail": "Rate limit exceeded: 20 per 1 hour. Authenticated users: 100 requests/hour. Anonymous users: 20 requests/hour."
}
```

---

## Files Changed

| File | Change |
|---|---|
| `backend/app/core/rate_limit.py` | **NEW** — `_rate_limit_key`, `_dynamic_limit`, `limiter`, `rate_limit_exceeded_handler` |
| `backend/app/main.py` | Wire `app.state.limiter` and exception handler |
| `backend/app/api/routes/query.py` | Add `@limiter.limit`, `request: Request`, rename body → `body` |
| `backend/app/api/routes/insights.py` | Same pattern |
| `backend/app/api/routes/anomalies.py` | Same pattern |
| `backend/app/api/routes/recommendations.py` | Same pattern |
| `backend/app/api/routes/root_cause.py` | Same pattern |
| `backend/app/api/routes/agent.py` | Same pattern for `run_agent`, `resume_agent`, `explain_agent` |
| `requirements.txt` | Add `slowapi>=0.1.9` |
| `backend/tests/test_rate_limiting.py` | **NEW** — 21 tests |

---

## Test Coverage

### Unit tests (no HTTP, no app)

| Test | What it proves |
|---|---|
| `test_valid_jwt_returns_auth_bucket` | Valid token → `auth:{sub}` key |
| `test_no_auth_header_returns_anon_bucket` | No header → `anon:{ip}` key |
| `test_invalid_token_returns_anon_bucket` | Malformed token → `anon:{ip}` key |
| `test_wrong_secret_returns_anon_bucket` | Wrong signing secret → `anon:{ip}` key |
| `test_bearer_prefix_required` | `Token xxx` (not `Bearer`) → `anon:{ip}` |
| `test_missing_sub_claim_returns_anon` | JWT with no `sub` → `anon:{ip}` |
| `test_auth_key_gets_100_per_hour` | `_dynamic_limit("auth:...")` → `"100/hour"` |
| `test_anon_key_gets_20_per_hour` | `_dynamic_limit("anon:...")` → `"20/hour"` |
| `test_prefix_is_case_sensitive` | `"AUTH:..."` not matched as auth |
| `test_returns_429` | Exception handler → status 429 |
| `test_body_contains_detail` | Response body has `"detail"` with limit info |
| `test_retry_after_header` | Response has `Retry-After: 3600` header |

### Integration tests (full HTTP round-trip)

| Test | What it proves |
|---|---|
| `test_requests_within_limit_succeed` | 3 requests under 3/hour limit → all 200 |
| `test_request_beyond_limit_returns_429` | 2nd request over 1/hour limit → 429 |
| `test_429_body_has_detail_key` | 429 response has `"detail"` key |
| `test_429_has_retry_after_header` | 429 response has `Retry-After: 3600` |
| `test_query_route_wired` | `/query` accepts `request: Request` (slowapi finds it) |
| `test_insights_route_wired` | `/insights/generate` — same |
| `test_anomalies_route_wired` | `/anomalies` — same |
| `test_recommendations_route_wired` | `/recommendations` — same |
| `test_root_cause_route_wired` | `/root-cause` — same |

---

## Design Decisions

### Why rename body parameter to `body`?

slowapi looks up the starlette `Request` by `kwargs.get("request", ...)` — it searches by
the string `"request"` in the keyword arguments. The original pydantic body parameter
was named `request` in all six routes, which collided. Renaming the pydantic parameter
to `body` eliminates the collision without changing any external API behaviour.

### Why not use slowapi middleware?

slowapi's `SlowAPIMiddleware` applies a default limit globally and requires all routes
to be annotated. The `@limiter.limit()` decorator approach is more surgical: only the
six targeted routes are affected, and the limit is dynamic per-request.

### Why decode the JWT in the key function?

The rate limiter runs **before** FastAPI dependency injection. `get_current_user` (the
auth dependency) hasn't run yet when the key function is called. Re-decoding the token
in `_rate_limit_key` is the only way to identify the user at rate-limit time. The decode
is a fast symmetric HMAC operation and results are not cached (the TTL cache on `get_settings`
means the secret lookup is O(1) after the first call).

### Anonymous requests still hit auth before processing

All protected routes also have `Depends(get_current_user)`, which raises HTTP 401 for
missing/invalid tokens. The rate limiter fires first: an anonymous caller hammering the
API will hit the 20/hour limit and receive 429 before the 401 is ever computed, saving
server resources.

### Rate limit state is in-process (no Redis)

slowapi's default storage is an in-process LRU cache. With `--workers 1` (required by
the SQLite single-writer constraint), there is only one process, so in-process state
is consistent. If workers are ever increased (after migrating to PostgreSQL), a Redis
backend can be wired via `Limiter(storage_uri="redis://...")`.

---

## Test Results

```
$ .venv/bin/python -m pytest backend/tests/ -q

614 passed, 20 warnings in 5.13s
```

All 593 pre-existing tests still pass. 21 new rate-limiting tests added.

---

## Remaining Notes

- The `asyncio.iscoroutinefunction` deprecation warning from `slowapi/extension.py:720`
  is an upstream issue in slowapi 0.1.10 (they use `asyncio.iscoroutinefunction` instead
  of `inspect.iscoroutinefunction`). It is harmless and will be resolved in a future
  slowapi release. No action required.
- The `InsecureKeyLengthWarning` from PyJWT in tests is expected — the 11-byte
  test secrets are intentionally short; production uses 32-byte secrets generated by
  `secrets.token_urlsafe(32)`.
