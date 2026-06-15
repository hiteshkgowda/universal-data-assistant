# Repository Cleanup Report

**Project:** DataPilot AI  
**Date:** 2026-06-16  
**Scope:** All tracked files evaluated for recruiter value, relevance, and correctness

> Nothing has been deleted. This report is a plan only. Apply the REMOVE section with the shell commands in Section 5.

---

## Summary

| Category | Count |
|---|---|
| KEEP | 18 |
| OPTIONAL | 8 |
| REMOVE | 35 |
| ADD TO .gitignore | 5 patterns |
| Runtime data tracked in error | 10 files |

---

## 1. KEEP

These files are valuable to recruiters, engineers, or deployment systems. Do not remove.

| File | Reason |
|---|---|
| `README.md` | Primary project documentation |
| `ARCHITECTURE_OVERVIEW.md` | Recruiter-facing system design doc with stack, decisions, and trade-offs |
| `INTERVIEW_GUIDE.md` | 9-section Q&A covering design decisions end-to-end — high signal for interviews |
| `TESTING.md` | Documents test strategy, coverage approach, and how to run tests |
| `PROJECT_EVOLUTION.md` | Shows how the project grew phase by phase — demonstrates engineering judgement |
| `FEATURES_ROADMAP.md` | Shows what's done vs. planned — useful context for interviewers |
| `DEPLOYMENT_READINESS.md` | Practical deployment notes for Render/Railway — useful reference |
| `.env.example` | Required for any new contributor or reviewer to set up the project |
| `.gitignore` | Essential |
| `Procfile` | Required for Heroku/Render process definition |
| `render.yaml` | Deployment manifest |
| `railway.toml` | Deployment manifest |
| `vercel.json` | Frontend deployment config |
| `requirements.txt` | Python dependencies |
| `requirements-dev.txt` | Dev/test dependencies |
| `frontend-next/public/logo.png` | Application logo asset |
| `tests/` (all test files) | 17 root-level test files showing coverage depth |
| `backend/tests/` (all test files) | 15 backend test files — demonstrates quality engineering |

---

## 2. OPTIONAL

Keep if you want to demonstrate depth. Remove to reduce noise. These are legitimate docs but not essential for first-pass recruiter review.

| File | Lines | Keep if… |
|---|---|---|
| `ARCHITECTURE.md` | 197 | This is an older architecture sketch. Overlaps with `ARCHITECTURE_OVERVIEW.md`. Keep only if content is distinct. |
| `PROJECT_CONTEXT.md` | 113 | Brief project brief. Redundant with README overview section. |
| `AUTONOMOUS_ANALYSIS_ARCHITECTURE.md` | 805 | Deep dive into one feature's architecture. Good signal for senior roles. |
| `DASHBOARD_ARCHITECTURE.md` | 794 | Same — feature-level design doc. |
| `DATA_QUALITY_ARCHITECTURE.md` | 1108 | Same — very detailed. Impressive but adds repo noise. |
| `KPI_MONITOR_ARCHITECTURE.md` | 1281 | Same — the longest doc in the repo. |
| `COPILOT_WORKSPACE_ARCHITECTURE.md` | 349 | Same — feature-level design. |
| `DEPENDENCY_AUDIT.md` | 198 | Documents external library choices and reasons. Useful, but not essential. |

**Recommendation:** Move architecture deep-dives into a `docs/architecture/` subdirectory rather than keeping 5 large files in the root.

---

## 3. REMOVE

### 3a. One-time AI-generated audit reports (no ongoing value)

These were generated as single-use analysis snapshots. They convey no signal to a recruiter and clutter the root.

| File | Lines | Why remove |
|---|---|---|
| `AI_BI_COPILOT_READINESS_REPORT.md` | 623 | One-time readiness self-review |
| `AI_CODE_AUDIT.md` | 339 | One-time automated code audit |
| `SYSTEM_AUDIT.md` | 566 | One-time system health snapshot |
| `COMMENT_REVIEW_REPORT.md` | 174 | One-time comment style review |
| `NAMING_REVIEW_REPORT.md` | 245 | One-time naming convention review |
| `DOCUMENTATION_REVIEW_REPORT.md` | 183 | One-time docs quality review |
| `RATE_LIMITING_REPORT.md` | 214 | One-time implementation summary |

### 3b. Operational task logs (internal process artifacts)

Generated during development workflow. Not useful to anyone reading the repo cold.

