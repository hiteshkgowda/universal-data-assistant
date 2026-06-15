# Dependency Audit Report
**Date:** 2026-06-14
**Auditor:** Automated + CTO review
**Scope:** All Python source files in `backend/app`, `backend/agents`, `backend/analytics`, `backend/memory`, `backend/tests`

---

## Audit Result: PASS (after fixes applied)

All runtime dependencies are correctly declared in `requirements.txt`.  
One dev dependency was missing from `requirements-dev.txt` and has been added.  
The local venv was missing `scikit-learn` (it was in `requirements.txt` but not installed); fixed.

---

## 1. Methodology

Every `import` statement across all backend Python files was extracted and mapped
to its PyPI package name. The result was compared against:

- `requirements.txt` (runtime — used by Render `buildCommand`)
- `requirements-dev.txt` (dev/test — must be installed manually by developers)
- `pip list` output from the active `.venv`

Three categories were checked:
- **Top-level imports** (`import X`, `from X import Y` at module level)
- **Conditional imports** (inside `try:` blocks — optional dependencies)
- **Local/deferred imports** (inside function bodies — lazy loading)

---

## 2. Complete Import → Package Mapping

| Import | PyPI Package | In requirements.txt | In requirements-dev.txt |
|---|---|---|---|
| `aiosqlite` | `aiosqlite` | ✅ `>=0.19.0` | — |
| `cryptography` | `cryptography` | ✅ `>=42.0.0` | — |
| `fastapi` | `fastapi` | ✅ `>=0.115.0` | — |
| `httpx` | `httpx` | ✅ `>=0.27.0` | ✅ (added) |
| `jwt` | `PyJWT` | ✅ `>=2.9.0` | — |
| `langgraph` | `langgraph` | ✅ `>=1.0.0` | — |
| `langgraph.checkpoint.memory` | `langgraph` | ✅ (same package) | — |
| `langgraph.checkpoint.sqlite` | `langgraph-checkpoint-sqlite` | ✅ `>=1.0.0` | — |
| `numpy` | `numpy` | ✅ `>=2.1.0` | — |
| `openpyxl` | `openpyxl` | ✅ `>=3.1.5` | — |
| `pandas` | `pandas` | ✅ `>=2.2.0` | — |
| `plotly` | `plotly` | ✅ `>=5.24.0` | — |
| `pydantic` | `pydantic` | ✅ `>=2.10.0` | — |
| `pydantic_settings` | `pydantic-settings` | ✅ `>=2.7.0` | — |
| `reportlab` | `reportlab` | ✅ `>=4.2.0` | — |
| `sqlalchemy` | `SQLAlchemy` | ✅ `>=2.0.0` | — |
| `starlette` | `starlette` | ✅ (transitive from `fastapi`) | — |
| `python-multipart` | `python-multipart` | ✅ `>=0.0.20` | — |
| `python-dotenv` | `python-dotenv` | ✅ `>=1.0.1` | — |
| `psycopg` | `psycopg[binary]` | ✅ `>=3.1.0` | — |
| `PyMySQL` | `PyMySQL` | ✅ `>=1.1.0` | — |
| **Test imports** | | | |
| `pytest` | `pytest` | — | ✅ `>=8.0.0` |
| `pytest_asyncio` | `pytest-asyncio` | — | ✅ (added) |

---

## 3. Conditional / Optional Imports

These imports are wrapped in `try/except` blocks. The code has explicit fallbacks
when the package is unavailable.

| Import | Package | Location | Fallback |
|---|---|---|---|
| `from sklearn.ensemble import IsolationForest` | `scikit-learn` | `analytics/anomaly_detector.py:45` | Mahalanobis distance fallback; logged as warning |
| `from statsmodels.tsa.holtwinters import ExponentialSmoothing` | `statsmodels` | `app/services/forecast_models.py:16` | numpy linear OLS → naive fallback |
| `from statsmodels.tsa.seasonal import STL` | `statsmodels` | `app/services/forecast_models.py:17` & `analytics/anomaly_detector.py:53` | Same numpy fallback |
| `import redis.asyncio as aioredis` | `redis` | `memory/session_memory.py:40` | In-process `TTLCache` only; Redis is disabled if `REDIS_URL` unset |

**`scikit-learn`** and **`statsmodels`** are both in `requirements.txt` and will be installed
on Render. The fallback code exists as a safety net for environments where installation
fails at import time (e.g. ARM64 binary incompatibility), not as a reason to omit them.

**`redis`** is intentionally absent from `requirements.txt`. It is an optional
performance enhancement that activates only when `REDIS_URL` is configured. No
change needed.

---

