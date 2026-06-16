# Startup Experience Plan — DataPilot AI Mission Control

## Objective

Replace the generic 4-step loading card with a full-screen "Mission Control"
startup sequence that communicates the platform's sophistication before the
user enters the dashboard.

---

## File Scope

| File | Change |
|------|--------|
| `frontend-next/src/components/branding/WorkspaceLoader.tsx` | **Full rewrite** |
| `frontend-next/src/app/globals.css` | Add 3 new keyframes |
| `frontend-next/tailwind.config.ts` | Register new animation tokens |
| `frontend-next/src/app/loading-workspace/page.tsx` | **No changes** |
| Auth flow, routing, OAuth | **Untouched** |

---

## Layout — Desktop

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Background: #0f1e16, animated grid, drifting glow blob, particles]│
│                                                                     │
│              [Logo 56px] DataPilot AI                               │
│              Agentic Business Intelligence Copilot                  │
│              ● ONLINE                                               │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ STARTUP SEQUENCE │  │  SYSTEM STATUS   │  │  AGENT NETWORK   │  │
│  │ ✓ Workspace auth │  │ Analytics Engine │  │  ◉ Dataset       │  │
│  │ ✓ Profile loaded │  │   ● ONLINE       │  │     │            │  │
│  │ ✓ Analytics...   │  │ Forecast Engine  │  │  ◉ Query Planner │  │
│  │ ◎ Forecasting... │  │   ● ONLINE       │  │     │            │  │
│  │ ○ Insight...     │  │ Insight Engine   │  │  ○ Insight Agent │  │
│  │ ○ Root cause...  │  │   ◎ STARTING     │  │     │            │  │
│  │ ○ Recommend...   │  │ Agent Graph      │  │  ○ Root Cause    │  │
│  │ ○ Exec report... │  │   ○ OFFLINE      │  │     │            │  │
│  │ ○ Orchestration  │  │ Report Generator │  │  ○ Recommend     │  │
│  │                  │  │   ○ OFFLINE      │  │     │            │  │
│  │                  │  │ KPI Monitor      │  │  ○ Exec Briefing │  │
│  │                  │  │   ○ OFFLINE      │  │                  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  12,482 Insights  ·  3,917 Forecasts  ·  5,201 Reports  ·  │   │
│  │  87,442 Queries Executed                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [████████████████░░░░░░░░░]  progress bar                         │
│                                                                     │
│  ── Final state: "Workspace Ready" fades in, then overlay→redirect─ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layout — Mobile

Single column, agent network hidden:

```
[Logo + brand + ONLINE]
[Startup sequence]
[System status — 2×3 grid]
[Metrics — 2×2 grid]
[Progress bar]
```

---

## Background System

| Layer | Implementation |
|-------|---------------|
| Base color | `#0f1e16` (hard-coded dark green, not theme-dependent) |
| Grid texture | CSS `background-image` lines, 28px grid, 4% opacity |
| Drifting glow blob | Radial gradient `div`, `blob-drift` keyframe (18s ease-in-out) |
| Corner glow accents | 2 additional fixed radial blobs, low opacity |
| Particles | 12 hardcoded positions, `particle-float` keyframe (upward fade) |

---

## Startup Sequence (9 steps)

| # | Label | Complete at |
|---|-------|------------|
| 1 | Workspace authenticated | 250ms |
| 2 | User profile loaded | 460ms |
| 3 | Analytics engine online | 640ms |
| 4 | Forecasting engine online | 820ms |
| 5 | Insight generation ready | 980ms |
| 6 | Root cause analysis ready | 1130ms |
| 7 | Recommendation engine ready | 1270ms |
| 8 | Executive reporting ready | 1400ms |
| 9 | Agent orchestration online | 1520ms |

Step icon states:
- **Pending**: `○` circle outline, white/25
- **Active**: `◎` pulsing ring (`animate-ping` inner ring), white/60
- **Complete**: `✓` CheckCircle2, spring bounce-in (stiffness 400, damping 18), emerald-400

---

## System Status Cards (6 cards)

Each card: icon + label + status badge.

Status transitions from `● STARTING` → `● ONLINE` at the corresponding step.

| Card | Goes ONLINE at step | ms |
|------|--------------------|----|
| Analytics Engine | 3 | 640ms |
| Forecast Engine | 4 | 820ms |
| Insight Engine | 5 | 980ms |
| Agent Graph | 6 | 1130ms |
| Report Generator | 7 | 1270ms |
| KPI Monitor | 8 | 1400ms |