| File | Lines | Why remove |
|---|---|---|
| `REBRANDING_IMPACT_REPORT.md` | 153 | Pre-task analysis doc for rebranding |
| `REBRANDING_COMPLETION_REPORT.md` | 88 | Post-task summary for rebranding |
| `LOGO_INTEGRATION_REPORT.md` | 82 | Post-task summary for logo swap |
| `FEATURE_COMPLETION_REPORT.md` | 576 | Phase-by-phase completion checklist |
| `PROJECT_COMPLETION_REPORT.md` | 305 | Completion summary |

### 3c. Compatibility check files (one-time implementation scaffolding)

These were generated to verify feature integration during development. Zero value to a repo visitor.

| File | Lines |
|---|---|
| `AGENT_TRACE_COMPATIBILITY.md` | 100 |
| `ALERT_CENTER_COMPATIBILITY.md` | 105 |
| `DASHBOARD_SHARING_COMPATIBILITY.md` | 116 |
| `DASHBOARD_TEMPLATE_COMPATIBILITY.md` | 138 |
| `DATA_CATALOG_COMPATIBILITY.md` | 242 |
| `EXECUTIVE_BRIEFING_COMPATIBILITY.md` | 119 |
| `EXPLAINABILITY_COMPATIBILITY.md` | 151 |
| `QUERY_HISTORY_COMPATIBILITY.md` | 198 |
| `SAVED_QUERY_COMPATIBILITY.md` | 177 |
| `SCHEDULED_REPORTS_COMPATIBILITY.md` | 172 |

### 3d. Draft and AI-context files

| File | Lines | Why remove |
|---|---|---|
| `README_DRAFT.md` | 827 | Older draft — superseded by `README.md` |
| `CLAUDE_CONTEXT.md` | 11 | AI assistant prompt context — meaningless to humans |

### 3e. Runtime user data committed by mistake

These files slipped through despite `.gitignore` rules (tracked before the rules were added). They should be untracked and removed from git history.

| File | Why remove |
|---|---|
| `uploads/f35f18426ed04008b388aa35a9d001b0.csv` | User-uploaded dataset — runtime data |
| `uploads/f35f18426ed04008b388aa35a9d001b0.json` | Dataset metadata — runtime data |
| `uploads/fb584266d7784e88bfa2386632e1f116.csv` | User-uploaded dataset — runtime data |
| `uploads/fb584266d7784e88bfa2386632e1f116.json` | Dataset metadata — runtime data |
| `reports/061caf54f42c4cd3a3e01d945be33c1e.json` | Generated report data — runtime data |
| `reports/061caf54f42c4cd3a3e01d945be33c1e.pdf` | Generated report PDF — runtime data |
| `reports/263cb20552fd44b48ccfc7cadab3c753.json` | Generated report data — runtime data |
| `reports/263cb20552fd44b48ccfc7cadab3c753.pdf` | Generated report PDF — runtime data |
| `backend/dashboards/59c23be3d99d1f6bab6b7f5354a33f41.json` | Saved dashboard — user data |
| `backend/memory_store/conversations.db` | Conversation history DB — user data |

---

## 4. ADD TO .gitignore

The current `.gitignore` has gaps. These patterns are missing:

```gitignore
# --- Build artifacts ---
frontend-next/tsconfig.tsbuildinfo

# --- Runtime storage not yet covered ---
backend/dashboards/*
!backend/dashboards/.gitkeep
backend/memory_store/*
!backend/memory_store/.gitkeep
backend/roles/*
!backend/roles/.gitkeep

# --- SQLite databases ---
*.db
*.sqlite
*.sqlite3
```

**Why `tsconfig.tsbuildinfo`?** It's a TypeScript incremental build cache. Machine-generated, changes on every build, adds noise to diffs, and is already in many standard `.gitignore` templates. Currently tracked in git (line: `frontend-next/tsconfig.tsbuildinfo`).

**Why `backend/dashboards/*`?** A saved dashboard JSON (`59c23be3d99d1f6bab6b7f5354a33f41.json`) is currently tracked. This is live user data.

**Why `backend/memory_store/*`?** `conversations.db` is currently tracked. This is a live SQLite database containing user conversation history.

**Why `*.db`?** Catches any SQLite file anywhere in the tree — `agent_sessions/sessions.db`, `backend/agent_sessions/sessions.db`, etc.

---

## 5. Apply Commands (when ready)

Run these from the repo root. They remove files from git tracking without deleting them from disk.

