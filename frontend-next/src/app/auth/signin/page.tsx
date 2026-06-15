"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Image from "next/image";
import {
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  GitBranch,
  FileText,
  Network,
  Lock,
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    label: "Natural Language Analytics",
    desc: "Ask questions about your data in plain English",
  },
  {
    icon: TrendingUp,
    label: "Forecasting",
    desc: "Time-series models with up to 36-period horizon",
  },
  {
    icon: AlertTriangle,
    label: "Anomaly Detection",
    desc: "Statistical outlier identification across datasets",
  },
  {
    icon: Lightbulb,
    label: "Root Cause Analysis",
    desc: "Multi-step agent diagnosis of metric shifts",
  },
  {
    icon: GitBranch,
    label: "Recommendations",
    desc: "Contextual next-step suggestions from your data",
  },
  {
    icon: FileText,
    label: "Executive Reporting",
    desc: "PDF reports generated on demand",
  },
  {
    icon: Network,
    label: "Multi-Agent Workflows",
    desc: "Orchestrated analysis pipelines for complex tasks",
  },
] as const;

function DashboardPreview() {
  const metrics = [
    { label: "Revenue", value: "$2.4M", delta: "+12.3%", up: true },
    { label: "Active Users", value: "18,429", delta: "+8.1%", up: true },
    { label: "Conversion", value: "3.47%", delta: "−0.2pp", up: false },
  ];
  const bars = [38, 52, 44, 68, 55, 80, 62, 76, 58, 88, 72, 94];

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 w-full max-w-sm"
      aria-hidden="true"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
          Live Overview
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Analyzing
        </span>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {metrics.map(({ label, value, delta, up }) => (
          <div key={label} className="rounded-lg bg-white/5 p-2.5">
            <p className="text-[9px] text-white/40 mb-1">{label}</p>
            <p className="text-sm font-semibold text-white leading-none">{value}</p>
            <p
              className={`text-[10px] mt-1 font-medium ${
                up ? "text-emerald-400" : "text-red-400/80"
              }`}
            >
              {delta}
            </p>
          </div>
        ))}
      </div>

      {/* Sparkline bar chart */}
      <div className="rounded-lg bg-white/5 p-3">
        <p className="text-[9px] text-white/40 mb-2">Revenue · Last 12 months</p>
        <div className="flex items-end gap-[3px] h-10">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-emerald-500/60"
              style={{
                height: `${h}%`,
                opacity: 0.4 + (i / bars.length) * 0.6,
              }}
            />
          ))}
        </div>
      </div>

      {/* AI query row */}
      <div className="mt-3 rounded-lg bg-white/5 border border-white/8 px-3 py-2 flex items-center gap-2">
        <MessageSquare className="h-3 w-3 text-emerald-400/70 shrink-0" />
        <p className="text-[10px] text-white/40 italic truncate">
          "What drove the revenue spike in October?"
        </p>
      </div>
    </div>
  );
}

function SignInContent() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-primary p-8 lg:p-12">
        {/* Grid texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Glow blob */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(74,222,128,0.5) 0%, transparent 70%)",
          }}
        />

        {/* Brand */}
        <div className="relative flex items-center gap-3 animate-fade-in">
          <Image
            src="/logo.png"
            alt="DataPilot AI"
            width={36}
            height={36}
            className="rounded-xl shrink-0"
            priority
          />
          <div>
            <p className="text-base font-semibold text-white leading-none">DataPilot AI</p>
            <p className="text-[11px] text-white/55 mt-0.5">Agentic Business Intelligence Copilot</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative space-y-5">
          <h1 className="font-display text-3xl lg:text-4xl font-semibold text-white leading-tight max-w-xs">
            Your data,<br />answered instantly.
          </h1>

          {/* Feature list */}
          <ul className="space-y-3">
            {features.map(({ icon: Icon, label, desc }, i) => (
              <li
                key={label}
                className="flex items-start gap-3"
                style={{
                  animation: `fade-up 0.4s ease-out ${0.05 * i + 0.1}s both`,
                }}
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10">
                  <Icon className="h-3.5 w-3.5 text-emerald-300" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white leading-tight">{label}</span>
                  <span className="block text-xs text-white/50 leading-tight mt-0.5">{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Dashboard preview */}
        <div className="relative animate-fade-in">
          <DashboardPreview />
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center bg-background px-6 py-16 lg:px-16">
        <div className="w-full max-w-sm space-y-8 animate-fade-in-scale">

          {/* Welcome copy */}
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-semibold text-foreground tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in to your workspace to continue your analysis.
            </p>
          </div>

          {/* Login card */}
          <div className="surface-glass rounded-2xl p-6 space-y-5 elevation-md">
            {/* Divider label */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">Continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Google OAuth button — logic preserved exactly */}
            <button
              onClick={() => signIn("google", { callbackUrl })}
              className="group flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted hover:shadow-glow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
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
          </div>

          {/* Security indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            <span>Encrypted · No passwords stored · OAuth 2.0</span>
          </div>
        </div>
      </div>
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
