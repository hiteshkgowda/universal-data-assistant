# Dashboard Sharing — Compatibility Report

## Feature scope
- Share a saved dashboard: generate a public read-only token
- Public link: `GET /api/v1/dashboards/shared/{token}` — no auth required
- Revoke sharing: delete the token

---

## Backend analysis

### `backend/app/schemas/dashboard.py`
**Change:** Add `share_token: Optional[str] = None` to `DashboardConfig`.
Add `ShareDashboardResponse` schema (returns the shareable URL and current token).

**Compatibility:** Fully backward-compatible. New field is optional with default `None`. All
existing JSON files on disk that lack this field will deserialise cleanly via Pydantic's
`Optional` + default. No migration needed.

**No new model is created.** `DashboardConfig` is reused as-is with one extra field.

---

### `backend/app/services/dashboard_store.py`
**Change:** Add three new methods. All existing methods are unchanged.

| New method | Purpose |
|---|---|
| `set_share_token(dashboard_id, owner_sub, token)` | Load → update `share_token` → atomic save |
| `revoke_share_token(dashboard_id, owner_sub)` | Load → clear `share_token` → atomic save |
| `get_by_share_token(token)` | Scan `*.json` files, return match (no owner check — token is proof) |

All reads/writes follow the same `tmp → rename` atomic pattern used in the existing `save()`.
`get_by_share_token` raises `DashboardNotFoundError` when no file contains the token.

---

### `backend/app/api/routes/dashboards.py`
**Change:** Three new routes. All existing routes are unchanged.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/dashboards/{id}/share` | required | Generate `secrets.token_urlsafe(24)`, persist via `set_share_token`, return URL |
| `DELETE` | `/dashboards/{id}/share` | required | Call `revoke_share_token`, return 204 |
| `GET` | `/dashboards/shared/{token}` | **none** | Call `get_by_share_token`, return `DashboardConfig` (public) |

**Route ordering:** `/dashboards/shared/{token}` is a two-segment path. The existing
`GET /dashboards/{dashboard_id}` is a one-segment path. Starlette/FastAPI depth-matches
before pattern-matches, so there is **no conflict**.

**Security:** Public endpoint returns the full `DashboardConfig` including chart specs and KPI
values, but the `owner_sub` field is present as-is (opaque JWT sub, not a username). No
dataset files, raw data, or credentials are exposed — only the pre-computed dashboard.

---

### Files not touched
- `config.py` — no new storage directory required (tokens stored inside existing `*.json` files)
- `storage.py` — unchanged
- `dependencies.py` — no new service needed
- `main.py` — no new router registration (routes added to existing `dashboards` router)

---

## Frontend analysis

### `frontend-next/src/lib/api/types.ts`
- Add `share_token?: string | null` to `DashboardConfig`
- Add `ShareDashboardResponse { share_token: string; share_url: string; dashboard_id: string }`

### `frontend-next/src/lib/api/dashboards.ts`
Three new functions:
- `shareDashboard(id)` → `POST /api/v1/dashboards/{id}/share`
- `revokeDashboardShare(id)` → `DELETE /api/v1/dashboards/{id}/share`
- `getSharedDashboard(token)` → `GET /api/v1/dashboards/shared/{token}` (no auth cookie)

### New files (2)
| File | Purpose |
|---|---|
| `src/components/dashboard/ShareModal.tsx` | Share link panel with copy button and revoke |
| `src/app/dashboards/shared/[token]/page.tsx` | Public read-only dashboard view, no AppShell |

### Modified files (1)
| File | Change |
|---|---|
| `src/components/dashboard/DashboardBuilder.tsx` | Add Share button in toolbar + `ShareModal` |

### No changes to
- `Sidebar.tsx` — no new nav item needed
- `DashboardHub.tsx` — share is a per-dashboard action, not a list action
- `types.ts` dashboard section (beyond additions above)
- Any hooks files — sharing mutations are inlined in `ShareModal` via `useMutation`

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Existing `DashboardConfig` JSON files lack `share_token` | None | Pydantic `Optional` + default `None` |
| Public route exposes owner_sub | Low | JWT sub is opaque; no PII in dashboard config |
| Token brute-force | Low | `secrets.token_urlsafe(24)` = 144 bits entropy |
| Route conflict `/shared/{token}` vs `/{dashboard_id}` | None | Different path depth (2 vs 1 segments) |
| `get_by_share_token` scans all files | Low | Same O(n) scan as `list_for_user`; dashboards are few |

---

## Implementation order
1. `schemas/dashboard.py` — add field + response schema
2. `services/dashboard_store.py` — add 3 methods
3. `api/routes/dashboards.py` — add 3 routes
4. `types.ts` — add field + response type
5. `lib/api/dashboards.ts` — add 3 functions
6. `components/dashboard/ShareModal.tsx` — new component
7. `components/dashboard/DashboardBuilder.tsx` — add Share button
8. `app/dashboards/shared/[token]/page.tsx` — public page
