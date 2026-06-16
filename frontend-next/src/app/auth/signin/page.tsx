"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import {
  MessageSquare,
  TrendingUp,
  GitBranch,
  AlertTriangle,
  FileText,
  Network,
  ShieldCheck,
  Lock,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  Database,
  Search,
  Lightbulb,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Framer Motion variants ────────────────────────────────────────────────

const containerStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
};

// ── Feature cards ─────────────────────────────────────────────────────────

const features = [
  { icon: MessageSquare, label: "Natural Language Analytics" },
  { icon: TrendingUp,    label: "Forecasting" },
  { icon: GitBranch,     label: "Root Cause Analysis" },
  { icon: AlertTriangle, label: "Anomaly Detection" },
  { icon: FileText,      label: "Executive Reporting" },
  { icon: Network,       label: "Multi-Agent Intelligence" },
] as const;

// ── KPI ticker data ───────────────────────────────────────────────────────

const tickerItems = [
  { label: "Revenue Growth",     value: "+14.3%" },
  { label: "Forecast Accuracy",  value: "92%" },
  { label: "Insights Generated", value: "127" },
  { label: "Anomalies Detected", value: "12" },
  { label: "Recommendations",    value: "84" },
  { label: "Time to Insight",    value: "3.2s" },
  { label: "Report Generation",  value: "< 8s" },
] as const;

// ── Agent pipeline nodes ──────────────────────────────────────────────────

const agentNodes = [
  { icon: Database,   label: "Dataset" },
  { icon: Search,     label: "Query" },
  { icon: Lightbulb,  label: "Insight" },
  { icon: GitBranch,  label: "RCA" },
  { icon: Zap,        label: "Actions" },
] as const;

// ── Dashboard data ────────────────────────────────────────────────────────

const kpis = [
  { label: "Revenue",      value: "$4.2M",  delta: "+14.3%", up: true  },
  { label: "Gross Margin", value: "68.4%",  delta: "+2.1pp", up: true  },
  { label: "Active Users", value: "24,819", delta: "+9.7%",  up: true  },
  { label: "Churn Rate",   value: "1.8%",   delta: "−0.3pp", up: true  },
] as const;

const summaryText =
  "Q3 exceeded projections. Revenue +14.3% YoY driven by enterprise expansion and improved retention.";

const recommendations = [
  "Upsell cohort in Q3 shows 3.2× LTV potential",
  "APAC expansion ROI projected at 41% over 18 months",
] as const;

// ── Trend sparkline ───────────────────────────────────────────────────────

function TrendSparkline() {
  const pts = [22, 32, 26, 46, 38, 55, 48, 65, 58, 72, 66, 88];
  const W = 320;
  const H = 72;
  const pad = 6;
  const xStep = (W - pad * 2) / (pts.length - 1);
  const coords = pts.map((v, i) => ({
    x: pad + i * xStep,
    y: H - pad - (v / 100) * (H - pad * 2),
  }));

  const linePath = coords.reduce((acc, { x, y }, i) => {
    if (i === 0) return `M ${x} ${y}`;
    const prev = coords[i - 1];
    const cx = (prev.x + x) / 2;
    return `${acc} C ${cx} ${prev.y} ${cx} ${y} ${x} ${y}`;
  }, "");

  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L ${last.x} ${H} L ${coords[0].x} ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: H }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgb(52,211,153)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-grad)" />
      <path
        d={linePath}
        fill="none"
        stroke="rgb(52,211,153)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Terminal dot with ring */}
      <circle cx={last.x} cy={last.y} r="4"   fill="rgb(52,211,153)" />
      <circle cx={last.x} cy={last.y} r="7.5" fill="none" stroke="rgb(52,211,153)" strokeOpacity="0.28" strokeWidth="1.5" />
    </svg>
  );
}

// ── KPI Ticker ────────────────────────────────────────────────────────────

