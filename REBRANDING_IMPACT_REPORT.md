# Rebranding Impact Report

**From:** Universal Data Assistant  
**To:** DataPilot AI  
**Subtitle:** Agentic Business Intelligence Copilot  
**Date:** 2026-06-16

---

## 1. Complete Findings — All Occurrences

### Search terms scanned
- `Universal Data Assistant`
- `UniversalDataAssistant`
- `universal-data-assistant`
- `UDA` / `uda-` / `uda_`
- `Data Assistant` (partial match)

---

## 2. Categorized Findings

### A. User-Facing Branding
These appear directly in the browser, on screen, or in page titles.

| File | Line | Current Value | Category |
|---|---|---|---|
| `frontend-next/src/app/layout.tsx` | 29 | `default: "Universal Data Assistant"` | Browser tab title |
| `frontend-next/src/app/layout.tsx` | 30 | `template: "%s — UDA"` | Browser tab template |
| `frontend-next/src/app/auth/signin/page.tsx` | 15 | `Universal Data Assistant` | Sign-in page heading |
| `frontend-next/src/app/agent/page.tsx` | 4 | `"Agent — Universal Data Assistant"` | Page metadata title |
| `frontend-next/src/components/layout/Sidebar.tsx` | 192 | `Data Assistant` | Sidebar logo text |
| `frontend-next/src/components/layout/Topbar.tsx` | 31 | `return "Universal Data Assistant"` | Topbar fallback title |
| `frontend-next/src/components/settings/SettingsWorkspace.tsx` | 357 | `Universal Data Assistant — AI-powered data analysis platform.` | Settings about text |
| `frontend-next/src/components/settings/SettingsWorkspace.tsx` | 361 | `<span>UDA</span>` | Settings version badge |

### B. Documentation
These appear in markdown files, reports, and comments.

| File | Occurrences | Notes |
|---|---|---|
| `README.md` | 6 | Title, overview paragraph, git clone path |
| `README_DRAFT.md` | 5 | Older draft — safe to update or delete |
| `PROJECT_CONTEXT.md` | 2 | Title, directory path reference |
| `INTERVIEW_GUIDE.md` | 1 | Title line |
| `SYSTEM_AUDIT.md` | 1 | Title line |
| `FEATURE_COMPLETION_REPORT.md` | 1 | Header line |
| `PROJECT_COMPLETION_REPORT.md` | 1 | Title line |
| `AI_BI_COPILOT_READINESS_REPORT.md` | 1 | Subject field |
| `COMMENT_REVIEW_REPORT.md` | 1 | Agent module docstring reference |
| `DEPLOYMENT_READINESS.md` | 1 | Directory path in example command |
| `TESTING.md` | 3 | Directory path in clone / cd commands |
| `render.yaml` | 1 | Comment header line only |
| `railway.toml` | 1 | Comment header line only |
| `backend/app/__init__.py` | 1 | Module docstring |
| `backend/memory/__init__.py` | 1 | Module docstring |
| `backend/agents/__init__.py` | 1 | Module comment |
| `frontend/app.py` (Streamlit legacy) | 3 | Legacy frontend — page title and heading |

### C. Environment Variables
| File | Line | Key | Current Default | Notes |
|---|---|---|---|---|
| `.env.example` | 6 | `APP_NAME` | `Universal Data Assistant` | The variable NAME stays; only the default VALUE changes |
| `backend/app/core/config.py` | 76 | `app_name` | `"Universal Data Assistant"` | Pydantic settings default — value only |

### D. API Paths / Functional Identifiers
| File | Line | Value | Risk |
|---|---|---|---|
| `backend/app/core/auth.py` | 31–32 | `_ISSUER = "uda-frontend"`, `_AUDIENCE = "uda-api"` | **HIGH — DO NOT CHANGE** |
| `frontend-next/src/lib/auth.ts` | 61–62 | `.setIssuer("uda-frontend")`, `.setAudience("uda-api")` | **HIGH — DO NOT CHANGE** |
| `render.yaml` | 18, 29 | `name: uda-backend`, `name: uda-storage` | **HIGH — DO NOT CHANGE** |

### E. Internal Identifiers (localStorage keys, package names)
| File | Line | Value | Risk |
|---|---|---|---|
| `frontend-next/src/components/agent/types.ts` | 103 | `SESSION_STORAGE_KEY = "uda-agent-sessions"` | **DO NOT CHANGE** — changing breaks existing stored sessions |
| `frontend-next/src/hooks/use-sidebar.ts` | 5 | `STORAGE_KEY = "uda-sidebar-collapsed"` | **DO NOT CHANGE** — changing resets all user sidebar prefs |
| `frontend-next/src/hooks/use-ask.ts` | 16 | `` `uda-ask-${datasetId}` `` | **DO NOT CHANGE** — changing clears all user ask history |
| `frontend-next/src/components/alerts/AlertHistoryStore.ts` | 23 | `STORAGE_KEY = "uda_alert_history_v1"` | **DO NOT CHANGE** — changing loses alert history |
| `frontend-next/package.json` | 2 | `"name": "universal-data-assistant-web"` | **DO NOT CHANGE** — internal npm package name, not user-facing |