## 4. The Five Specifically Audited Packages

| Package | In requirements.txt | Min version declared | Clean install result | Local venv (pre-fix) | Local venv (post-fix) |
|---|---|---|---|---|---|
| `scikit-learn` | ✅ `>=1.4.0` | 1.4.0 | ✅ 1.9.0 | ❌ NOT INSTALLED | ✅ 1.9.0 |
| `statsmodels` | ✅ `>=0.14.0` | 0.14.0 | ✅ 0.14.6 | ✅ 0.14.6 | ✅ 0.14.6 |
| `numpy` | ✅ `>=2.1.0` | 2.1.0 | ✅ 2.4.6 | ✅ 2.4.6 | ✅ 2.4.6 |
| `pandas` | ✅ `>=2.2.0` | 2.2.0 | ✅ 3.0.3 | ✅ 3.0.3 | ✅ 3.0.3 |
| `aiosqlite` | ✅ `>=0.19.0` | 0.19.0 | ✅ 0.22.1 | ✅ 0.22.1 | ✅ 0.22.1 |

---

## 5. Issues Found and Fixes Applied

### Issue 1 — `scikit-learn` not installed in local venv
**Severity:** HIGH — `IsolationForest` anomaly detection silently falls back to Mahalanobis without it

**Root cause:** The venv was created before `scikit-learn` was added to `requirements.txt`,
or `pip install -r requirements.txt` was not re-run after the entry was added.

**Status:** ✅ FIXED
```bash
.venv/bin/pip install "scikit-learn>=1.4.0"
# Result: Successfully installed scikit-learn-1.9.0
```

**Render impact:** None — `scikit-learn` has been in `requirements.txt` since it was
added. Render always runs `pip install -r requirements.txt` from scratch on each deploy.

---

### Issue 2 — `pytest-asyncio` missing from `requirements-dev.txt`
**Severity:** HIGH — any CI pipeline running `pip install -r requirements-dev.txt` then
`pytest` would fail to run the 13 async test methods in `test_memory_system.py`

**Root cause:** `pytest-asyncio` was installed manually into the venv but never pinned
in the dev requirements file.

**Status:** ✅ FIXED — added to `requirements-dev.txt`:
```
pytest-asyncio>=0.23.0
```

**Evidence of usage:**
```
backend/tests/test_memory_system.py:19   import pytest_asyncio
backend/tests/test_memory_system.py:94   @pytest.mark.asyncio
# ... 12 more @pytest.mark.asyncio decorated methods
backend/tests/test_memory_system.py:329  @pytest_asyncio.fixture
```

---

### Issue 3 — `httpx` declared only as runtime dep, not dev dep
**Severity:** LOW — `httpx` is already in `requirements.txt` so it is always available.
However, listing it in `requirements-dev.txt` makes the dev install self-contained and
explicit about the TestClient dependency.

**Status:** ✅ FIXED — added to `requirements-dev.txt` with explanatory comment.

---

### Non-issues (verified clean)

| Concern | Finding |
|---|---|
| `scipy` not in requirements.txt | Transitive dep of `statsmodels`; not imported directly anywhere in source |
| `starlette` not in requirements.txt | Transitive dep of `fastapi`; always present |
| `redis` not in requirements.txt | Optional; guarded by `if redis_url:` — intentionally excluded |
| `langchain-core` in venv but not in requirements | Transitive dep of `langgraph`; not imported directly |

---

## 6. Final State of requirements-dev.txt

```
# Development / test dependencies (install in addition to requirements.txt)
pytest>=8.0.0
pytest-asyncio>=0.23.0          # @pytest.mark.asyncio for async test methods
httpx>=0.27.0                   # TestClient transport; duplicates runtime dep but makes dev install self-contained
```

---

## 7. Test Suite Verification

After applying fixes, the full test suite was re-run:

```
593 passed, 1 warning in 5.21s
```

The 1 warning is a `StarletteDeprecationWarning` from `fastapi.testclient` about
`httpx` → `httpx2`. This is a framework-level deprecation in Starlette 1.2.x,
not an application issue. No action required — the warning does not affect test
results or Render deployment.

---

## 8. Clean Install Verification

A fresh Python 3.14 venv was created at `/tmp/uda_clean_test` and
`pip install -r requirements.txt` was run from scratch. All packages resolved
and installed successfully. Results for the 5 audited packages:

```
PASS: scikit-learn==1.9.0
PASS: statsmodels==0.14.6
PASS: numpy==2.4.6
PASS: pandas==3.0.3
PASS: aiosqlite==0.22.1
```

No missing packages. No version conflicts. No dependency resolution errors.