function KpiTicker() {
  const doubled = [...tickerItems, ...tickerItems];

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/8 bg-white/[0.04] py-0"
      aria-hidden="true"
    >
      {/* Left/right fade masks */}
      <div
        className="pointer-events-none absolute left-0 inset-y-0 w-10 z-10"
        style={{ background: "linear-gradient(90deg, hsl(149 56% 15% / 0.9) 0%, transparent 100%)" }}
      />
      <div
        className="pointer-events-none absolute right-0 inset-y-0 w-10 z-10"
        style={{ background: "linear-gradient(270deg, hsl(149 56% 15% / 0.9) 0%, transparent 100%)" }}
      />

      {/* Scrolling track */}
      <div className="flex w-max animate-marquee">
        {doubled.map(({ label, value }, i) => (
          <span key={i} className="flex items-center gap-2 px-5 py-2.5 shrink-0">
            <span className="text-[10px] font-medium text-white/42 tracking-wide">{label}</span>
            <span className="text-[11px] font-semibold text-emerald-400">{value}</span>
            <span className="text-white/18 text-xs select-none">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Agent pipeline ────────────────────────────────────────────────────────

function AgentPipeline() {
  return (
    <div aria-hidden="true">
      <p className="text-[9.5px] font-semibold text-muted-foreground/55 text-center uppercase tracking-[0.12em] mb-3.5">
        Multi-Agent Processing Pipeline
      </p>

      <div className="flex items-center justify-between">
        {agentNodes.map(({ icon: Icon, label }, i) => (
          <div key={label} className="flex items-center flex-1">
            {/* Node */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50 transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5">
                <Icon className="h-3.5 w-3.5 text-primary/65" />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground/65">{label}</span>
            </div>

            {/* Connector with flowing dot — hidden after last node */}
            {i < agentNodes.length - 1 && (
              <div className="relative mx-1 h-px flex-1 bg-border/60 overflow-visible">
                <span
                  className="absolute top-1/2 -translate-y-1/2 h-[5px] w-[5px] rounded-full bg-primary/70"
                  style={{
                    animation: "flow-dot 2.4s linear infinite",
                    animationDelay: `${i * 0.48}s`,
                    left: 0,
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard preview ─────────────────────────────────────────────────────

function DashboardPreview() {
  return (
    <div className="animate-float w-full" aria-hidden="true">
      {/* Card with premium layered shadow + inner glow */}
      <div
        className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md overflow-hidden"
        style={{
          boxShadow: [
            "0 24px 64px rgba(0,0,0,0.55)",
            "0 4px 16px rgba(0,0,0,0.35)",
            "0 0 0 1px rgba(52,211,153,0.07)",
            "inset 0 1px 0 rgba(255,255,255,0.07)",
          ].join(", "),
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-white/[0.025]">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] font-medium text-white/65">Analytics Overview</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              style={{
                boxShadow: "0 0 6px rgba(52,211,153,0.9)",
                animation: "pulse-status 2.5s ease-in-out infinite",
              }}
            />
            <span className="text-[10px] text-emerald-400/85 font-semibold">Live</span>
          </div>
        </div>

        {/* KPI row — 4 columns */}
        <div className="grid grid-cols-4 gap-px bg-white/[0.045] mx-3 mt-3 rounded-xl overflow-hidden">
          {kpis.map(({ label, value, delta, up }) => (
            <div key={label} className="bg-black/25 px-3 py-3">
              <p className="text-[8.5px] font-semibold text-white/35 uppercase tracking-wider mb-2">
                {label}
              </p>
              <p className="text-[15px] font-bold text-white leading-none">{value}</p>
              <p
                className={cn(
                  "flex items-center gap-0.5 text-[10px] font-semibold mt-1.5",
                  up ? "text-emerald-400" : "text-red-400"
                )}
              >
                <ArrowUpRight
                  className={cn("h-2.5 w-2.5 shrink-0", !up && "rotate-90")}
                />
                {delta}
              </p>
            </div>
          ))}
        </div>

        {/* Trend chart */}
        <div className="mx-3 mt-2.5 rounded-xl bg-black/25 px-3 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-medium text-white/38">Revenue · Last 12 weeks</p>
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] font-bold text-emerald-400">↑ 14.3%</span>
              <Badge
                variant="success"
                className="text-[8.5px] py-0 px-1.5 border-0 bg-emerald-500/12 text-emerald-400 h-auto"
              >
                Trending
              </Badge>
            </div>
          </div>
          <TrendSparkline />
        </div>

        {/* Summary + Recommendations side-by-side */}
        <div className="grid grid-cols-2 gap-2 mx-3 mb-3 mt-2.5">
          {/* AI Summary */}
          <div className="rounded-xl bg-black/25 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="text-[8.5px] font-bold text-white/42 uppercase tracking-wider">
                AI Summary
              </span>
            </div>
            <p className="text-[9.5px] text-white/55 leading-[1.55]">{summaryText}</p>
          </div>

          {/* Recommendations */}
          <div className="rounded-xl bg-black/25 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="text-[8.5px] font-bold text-white/42 uppercase tracking-wider">
                Recommended
              </span>
            </div>
            <div className="space-y-1.5">
              {recommendations.map((text) => (
                <div key={text} className="flex items-start gap-1.5">
                  <span className="mt-[5px] h-1 w-1 rounded-full bg-emerald-400/60 shrink-0" />
                  <p className="text-[9px] text-white/55 leading-tight">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Left panel ────────────────────────────────────────────────────────────

function LeftPanel() {
  return (
    <div className="relative hidden lg:flex lg:w-[60%] flex-col justify-between overflow-hidden bg-gradient-primary min-h-screen px-10 py-10 xl:px-12 xl:py-11">

      {/* Grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden="true"
      />

      {/* Glow blob — top-left primary */}
      <div
        className="pointer-events-none absolute -top-52 -left-28 h-[620px] w-[620px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(52,211,153,0.38) 0%, transparent 62%)",
          animation: "glow-breathe 7s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
      {/* Glow blob — bottom-right secondary */}
      <div
        className="pointer-events-none absolute -bottom-10 -right-16 h-72 w-72 rounded-full opacity-18"
        style={{ background: "radial-gradient(circle, rgba(74,222,128,0.65) 0%, transparent 65%)" }}
        aria-hidden="true"
      />
      {/* Glow blob — center-right tertiary accent */}
      <div
        className="pointer-events-none absolute top-1/2 -right-8 h-52 w-52 -translate-y-1/2 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, rgba(52,211,153,0.9) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      {/* ── Brand ── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        transition={{ duration: 0.6 }}
        className="relative flex items-center gap-3"
      >
        <Image
          src="/logo.png"
          alt="DataPilot AI logo"
          width={36}
          height={36}
          className="rounded-xl shrink-0"
          priority
        />
        <div>
          <p className="text-[15px] font-semibold text-white leading-none tracking-tight">
            DataPilot AI
          </p>
          <p className="text-[10.5px] text-white/52 mt-0.5">
            Agentic Business Intelligence Copilot
          </p>
        </div>
      </motion.div>

      {/* ── Headline + feature grid + ticker ── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerStagger}
        className="relative space-y-5"
      >
        {/* Headline */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.45 }}
          className="space-y-2.5"
        >
          <h1 className="font-display text-[2rem] xl:text-[2.2rem] font-semibold text-white leading-[1.2] max-w-sm">
            Turn data into decisions,{" "}
            <span className="text-emerald-300">autonomously.</span>
          </h1>
          <p className="text-[13px] text-white/60 max-w-xs leading-relaxed">
            Insights, forecasts, recommendations, and executive reports —
            driven by multi-agent AI.
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          variants={containerStagger}
          className="grid grid-cols-2 gap-2"
        >
          {features.map(({ icon: Icon, label }) => (
            <motion.div
              key={label}
              variants={fadeUp}
              transition={{ duration: 0.3 }}
              whileHover={{ y: -2 }}
              className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm cursor-default transition-colors duration-200 hover:bg-white/10 hover:border-white/14 hover:shadow-lg"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 transition-colors duration-200 group-hover:bg-emerald-500/32">
                <Icon className="h-3 w-3 text-emerald-300" />
              </span>
              <span className="text-[11.5px] font-medium text-white/75 leading-tight transition-colors duration-200 group-hover:text-white/92">
                {label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* KPI Ticker */}
        <motion.div variants={fadeIn} transition={{ duration: 0.5 }}>
          <KpiTicker />
        </motion.div>
      </motion.div>

      {/* ── Dashboard preview ── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={scaleIn}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative"
      >
        <DashboardPreview />
      </motion.div>
    </div>
  );
}

// ── Security items ────────────────────────────────────────────────────────

const securityItems = [
  "Secure OAuth Authentication",
  "Session Encryption",
  "Read-Only Analytics Access",
] as const;

// ── Right panel ───────────────────────────────────────────────────────────

function RightPanel({ callbackUrl }: { callbackUrl: string }) {
  const loadingUrl = `/loading-workspace?to=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="relative flex min-h-screen w-full lg:w-[40%] flex-col items-center justify-center bg-background px-6 py-16 lg:px-10 overflow-hidden">

      {/* Background depth accents */}
      <div
        className="pointer-events-none absolute top-0 right-0 h-[380px] w-[380px] rounded-full opacity-[0.065]"
        style={{ background: "radial-gradient(circle, hsl(148 46% 42%) 0%, transparent 68%)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 h-[260px] w-[260px] rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, hsl(148 46% 42%) 0%, transparent 68%)" }}
        aria-hidden="true"
      />

      {/* Mobile brand strip */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        transition={{ duration: 0.4 }}
        className="flex lg:hidden items-center gap-2.5 mb-10"
      >
        <Image
          src="/logo.png"
          alt="DataPilot AI"
          width={30}
          height={30}
          className="rounded-lg shrink-0"
        />
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">DataPilot AI</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Agentic BI Copilot</p>
        </div>
      </motion.div>

      {/* Content block */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerStagger}
        className="relative w-full max-w-[368px] space-y-5"
      >
        {/* Heading */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.4 }}
          className="space-y-1.5"
        >
          <h2 className="font-display text-[1.65rem] font-semibold text-foreground tracking-tight">
            Welcome back
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Sign in to access your analytics workspace.
          </p>
        </motion.div>

        {/* Auth card */}
        <motion.div
          variants={scaleIn}
          transition={{ duration: 0.4 }}
          className="surface-glass rounded-2xl p-5 space-y-4"
          style={{
            boxShadow: [
              "var(--shadow-md)",
              "0 0 0 1px hsl(var(--border) / 0.45)",
              "inset 0 1px 0 hsl(0 0% 100% / 0.06)",
            ].join(", "),
          }}
        >
          {/* "Sign in with" divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10.5px] font-medium text-muted-foreground">Sign in with</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Google OAuth — signIn() call unchanged, callbackUrl routes through loader */}
          <button
            onClick={() => signIn("google", { callbackUrl: loadingUrl })}
            className={cn(
              "group relative flex w-full items-center justify-center gap-3",
              "rounded-xl border border-border bg-background px-4 py-3",
              "text-sm font-medium text-foreground",
              "transition-all duration-200",
              "hover:border-primary/35 hover:bg-muted hover:shadow-glow-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "active:scale-[0.985]"
            )}
          >
            {/* Shimmer sweep on hover */}
            <span
              className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background:
                  "linear-gradient(110deg, transparent 30%, rgba(52,211,153,0.07) 50%, transparent 70%)",
              }}
              aria-hidden="true"
            />
            {/* Google SVG */}
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {/* Security indicators */}
          <div className="space-y-2 border-t border-border/50 pt-3.5">
            {securityItems.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="text-xs text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>

          {/* Inline lock note */}
          <div className="flex items-center justify-center gap-1.5 pt-1 border-t border-border/30">
            <Lock className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
            <span className="text-[10px] text-muted-foreground/55">
              End-to-end encrypted · No passwords stored
            </span>
          </div>
        </motion.div>

        {/* Agent pipeline card */}
        <motion.div
          variants={fadeIn}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-border/60 bg-muted/20 p-4 backdrop-blur-sm"
        >
          <AgentPipeline />
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

function SignInContent() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <div className="min-h-screen lg:flex">
      <LeftPanel />
      <RightPanel callbackUrl={callbackUrl} />
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