---

## 3. Safe Changes

All of the following can be changed with zero functional risk.

| # | File | What changes |
|---|---|---|
| 1 | `frontend-next/src/app/layout.tsx:29` | `"Universal Data Assistant"` → `"DataPilot AI"` |
| 2 | `frontend-next/src/app/layout.tsx:30` | `"%s — UDA"` → `"%s — DataPilot AI"` |
| 3 | `frontend-next/src/app/auth/signin/page.tsx:15` | Heading text → `"DataPilot AI"` |
| 4 | `frontend-next/src/app/agent/page.tsx:4` | Page title → `"Agent — DataPilot AI"` |
| 5 | `frontend-next/src/components/layout/Sidebar.tsx:192` | `"Data Assistant"` → `"DataPilot AI"` |
| 6 | `frontend-next/src/components/layout/Topbar.tsx:31` | `"Universal Data Assistant"` → `"DataPilot AI"` |
| 7 | `frontend-next/src/components/settings/SettingsWorkspace.tsx:357` | About text → `"DataPilot AI — Agentic Business Intelligence Copilot."` |
| 8 | `frontend-next/src/components/settings/SettingsWorkspace.tsx:361` | `"UDA"` → `"DPA"` |
| 9 | `backend/app/core/config.py:76` | Default value → `"DataPilot AI"` |
| 10 | `backend/app/main.py:241` | API description string → `"AI-powered DataPilot AI API."` |
| 11 | `.env.example:6` | `APP_NAME=Universal Data Assistant` → `APP_NAME=DataPilot AI` |
| 12 | `README.md` | Title, overview, all prose references |
| 13 | `README_DRAFT.md` | All references (or delete file) |
| 14 | `render.yaml:1` | Comment header only |
| 15 | `railway.toml:1` | Comment header only |
| 16 | `backend/app/__init__.py:1` | Module docstring |
| 17 | `backend/memory/__init__.py:1` | Module docstring |
| 18 | `backend/agents/__init__.py:1` | Module comment |
| 19 | `frontend/app.py:543–544` | Legacy Streamlit page title and heading |
| 20 | All `*.md` report files | Title/header lines in documentation files |

---

## 4. Risky Changes — Do With Caution

| Item | Risk | Reason |
|---|---|---|
| `render.yaml` — service names `uda-backend`, `uda-storage` | **Medium** | Changing these renames the live Render service and disk, which will break the current deployment URL and could cause a redeploy cycle. Do this only if you're redeploying fresh. |
| `frontend-next/package.json` — `"name": "universal-data-assistant-web"` | **Low-Medium** | Not user-visible. Could affect lockfile integrity if changed without running `npm install` again. |

---

## 5. Changes That MUST NOT Be Made

| Item | Why |
|---|---|
| `backend/app/core/auth.py` — `_ISSUER = "uda-frontend"`, `_AUDIENCE = "uda-api"` | These are JWT claim values validated on every API request. Changing them invalidates all existing tokens and breaks login until both frontend and backend are redeployed simultaneously. Only change as a coordinated pair with the items below. |
| `frontend-next/src/lib/auth.ts` — `.setIssuer("uda-frontend")`, `.setAudience("uda-api")` | Same reason — must always match the backend exactly. |
| `frontend-next/src/components/agent/types.ts` — `SESSION_STORAGE_KEY = "uda-agent-sessions"` | Changing the localStorage key silently drops all users' stored agent sessions. |
| `frontend-next/src/hooks/use-sidebar.ts` — `STORAGE_KEY = "uda-sidebar-collapsed"` | Changing resets sidebar collapsed state for all users. |
| `frontend-next/src/hooks/use-ask.ts` — `` `uda-ask-${datasetId}` `` | Changing clears all users' ask workspace conversation history. |
| `frontend-next/src/components/alerts/AlertHistoryStore.ts` — `"uda_alert_history_v1"` | Changing loses all stored alert history. |
| API route paths (e.g. `/api/v1/...`) | None of these contain branding — no change needed or applicable. |
| Database table names | Not applicable — no ORM-managed tables in this project. |
| Storage directory names (`uploads/`, `reports/`, etc.) | These are set by `StorageManager` via `settings.*_dir` fields — no branding in them. |

---

## 6. Summary Counts

| Category | Total occurrences | Safe to change | Do not change |
|---|---|---|---|
| User-facing UI | 8 | 8 | 0 |
| Documentation / markdown | 22 | 22 | 0 |
| Backend config / docstrings | 5 | 5 | 0 |
| Internal identifiers (localStorage) | 4 | 0 | 4 |
| JWT claims (auth) | 4 | 0 | 4 |
| Deployment service names | 2 | 0 (risky) | — |
| npm package name | 1 | 0 (risky) | — |
| **Total** | **46** | **35** | **8** |

---

**Awaiting approval to apply safe changes.**
