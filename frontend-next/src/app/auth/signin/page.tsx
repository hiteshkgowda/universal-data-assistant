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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Framer Motion variants (typed per project convention) ─────────────────

const containerStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
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

// ── Feature card data ─────────────────────────────────────────────────────

const features = [
  { icon: MessageSquare, label: "Natural Language Analytics" },
  { icon: TrendingUp,    label: "Forecasting" },
  { icon: GitBranch,     label: "Root Cause Analysis" },
  { icon: AlertTriangle, label: "Anomaly Detection" },
  { icon: FileText,      label: "Executive Reporting" },
  { icon: Network,       label: "Multi-Agent Intelligence" },
] as const;

// ── Dashboard preview data (decorative — no backend calls) ────────────────

const kpis = [
  { label: "Revenue",      value: "$4.2M",  delta: "+14.3%", up: true  },
  { label: "Gross Margin", value: "68.4%",  delta: "+2.1pp", up: true  },
  { label: "Active Users", value: "24,819", delta: "+9.7%",  up: true  },
  { label: "Churn Rate",   value: "1.8%",   delta: "−0.3pp", up: true  },
] as const;

const recommendations = [
  "Upsell cohort in Q3 shows 3.2× LTV potential",
  "APAC expansion ROI projected at 41% over 18 months",
] as const;

// ── Trend sparkline (pure SVG, no chart library) ──────────────────────────

