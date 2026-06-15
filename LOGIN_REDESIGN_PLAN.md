# Login Redesign Plan — DataPilot AI

## Objective

Transform the current single-card signin page into a full-viewport, two-panel
SaaS landing + auth experience. Zero changes to authentication logic.

---

## Layout Architecture

```
┌────────────────────────────────────────┬──────────────────────────┐
│           LEFT PANEL  60%              │     RIGHT PANEL  40%     │
│  (always dark — brand showcase)        │  (follows theme)         │
│                                        │                          │
│  • Logo + wordmark                     │  • Welcome heading       │
│  • Headline + value prop               │  • Glassmorphism card    │
│  • 6 feature cards (2-col grid)        │    - "Sign in with"      │
│  • Animated BI dashboard preview       │    - Google OAuth button │
│                                        │    - Security indicators │
│                                        │  • Footer lock note      │
└────────────────────────────────────────┴──────────────────────────┘
```

Mobile (< lg breakpoint): single column, left panel hidden, right panel
fills the full screen with a compact brand header above the card.

---

## Files Modified / Created

| File | Change |
|------|--------|
| `frontend-next/src/app/auth/signin/page.tsx` | Full rewrite (auth logic preserved) |
| `frontend-next/tailwind.config.ts` | Add `float` keyframe + animation token |
| `frontend-next/src/app/globals.css` | Add `@keyframes float` CSS rule |

No new npm packages required.

---

## Left Panel

### Background
- `bg-gradient-primary` (existing CSS utility) — deep forest green gradient
- Subtle 28px grid texture overlay at 6% opacity for depth
- Two radial glow blobs (absolutely positioned, pointer-events: none)

### Brand section (top)
- Logo image (`/logo.png`) 38×38px, rounded-xl
- "DataPilot AI" 15px semibold white
- "Agentic Business Intelligence Copilot" 11px white/50

### Headline + value prop (middle)
- Playfair Display h1: "Turn data into decisions, *autonomously.*"
  - "autonomously" in `text-emerald-300` for visual accent
- Supporting line: "Insights, forecasts, recommendations, and executive
  reports — driven by multi-agent AI."

### Feature cards (2×3 grid, middle)
Six cards, each:
- `border border-white/8 bg-white/5 backdrop-blur-sm` glassmorphism
- Icon in `bg-emerald-500/20` rounded square
- Label 11.5px white/80
- Hover: `bg-white/10 border-white/14` transition

| Icon | Label |
|------|-------|
| MessageSquare | Natural Language Analytics |
| TrendingUp | Forecasting |
| GitBranch | Root Cause Analysis |
| AlertTriangle | Anomaly Detection |
| FileText | Executive Reporting |
| Network | Multi-Agent Intelligence |

### Dashboard preview (bottom)
Decorative only — no backend calls, no real data.

Sections inside the preview card:
1. **Header row** — "Analytics Overview" + animated emerald live dot
2. **KPI grid** (2×2) — Revenue, Gross Margin, Active Users, Churn Rate
   — each with a value, delta, and directional arrow
3. **Trend sparkline** — SVG cubic-bezier line + area fill gradient
   — hardcoded 12-point revenue series
4. **Executive Summary** — Sparkles icon + 2-line summary text
5. **Recommendations** (2 rows) — CheckCircle2 icon + insight text

**Float animation**: CSS `float` keyframe (translateY 0 → -10px → 0, 5s
ease-in-out infinite) applied as inline style on the wrapper div.
Entrance animation handled separately by Framer Motion (`scaleIn` variant).

---

## Right Panel

### Layout
- `flex items-center justify-center` full height
- `bg-background` (follows theme, works in both light and dark)
- Max-width 340px centered content block

### Mobile brand strip
Rendered only at `< lg`: logo + "DataPilot AI" above the card.

### Welcome copy
- `font-display text-2xl` — "Welcome back"
- `text-sm text-muted-foreground` — "Sign in to access your workspace."

### Auth card
- `.surface-glass.elevation-md.rounded-2xl.p-6`
  (existing CSS utilities — backdrop-blur glassmorphism)
- "Sign in with" divider label
- **Google OAuth button** — `signIn("google", { callbackUrl })`
  exactly preserved, wrapped in `cn()` for cleaner class composition
  — hover glow shimmer overlay via pseudo-positioned span
  — `hover:shadow-glow-sm` (existing token), `active:scale-[0.98]`
- **Security indicators** (3 rows):
  - ✓ Secure OAuth Authentication
  - ✓ Session Encryption
  - ✓ Read-Only Analytics Access
  — ShieldCheck icon in `text-success`

### Footer
- Lock icon + "End-to-end encrypted · No passwords stored"
- `text-[11px] text-muted-foreground`

---

## Animation Strategy

All Framer Motion variants typed as `const x: Variants = {...}` per project
convention. `transition` passed as component prop, not embedded in variants.

| Element | Animation |
|---------|-----------|
| Left panel brand | `fadeIn` 0.5s |
| Headline + value prop | `fadeUp` 0.45s |
| Feature cards | `containerStagger` → each child `fadeUp` 0.35s, stagger 0.07s |
| Dashboard preview | `scaleIn` 0.5s delay 0.3s (entrance) + CSS `float` (continuous) |
| Right panel block | `containerStagger` → heading `fadeUp`, card `scaleIn`, footer `fadeIn` |

---

## Accessibility

- All decorative elements get `aria-hidden="true"`
- Button has visible focus ring via `focus-visible:ring-2 focus-visible:ring-ring`
- SVG sparkline is `aria-hidden`
- Left panel hidden on mobile with `hidden lg:flex` (not `display:none` on
  auth-critical elements — those remain in the right panel)
- Color contrast: white/80 on the gradient passes WCAG AA at 4.5:1

---

## Mobile Behaviour

| Breakpoint | Left panel | Right panel |
|------------|------------|-------------|
| `< lg` | `hidden` | Full width, compact brand header above card |
| `lg+` | `w-[60%]` flex column | `w-[40%]` |

Dashboard preview: hidden on mobile (inside left panel, which is `hidden`).
Feature cards: hidden on mobile (same).
