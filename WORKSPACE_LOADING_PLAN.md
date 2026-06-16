# Workspace Loading Screen Plan — DataPilot AI

## Objective

Display a branded 2-second loading screen after successful Google OAuth before
the user enters the application. No changes to auth logic, session handling,
OAuth callbacks, or protected route middleware.

---

## Redirect Flow

```
User clicks "Continue with Google"
        │
        ▼
Google OAuth (external)
        │
        ▼
NextAuth /api/auth/callback/google  ←── unchanged
        │
        ▼ (redirects to callbackUrl)
/loading-workspace?to=<encoded_destination>   ◄── new
        │  (2.2s branded loading animation)
        ▼
router.replace(destination)   ←── arrives at intended page
```

The only change to signin/page.tsx: `callbackUrl` passed to `signIn()` becomes
`/loading-workspace?to=${encodeURIComponent(callbackUrl)}` — a URL change, not
an auth logic change. NextAuth handles the OAuth exactly as before.

---

## Route Protection

`/loading-workspace` is reached AFTER the user has successfully signed in, so
their NextAuth session is valid. The existing middleware (`proxy.ts`) will allow
authenticated requests through. No whitelist change needed.

---

## Files

| File | Type | Description |
|------|------|-------------|
| `frontend-next/src/components/branding/WorkspaceLoader.tsx` | New | Reusable loader UI |
| `frontend-next/src/app/loading-workspace/page.tsx` | New | Route page, reads `?to=` and redirects |

---

## Visual Design

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                         [LOGO 64px]                        │
│                                                            │
│                       DataPilot AI                         │
│               Agentic Business Intelligence Copilot        │
│                                                            │
│              ─────────────────────────────────             │
│                                                            │
│              ✓  Authenticating session         (t=400ms)  │
│              ✓  Loading workspace              (t=850ms)  │
│              ◎  Initializing AI agents         (t=1300ms) │
│              ○  Preparing analytics environment (t=1750ms)│
│                                                            │
│              ─────────────────────────────────             │
│                                                            │
│              [progress bar — fills over 2.2s]             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Animation Sequence

| Step | Trigger | Duration |
|------|---------|----------|
| Page fade-in | Mount | 0.4s |
| Logo scale-in | Mount | 0.5s, spring |
| Brand text fade-up | Mount | 0.4s, delay 0.1s |
| Step 1 complete | setTimeout 400ms | 0.3s, spring bounce |
| Step 2 complete | setTimeout 850ms | 0.3s, spring bounce |
| Step 3 complete | setTimeout 1300ms | 0.3s, spring bounce |
| Step 4 complete | setTimeout 1750ms | 0.3s, spring bounce |
| Redirect | setTimeout 2200ms | `router.replace()` |
| Progress bar fill | CSS transition 2.2s | linear |

---

## Step States

Each step has three visual states:

| State | Icon | Text color |
|-------|------|-----------|
| Pending | `○` (Circle outline) | `text-muted-foreground/40` |
| Active (current) | `◎` (pulsing ring) | `text-muted-foreground/70` |
| Complete | `✓` (CheckCircle2, spring-in) | `text-foreground` |

---

## No-JS / Error Handling

The page is client-side rendered. If JS is disabled the user stays on the
loading page indefinitely — acceptable since the whole app requires JS.

The `destination` param is validated: if missing or not starting with `/`,
defaults to `/`. External URLs are rejected.

---

## Accessibility

- Page has `role="status"` and `aria-live="polite"` on the step list
- `aria-label="Loading workspace"` on the container
- Steps announced sequentially as they complete
- Reduced motion: progress animation still plays (not vestibular-triggering),
  only scale animations are bypassed via `prefers-reduced-motion` media query