function TrendSparkline() {
  const pts = [28, 38, 31, 50, 43, 58, 52, 67, 60, 73, 68, 88];
  const W = 280;
  const H = 52;
  const pad = 4;
  const xStep = (W - pad * 2) / (pts.length - 1);
  const coords = pts.map((v, i) => ({
    x: pad + i * xStep,
    y: H - pad - (v / 100) * (H - pad * 2),
  }));

  const linePath = coords.reduce((acc, { x, y }, i) => {
    if (i === 0) return `M ${x} ${y}`;
    const prev = coords[i - 1];
    const cpx = (prev.x + x) / 2;
    return `${acc} C ${cpx} ${prev.y} ${cpx} ${y} ${x} ${y}`;
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
          <stop offset="0%"   stopColor="rgb(52,211,153)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-grad)" />
      <path
        d={linePath}
        fill="none"
        stroke="rgb(52,211,153)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill="rgb(52,211,153)" />
      <circle
        cx={last.x}
        cy={last.y}
        r="6"
        fill="none"
        stroke="rgb(52,211,153)"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
    </svg>
  );
}

// ── BI Dashboard preview card ─────────────────────────────────────────────

function DashboardPreview() {
  return (
    <div
      className="animate-float w-full max-w-sm mx-auto"
      aria-hidden="true"
    >
      <div className="rounded-2xl border border-white/10 bg-black/25 backdrop-blur-md overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] font-medium text-white/65">Analytics Overview</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-status" />
            <span className="text-[10px] text-emerald-400/80 font-medium">Live</span>
          </div>
        </div>

        {/* KPI 2×2 grid */}
        <div className="grid grid-cols-2 gap-px bg-white/[0.04] m-3 rounded-xl overflow-hidden">
          {kpis.map(({ label, value, delta, up }) => (
            <div key={label} className="bg-black/20 p-2.5">
              <p className="text-[9px] font-medium text-white/35 uppercase tracking-wider mb-1">
                {label}
              </p>
              <p className="text-[13px] font-semibold text-white leading-none">{value}</p>
              <p
                className={cn(
                  "flex items-center gap-0.5 text-[10px] font-medium mt-1",
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
        <div className="mx-3 mb-3 rounded-xl bg-black/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] text-white/35">Revenue · Last 12 weeks</p>
            <Badge
              variant="success"
              className="text-[9px] py-0 px-1.5 border-0 bg-emerald-500/12 text-emerald-400 h-auto"
            >
              ↑ Trending up
            </Badge>
          </div>
          <TrendSparkline />
        </div>

        {/* Executive summary */}
        <div className="mx-3 mb-3 rounded-xl bg-black/20 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">
              Executive Summary
            </span>
          </div>
          <p className="text-[10px] text-white/55 leading-[1.55]">
            Q3 performance exceeded projections across all segments. Revenue grew
            14.3% YoY, driven by enterprise expansion and improved retention.
          </p>
        </div>

        {/* Recommendation chips */}
        <div className="mx-3 mb-3 space-y-1.5">
          {recommendations.map((text) => (
            <div
              key={text}
              className="flex items-start gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.07] px-3 py-2"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-white/60 leading-tight">{text}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── Left panel ────────────────────────────────────────────────────────────

function LeftPanel() {
  return (
    <div className="relative hidden lg:flex lg:w-[60%] flex-col justify-between overflow-hidden bg-gradient-primary min-h-screen px-10 py-10 xl:px-14 xl:py-12">

      {/* Grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden="true"
      />

      {/* Glow blobs */}
      <div
        className="pointer-events-none absolute -top-48 -left-24 h-[560px] w-[560px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(52,211,153,0.5) 0%, transparent 65%)",
          animation: "glow-breathe 6s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-16 -right-24 h-80 w-80 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(74,222,128,0.6) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      {/* Brand */}
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
          width={38}
          height={38}
          className="rounded-xl shrink-0"
          priority
        />
        <div>
          <p className="text-[15px] font-semibold text-white leading-none tracking-tight">
            DataPilot AI
          </p>
          <p className="text-[10.5px] text-white/48 mt-0.5">
            Agentic Business Intelligence Copilot
          </p>
        </div>
      </motion.div>

      {/* Headline + feature cards */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerStagger}
        className="relative space-y-7"
      >
        {/* Headline */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.45 }}
          className="space-y-3"
        >
          <h1 className="font-display text-[2rem] xl:text-[2.3rem] font-semibold text-white leading-[1.2] max-w-sm">
            Turn data into decisions,{" "}
            <span className="text-emerald-300">autonomously.</span>
          </h1>
          <p className="text-sm text-white/52 max-w-xs leading-relaxed">
            Insights, forecasts, recommendations, and executive reports —
            driven by multi-agent AI, no code required.
          </p>
        </motion.div>

        {/* Feature cards grid */}
        <motion.div
          variants={containerStagger}
          className="grid grid-cols-2 gap-2.5"
        >
          {features.map(({ icon: Icon, label }) => (
            <motion.div
              key={label}
              variants={fadeUp}
              transition={{ duration: 0.3 }}
              className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm transition-colors duration-200 hover:bg-white/10 hover:border-white/15 cursor-default"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/18">
                <Icon className="h-3 w-3 text-emerald-300" />
              </span>
              <span className="text-[11.5px] font-medium text-white/78 leading-tight">
                {label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Dashboard preview */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={scaleIn}
        transition={{ duration: 0.55, delay: 0.25 }}
        className="relative"
      >
        <DashboardPreview />
      </motion.div>

    </div>
  );
}

// ── Security indicators ───────────────────────────────────────────────────

const securityItems = [
  "Secure OAuth Authentication",
  "Session Encryption",
  "Read-Only Analytics Access",
] as const;

// ── Right panel ───────────────────────────────────────────────────────────

function RightPanel({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="flex min-h-screen w-full lg:w-[40%] flex-col items-center justify-center bg-background px-6 py-16 lg:px-12">

      {/* Mobile brand strip (hidden on lg+) */}
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
          width={32}
          height={32}
          className="rounded-lg shrink-0"
        />
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">DataPilot AI</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Agentic BI Copilot</p>
        </div>
      </motion.div>

      {/* Main content block */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerStagger}
        className="w-full max-w-[340px] space-y-6"
      >

        {/* Welcome heading */}
        <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-1.5">
          <h2 className="font-display text-[1.6rem] font-semibold text-foreground tracking-tight">
            Welcome back
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sign in to access your workspace.
          </p>
        </motion.div>

        {/* Glassmorphism auth card */}
        <motion.div
          variants={scaleIn}
          transition={{ duration: 0.4 }}
          className="surface-glass rounded-2xl p-6 elevation-md space-y-5"
        >
          {/* "Sign in with" label */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10.5px] text-muted-foreground">Sign in with</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Google OAuth button — signIn() logic preserved exactly */}
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className={cn(
              "group relative flex w-full items-center justify-center gap-3",
              "rounded-xl border border-border bg-background px-4 py-3",
              "text-sm font-medium text-foreground",
              "transition-all duration-200",
              "hover:border-primary/30 hover:bg-muted hover:shadow-glow-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "active:scale-[0.985]"
            )}
          >
            {/* Hover shimmer overlay */}
            <span
              className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background:
                  "linear-gradient(110deg, transparent 35%, rgba(52,211,153,0.07) 50%, transparent 65%)",
              }}
              aria-hidden="true"
            />
            {/* Google logo SVG */}
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* Security indicators */}
          <div className="space-y-2 pt-0.5">
            {securityItems.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="text-xs text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Footer note */}
        <motion.div
          variants={fadeIn}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <Lock className="h-3 w-3 shrink-0" />
          <span>End-to-end encrypted · No passwords stored</span>
        </motion.div>

      </motion.div>
    </div>
  );
}

// ── Page entry ────────────────────────────────────────────────────────────

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
