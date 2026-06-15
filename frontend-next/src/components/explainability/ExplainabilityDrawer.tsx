"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Database,
  FlaskConical,
  Lightbulb,
  Microscope,
  Route,
  Shield,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  InsightResponse,
  RootCauseResponse,
  Recommendation,
  RecommendationResponse,
  ForecastResponse,
  ContributionFactor,
} from "@/lib/api/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExplainabilityDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  datasetFilename?: string;
  insights?: InsightResponse | null;
  rootCause?: RootCauseResponse | null;
  recommendations?: RecommendationResponse | null;
  forecast?: ForecastResponse | null;
}

type Tab = "overview" | "evidence" | "reasoning";

// ─── Animations ───────────────────────────────────────────────────────────────

const drawerVariants: Variants = {
  hidden: { x: "100%", opacity: 0.6 },
  show: {
    x: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 340, damping: 36 },
  },
  exit: {
    x: "100%",
    opacity: 0.4,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18 } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.05 } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  high:     "text-orange-600 bg-orange-50 border-orange-200",
  medium:   "text-amber-600 bg-amber-50 border-amber-200",
  low:      "text-blue-600 bg-blue-50 border-blue-200",
};

// ─── Confidence meter ─────────────────────────────────────────────────────────

function ConfidenceMeter({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" :
    pct >= 60 ? "bg-primary" :
    pct >= 40 ? "bg-amber-500" :
                "bg-red-400";

  return (
    <div className={cn("flex items-center gap-2.5", size === "sm" && "gap-1.5")}>
      <div
        className={cn(
          "relative flex-1 rounded-full bg-muted/60 overflow-hidden",
          size === "md" ? "h-2" : "h-1.5"
        )}
      >
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        />
      </div>
      <span
        className={cn(
          "shrink-0 font-mono font-medium tabular-nums",
          size === "md" ? "text-sm text-foreground" : "text-xs text-muted-foreground"
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
    </motion.div>
  );
}

// ─── Collapsible wrapper ──────────────────────────────────────────────────────

function Collapsible({
  label,
  count,
  children,
  defaultOpen = true,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
        {count !== undefined && (
          <Badge variant="secondary" className="ml-1 h-4 min-w-[16px] px-1 text-[9px]">
            {count}
          </Badge>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="pt-1 pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  insights,
  rootCause,
  recommendations,
  forecast,
}: {
  insights?: InsightResponse | null;
  rootCause?: RootCauseResponse | null;
  recommendations?: RecommendationResponse | null;
  forecast?: ForecastResponse | null;
}) {
  const recs = recommendations?.recommendations ?? [];
  const avgConfidence =
    recs.length > 0
      ? recs.reduce((s, r) => s + r.confidence, 0) / recs.length
      : null;

  const hasAny = avgConfidence !== null || insights || rootCause || forecast;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
        <CircleSlash className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No analysis data provided.</p>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
      {/* Aggregate confidence */}
      {avgConfidence !== null && (
        <Section icon={Shield} title="Overall Confidence">
          <div className="rounded-lg border border-border bg-card/60 p-4 space-y-3">
            <div className="flex items-end justify-between">
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {Math.round(avgConfidence * 100)}%
              </p>
              <p className="text-xs text-muted-foreground pb-0.5">
                across {recs.length} recommendation{recs.length !== 1 ? "s" : ""}
              </p>
            </div>
            <ConfidenceMeter value={avgConfidence} />
            {recommendations?.llm_enhanced && (
              <div className="flex items-center gap-1.5 text-xs text-primary/80">
                <Sparkles className="h-3 w-3" />
                LLM-enhanced output
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Summary */}
      {(insights?.summary || recommendations?.summary || rootCause?.problem) && (
        <Section icon={Lightbulb} title="Summary">
          <div className="space-y-2.5">
            {rootCause?.problem && (
              <div className="rounded-md border border-border bg-card/40 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Problem
                </p>
                <p className="text-sm text-foreground">{rootCause.problem}</p>
              </div>
            )}
            {insights?.summary && (
              <div className="rounded-md border border-border bg-card/40 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Insights
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {insights.summary}
                </p>
              </div>
            )}
            {recommendations?.summary && (
              <div className="rounded-md border border-border bg-card/40 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Recommendations
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {recommendations.summary}
                </p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Per-recommendation confidence bars */}
      {recs.length > 0 && (
        <Section icon={BarChart3} title="Confidence by Recommendation">
          <Collapsible label="All recommendations" count={recs.length}>
            <div className="space-y-2.5">
              {recs.map((rec, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-foreground leading-tight line-clamp-2 flex-1">
                      {rec.action}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[9px] capitalize border",
                        PRIORITY_COLOR[rec.priority] ?? "text-muted-foreground"
                      )}
                    >
                      {rec.priority}
                    </Badge>
                  </div>
                  <ConfidenceMeter value={rec.confidence} size="sm" />
                </div>
              ))}
            </div>
          </Collapsible>
        </Section>
      )}

      {/* Forecast quick view */}
      {forecast && (
        <Section icon={TrendingUp} title="Forecast at a glance">
          <div className="rounded-md border border-border bg-card/40 px-3 py-2.5 space-y-1">
            <p className="text-sm text-foreground">{forecast.answer}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              <span className="text-[10px] text-muted-foreground">
                Method: <span className="text-foreground font-medium">{forecast.method_used}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                Horizon: <span className="text-foreground font-medium">{forecast.horizon} {forecast.frequency.toLowerCase()} periods</span>
              </span>
              {forecast.fallback_used && (
                <span className="text-[10px] text-amber-600 font-medium">Fallback model used</span>
              )}
            </div>
          </div>
        </Section>
      )}
    </motion.div>
  );
}

// ─── Evidence tab ─────────────────────────────────────────────────────────────

function EvidenceTab({
  insights,
  rootCause,
  recommendations,
}: {
  insights?: InsightResponse | null;
  rootCause?: RootCauseResponse | null;
  recommendations?: RecommendationResponse | null;
}) {
  const recs = recommendations?.recommendations ?? [];
  const allDataPoints = recs.flatMap((r) =>
    r.data_points.map((dp) => ({ point: dp, source: r.source, action: r.action }))
  );

  const hasAny =
    (insights?.key_insights?.length ?? 0) > 0 ||
    allDataPoints.length > 0 ||
    (rootCause?.root_causes?.length ?? 0) > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
        <Microscope className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No evidence data available.</p>
      </div>
    );
  }

  const SOURCE_COLOR: Record<string, string> = {
    anomaly:      "bg-red-100 text-red-700 border-red-200",
    insight:      "bg-violet-100 text-violet-700 border-violet-200",
    forecast:     "bg-amber-100 text-amber-700 border-amber-200",
    cross_signal: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rule:         "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
      {/* Statistical findings from insight engine */}
      {(insights?.key_insights?.length ?? 0) > 0 && (
        <Section icon={FlaskConical} title="Statistical Findings">
          <Collapsible label="Key insights" count={insights!.key_insights.length}>
            <ul className="space-y-2">
              {insights!.key_insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <p className="text-sm text-muted-foreground">{insight}</p>
                </li>
              ))}
            </ul>
          </Collapsible>

          {(insights!.trends?.length ?? 0) > 0 && (
            <Collapsible label="Detected trends" count={insights!.trends.length} defaultOpen={false}>
              <ul className="space-y-2">
                {insights!.trends.map((trend, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <p className="text-sm text-muted-foreground">{trend}</p>
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}
        </Section>
      )}

      {/* Data points grounding each recommendation */}
      {allDataPoints.length > 0 && (
        <Section icon={Database} title="Grounding Facts">
          <Collapsible label="Data points" count={allDataPoints.length}>
            <div className="space-y-2">
              {allDataPoints.map(({ point, source, action }, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2"
                >
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground">{point}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                      → {action}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[9px] capitalize border",
                      SOURCE_COLOR[source] ?? "text-muted-foreground"
                    )}
                  >
                    {source.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </Collapsible>
        </Section>
      )}

      {/* Root cause factors */}
      {(rootCause?.root_causes?.length ?? 0) > 0 && (
        <Section icon={Brain} title="Causal Factors">
          <Collapsible label="Root causes" count={rootCause!.root_causes.length}>
            <div className="space-y-2">
              {rootCause!.root_causes.map((rc, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border/60 bg-card/40 px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                        #{rc.rank}
                      </span>
                      <p className="text-xs font-medium text-foreground truncate">
                        {rc.dimension}: <span className="text-primary">{rc.value}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] capitalize border",
                          rc.impact_level === "high" ? "text-red-700 bg-red-50 border-red-200" :
                          rc.impact_level === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" :
                          "text-blue-700 bg-blue-50 border-blue-200"
                        )}
                      >
                        {rc.impact_level}
                      </Badge>
                      <span className="text-xs font-mono font-medium text-muted-foreground">
                        {fmtPct(rc.contribution_pct)}
                      </span>
                    </div>
                  </div>

                  {/* Contribution bar */}
                  <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        rc.impact_level === "high" ? "bg-red-400" :
                        rc.impact_level === "medium" ? "bg-amber-400" :
                        "bg-blue-400"
                      )}
                      style={{
                        width: `${Math.min(Math.abs(rc.contribution_pct), 100)}%`,
                      }}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">{rc.description}</p>
                </div>
              ))}
            </div>
          </Collapsible>
        </Section>
      )}
    </motion.div>
  );
}

// ─── Supporting data tab → now "Reasoning" tab (merged for clarity) ───────────

function ReasoningTab({
  insights,
  rootCause,
  recommendations,
  forecast,
  datasetFilename,
}: {
  insights?: InsightResponse | null;
  rootCause?: RootCauseResponse | null;
  recommendations?: RecommendationResponse | null;
  forecast?: ForecastResponse | null;
  datasetFilename?: string;
}) {
  const [showAllContrib, setShowAllContrib] = useState(false);
  const contributions: ContributionFactor[] = rootCause?.contribution_analysis ?? [];
  const shownContribs = showAllContrib ? contributions : contributions.slice(0, 8);

  // Metrics for the reasoning chain
  const statTimeMs = insights
    ? insights.generation_time_ms * 0.3   // heuristic: ~30% is stat engine
    : forecast
    ? forecast.execution_time_ms
    : null;
  const llmTimeMs = insights
    ? insights.generation_time_ms * 0.7
    : recommendations
    ? recommendations.generation_time_ms
    : null;

  const cacheHit = insights?.cache_hit || rootCause?.cache_hit || recommendations?.cache_hit;
  const llmEnhanced = recommendations?.llm_enhanced ?? false;
  const fallbackUsed = forecast?.fallback_used ?? false;

  // Step states
  const stepData = [
    {
      label: "Raw Data",
      sublabel: datasetFilename ?? "Dataset",
      icon: Database,
      color: "text-slate-500",
      bg: "bg-slate-50 border-slate-200",
      status: "complete",
      detail: forecast
        ? `${forecast.data_points} data points · ${forecast.frequency} frequency`
        : null,
    },
    {
      label: "Statistical Engine",
      sublabel: "Deterministic · no LLM",
      icon: FlaskConical,
      color: "text-primary",
      bg: "bg-primary/5 border-primary/20",
      status: "complete",
      detail: forecast
        ? `Method: ${forecast.method_used}${fallbackUsed ? " (fallback)" : ""}`
        : statTimeMs !== null
        ? `~${fmtMs(statTimeMs)} · zero hallucination risk`
        : "Pandas + statsmodels + scikit-learn",
    },
    {
      label: "LLM Enhancement",
      sublabel: llmEnhanced ? "Groq / Ollama" : "Skipped or cached",
      icon: Sparkles,
      color: llmEnhanced ? "text-violet-500" : "text-muted-foreground",
      bg: llmEnhanced
        ? "bg-violet-50 border-violet-200"
        : "bg-muted/30 border-border",
      status: llmEnhanced ? "complete" : "skipped",
      detail: llmTimeMs !== null
        ? `~${fmtMs(llmTimeMs)} · temperature 0.1 · grounded in findings`
        : cacheHit
        ? "Served from cache"
        : "Not applied",
    },
    {
      label: "Validated Output",
      sublabel: "Pydantic schema · typed fields only",
      icon: Shield,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-200",
      status: "complete",
      detail: "extra='forbid' — LLM cannot add undeclared fields",
    },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
      {/* Reasoning chain */}
      <Section icon={Route} title="Reasoning Path">
        <div className="space-y-2">
          {stepData.map((step, i) => (
            <div key={i}>
              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                  step.bg
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    step.status === "skipped"
                      ? "bg-muted/60"
                      : "bg-white/80 shadow-sm"
                  )}
                >
                  <step.icon
                    className={cn(
                      "h-3.5 w-3.5",
                      step.status === "skipped" ? "text-muted-foreground" : step.color
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        step.status === "skipped"
                          ? "text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {step.label}
                    </p>
                    {step.status === "skipped" && (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground h-4 px-1">
                        skipped
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{step.sublabel}</p>
                  {step.detail && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>
              {i < stepData.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowRight className="h-3 w-3 rotate-90 text-border" />
                </div>
              )}
            </div>
          ))}
        </div>

        {cacheHit && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Served from cache — no LLM cost
          </div>
        )}
      </Section>

      {/* Contribution decomposition table */}
      {contributions.length > 0 && (
        <Section icon={Microscope} title="Contribution Decomposition">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Dimension</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Value</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Contribution</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Δ%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {shownContribs.map((c, i) => (
                  <tr key={i} className="bg-card hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-1.5 text-muted-foreground">{c.dimension}</td>
                    <td className="px-3 py-1.5 font-medium text-foreground">{c.value}</td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono font-medium",
                        Math.abs(c.contribution_pct) >= 20
                          ? "text-red-600"
                          : Math.abs(c.contribution_pct) >= 10
                          ? "text-amber-600"
                          : "text-foreground"
                      )}
                    >
                      {fmtPct(c.contribution_pct)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono",
                        c.percentage_change > 0 ? "text-emerald-600" : "text-red-500"
                      )}
                    >
                      {fmtPct(c.percentage_change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contributions.length > 8 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5 h-6 px-2 text-xs w-full"
              onClick={() => setShowAllContrib(!showAllContrib)}
            >
              {showAllContrib
                ? "Show less"
                : `Show ${contributions.length - 8} more`}
            </Button>
          )}

          {rootCause && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span>
                Metric: <span className="font-medium text-foreground">{rootCause.metric_column}</span>
              </span>
              {rootCause.current_period && (
                <span>
                  Current: <span className="font-medium text-foreground">{rootCause.current_period}</span>
                </span>
              )}
              {rootCause.previous_period && (
                <span>
                  Previous: <span className="font-medium text-foreground">{rootCause.previous_period}</span>
                </span>
              )}
              <span>
                Total change:{" "}
                <span
                  className={cn(
                    "font-medium",
                    rootCause.total_change_pct > 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {fmtPct(rootCause.total_change_pct)}
                </span>
              </span>
            </div>
          )}
        </Section>
      )}

      {/* Top/underperformers from insights */}
      {((insights?.top_performers?.length ?? 0) > 0 ||
        (insights?.underperformers?.length ?? 0) > 0) && (
        <Section icon={BarChart3 } title="Performance Breakdown">
          {(insights!.top_performers?.length ?? 0) > 0 && (
            <Collapsible label="Top performers" count={insights!.top_performers.length} defaultOpen={false}>
              <div className="space-y-1">
                {insights!.top_performers.map((p, i) => {
                  const label = String(p.label ?? p.name ?? `Item ${i + 1}`);
                  const value = p.value ?? p.score ?? "";
                  const metric = p.metric ?? "";
                  return (
                    <div key={i} className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-muted/20">
                      <span className="text-muted-foreground truncate">{label}</span>
                      <span className="font-mono font-medium text-emerald-600 shrink-0 ml-2">
                        {typeof value === "number" ? value.toLocaleString() : String(value)}
                        {metric && <span className="text-muted-foreground font-normal ml-1">({metric})</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Collapsible>
          )}
          {(insights!.underperformers?.length ?? 0) > 0 && (
            <Collapsible label="Underperformers" count={insights!.underperformers.length} defaultOpen={false}>
              <div className="space-y-1">
                {insights!.underperformers.map((p, i) => {
                  const label = String(p.label ?? p.name ?? `Item ${i + 1}`);
                  const value = p.value ?? p.score ?? "";
                  const metric = p.metric ?? "";
                  return (
                    <div key={i} className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-muted/20">
                      <span className="text-muted-foreground truncate">{label}</span>
                      <span className="font-mono font-medium text-red-500 shrink-0 ml-2">
                        {typeof value === "number" ? value.toLocaleString() : String(value)}
                        {metric && <span className="text-muted-foreground font-normal ml-1">({metric})</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Collapsible>
          )}
        </Section>
      )}

      {/* Forecast supporting data */}
      {(forecast?.table_data?.length ?? 0) > 0 && (
        <Section icon={TrendingUp} title="Forecast Values">
          <Collapsible label="Projected periods" count={forecast!.table_data.length} defaultOpen={false}>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {Object.keys(forecast!.table_data[0] ?? {}).map((col) => (
                      <th
                        key={col}
                        className="px-3 py-1.5 text-left font-medium text-muted-foreground capitalize"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {forecast!.table_data.slice(0, 12).map((row, i) => (
                    <tr key={i} className="bg-card">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-3 py-1.5 font-mono text-foreground">
                          {typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>
        </Section>
      )}
    </motion.div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",  label: "Overview",  icon: Zap },
  { id: "evidence",  label: "Evidence",  icon: Microscope },
  { id: "reasoning", label: "Reasoning", icon: Route },
];

export function ExplainabilityDrawer({
  open,
  onClose,
  title = "Explainability",
  datasetFilename,
  insights,
  rootCause,
  recommendations,
  forecast,
}: ExplainabilityDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const hasData = !!(insights || rootCause || recommendations || forecast);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.aside
            key="drawer"
            variants={drawerVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn(
              "fixed right-0 top-0 z-50 flex h-full w-full flex-col",
              "bg-background border-l border-border shadow-2xl",
              "sm:max-w-[480px]"
            )}
            aria-label="Explainability panel"
            role="dialog"
            aria-modal="true"
          >
            {/* ── Header ────────────────────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary shadow-sm">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                {datasetFilename && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {datasetFilename}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onClose}
                aria-label="Close explainability panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* ── Tabs ──────────────────────────────────────────────── */}
            <div className="flex shrink-0 border-b border-border">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors",
                    "border-b-2 focus-visible:outline-none",
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-3 w-3" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Body ──────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!hasData ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <Brain className="h-10 w-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">
                    No analysis data passed to the panel.
                  </p>
                  <p className="text-xs text-muted-foreground/60 max-w-56">
                    Run insights, RCA, recommendations, or a forecast first, then
                    open this panel with the results.
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === "overview" && (
                      <OverviewTab
                        insights={insights}
                        rootCause={rootCause}
                        recommendations={recommendations}
                        forecast={forecast}
                      />
                    )}
                    {activeTab === "evidence" && (
                      <EvidenceTab
                        insights={insights}
                        rootCause={rootCause}
                        recommendations={recommendations}
                      />
                    )}
                    {activeTab === "reasoning" && (
                      <ReasoningTab
                        insights={insights}
                        rootCause={rootCause}
                        recommendations={recommendations}
                        forecast={forecast}
                        datasetFilename={datasetFilename}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* ── Footer ────────────────────────────────────────────── */}
            <div className="shrink-0 border-t border-border bg-muted/20 px-5 py-2.5">
              <p className="text-[10px] text-muted-foreground/60 text-center">
                All outputs grounded in deterministic statistical findings · LLM as narrator only
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