```bash
# Untrack runtime data files
git rm --cached \
  "uploads/f35f18426ed04008b388aa35a9d001b0.csv" \
  "uploads/f35f18426ed04008b388aa35a9d001b0.json" \
  "uploads/fb584266d7784e88bfa2386632e1f116.csv" \
  "uploads/fb584266d7784e88bfa2386632e1f116.json" \
  "reports/061caf54f42c4cd3a3e01d945be33c1e.json" \
  "reports/061caf54f42c4cd3a3e01d945be33c1e.pdf" \
  "reports/263cb20552fd44b48ccfc7cadab3c753.json" \
  "reports/263cb20552fd44b48ccfc7cadab3c753.pdf" \
  "backend/dashboards/59c23be3d99d1f6bab6b7f5354a33f41.json" \
  "backend/memory_store/conversations.db" \
  "frontend-next/tsconfig.tsbuildinfo"

# Remove documentation clutter files from git
git rm --cached \
  AI_BI_COPILOT_READINESS_REPORT.md \
  AI_CODE_AUDIT.md \
  SYSTEM_AUDIT.md \
  COMMENT_REVIEW_REPORT.md \
  NAMING_REVIEW_REPORT.md \
  DOCUMENTATION_REVIEW_REPORT.md \
  RATE_LIMITING_REPORT.md \
  REBRANDING_IMPACT_REPORT.md \
  REBRANDING_COMPLETION_REPORT.md \
  LOGO_INTEGRATION_REPORT.md \
  FEATURE_COMPLETION_REPORT.md \
  PROJECT_COMPLETION_REPORT.md \
  AGENT_TRACE_COMPATIBILITY.md \
  ALERT_CENTER_COMPATIBILITY.md \
  DASHBOARD_SHARING_COMPATIBILITY.md \
  DASHBOARD_TEMPLATE_COMPATIBILITY.md \
  DATA_CATALOG_COMPATIBILITY.md \
  EXECUTIVE_BRIEFING_COMPATIBILITY.md \
  EXPLAINABILITY_COMPATIBILITY.md \
  QUERY_HISTORY_COMPATIBILITY.md \
  SAVED_QUERY_COMPATIBILITY.md \
  SCHEDULED_REPORTS_COMPATIBILITY.md \
  README_DRAFT.md \
  CLAUDE_CONTEXT.md
```

After running the above, update `.gitignore` with the patterns in Section 4, then commit:

```bash
git add .gitignore
git commit -m "Clean up repo: remove audit reports, runtime data, and build artifacts from tracking"
git push
```

---

## 6. Before / After Root Directory

**Before (41 markdown files in root):**
```
AGENT_TRACE_COMPATIBILITY.md       QUERY_HISTORY_COMPATIBILITY.md
AI_BI_COPILOT_READINESS_REPORT.md  RATE_LIMITING_REPORT.md
AI_CODE_AUDIT.md                   README.md
ALERT_CENTER_COMPATIBILITY.md      README_DRAFT.md
ARCHITECTURE.md                    REBRANDING_COMPLETION_REPORT.md
ARCHITECTURE_OVERVIEW.md           REBRANDING_IMPACT_REPORT.md
AUTONOMOUS_ANALYSIS_ARCHITECTURE.md REPO_CLEANUP_REPORT.md
CLAUDE_CONTEXT.md                  SAVED_QUERY_COMPATIBILITY.md
COMMENT_REVIEW_REPORT.md           SCHEDULED_REPORTS_COMPATIBILITY.md
COPILOT_WORKSPACE_ARCHITECTURE.md  SYSTEM_AUDIT.md
DASHBOARD_ARCHITECTURE.md          TESTING.md
DASHBOARD_SHARING_COMPATIBILITY.md
DASHBOARD_TEMPLATE_COMPATIBILITY.md
DATA_CATALOG_COMPATIBILITY.md
DATA_QUALITY_ARCHITECTURE.md
DEPENDENCY_AUDIT.md
DEPLOYMENT_READINESS.md
DOCUMENTATION_REVIEW_REPORT.md
EXECUTIVE_BRIEFING_COMPATIBILITY.md
EXPLAINABILITY_COMPATIBILITY.md
FEATURES_ROADMAP.md
FEATURE_COMPLETION_REPORT.md
INTERVIEW_GUIDE.md
KPI_MONITOR_ARCHITECTURE.md
LOGO_INTEGRATION_REPORT.md
NAMING_REVIEW_REPORT.md
PROJECT_COMPLETION_REPORT.md
PROJECT_CONTEXT.md
PROJECT_EVOLUTION.md
```

**After applying REMOVE (9 meaningful markdown files in root):**
```
ARCHITECTURE_OVERVIEW.md
DEPLOYMENT_READINESS.md
FEATURES_ROADMAP.md
INTERVIEW_GUIDE.md
PROJECT_EVOLUTION.md
README.md
TESTING.md
```
*(Plus optional architecture deep-dives if kept or moved to `docs/`)*