Card hover: `y: -2`, border-color and box-shadow glow intensify.
Card ONLINE transition: Framer Motion `animate` prop interpolates border, bg, shadow (0.4s).

---

## Agent Network Visualization

6 nodes with vertical connectors. Each node lights up emerald when activated.

| Node | Activates at step |
|------|------------------|
| Dataset | 0 (always active) |
| Query Planner | 3 |
| Insight Agent | 5 |
| Root Cause Agent | 6 |
| Recommendation Agent | 7 |
| Executive Briefing | 9 |

Connectors: 1px wide `div`, `flow-dot-v` keyframe animates a 30% height emerald
bar traveling top→bottom, 1.2s linear infinite, per-connector staggered delay.

---

## Dynamic Metrics

| Metric | Target | Start at | Duration |
|--------|--------|----------|----------|
| Insights Generated | 12,482 | 300ms | 1400ms |
| Forecasts Produced | 3,917 | 450ms | 1300ms |
| Reports Created | 5,201 | 600ms | 1200ms |
| Queries Executed | 87,442 | 200ms | 1500ms |

Count-up uses `requestAnimationFrame` with cubic ease-out. No external library.
Numbers formatted with `toLocaleString("en-US")` (comma separators).

---

## Final Transition Sequence

```
t=0ms          Mount
t=1520ms       Step 9 completes
t=1620ms       isReady = true
t=1620ms       Startup content: opacity→0, scale→0.97, blur→4px (250ms)
t=1820ms       "Workspace Ready" enters: scale 0.97→1, opacity 0→1 (300ms)
t=2320ms       isExiting = true — overlay div fades in (300ms)
t=2620ms       onAnimationComplete → router.replace(destination)
```

Total: ~2.6 seconds.

"Workspace Ready" screen shows:
- Large `CheckCircle2` icon, spring-in
- "Workspace Ready" in Playfair Display, 2xl
- Subtle "Redirecting to your workspace…" subtext
- Emerald glow ring behind the checkmark

---

## New CSS Keyframes

```css
@keyframes particle-float  { 0% → Y:0 opacity:0.5  →  100% Y:-100px opacity:0 }
@keyframes blob-drift      { 0%/100%→(0,0) 25%→(30,-20px) 50%→(-10,30px) 75%→(-30,-10px) }
@keyframes flow-dot-v      { 0%→top:0 opacity:0  8%→opacity:1  88%→opacity:1  100%→top:120% opacity:0 }
```

---

## Animations Summary

| Animation | Library | Duration | Trigger |
|-----------|---------|----------|---------|
| Page fade-in | FM | 0.4s | Mount |
| Logo spring-in | FM | spring | Mount |
| Brand text fade-up | FM | 0.4s | 0.1s delay |
| Section stagger | FM | 0.35s each, 0.06s stagger | 0.15s delay |
| Step complete (checkmark) | FM | spring stiffness:400 | Per step timeout |
| Active step pulse | CSS animate-ping | ∞ | State === active |
| Card ONLINE transition | FM animate | 0.4s | Step threshold |
| Card hover lift | FM whileHover | 0.15s | User |
| Agent node activate | FM animate | 0.4s | Step threshold |
| Connector flow dot | CSS flow-dot-v | 1.2s ∞ | Node active |
| Metrics count-up | rAF + state | 1200–1500ms | startAt timeout |
| Progress bar | CSS scaleX | 2.6s linear | Mount (rAF) |
| Glow blob drift | CSS blob-drift | 18s ∞ | Mount |
| Particles | CSS particle-float | 9–15s ∞ | Mount |
| Startup exit | FM animate | 0.25s | isReady |
| Workspace Ready enter | FM | 0.3s | isReady |
| Final overlay | FM | 0.3s | isExiting |

---

## Accessibility

- Entire loader: `role="status"` `aria-label="DataPilot AI workspace loading"`
- Step list: `aria-live="polite"` — announces each completion
- All decorative elements: `aria-hidden="true"`
- Focus: no interactive elements, nothing to tab to
- `prefers-reduced-motion`: particle-float, blob-drift, flow-dot-v stop;
  Framer Motion respects system preference in v12 for enter/exit animations

---

## Performance

- No new npm packages
- Particles: 12 CSS-only `div` elements, GPU composited transforms
- Count-up: single `rAF` loop per counter (4 total), cancelled on unmount
- All timers cleared on unmount via `timersRef`
- Framer Motion already in bundle
