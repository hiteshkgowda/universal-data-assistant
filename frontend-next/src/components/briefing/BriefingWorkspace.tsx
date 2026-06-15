"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getKPIMonitor } from "@/lib/api/kpi-monitor";
import { generateInsights } from "@/lib/api/insights";
import { generateRecommendations } from "@/lib/api/recommendations";
import { runForecast } from "@/lib/api/forecast";
import { analyzeRootCause } from "@/lib/api/root-cause";
import { useDatasets } from "@/hooks/use-datasets";
import type {
  InsightResponse,
  KPIAlert,
  KPIAlertSeverity,
  KPIHealth,
  KPIMonitorResponse,
  Recommendation,
  RecommendationPriority,
  RecommendationResponse,
  ForecastResponse,
  RootCauseResponse,
} from "@/lib/api/types";

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.06 } },
};

// ─── Config ───────────────────────────────────────────────────────────────────

const HEALTH_CFG: Record<KPIHealth, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  healthy:  { label: "Healthy",  color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200",  Icon: CheckCircle2 },
  warning:  { label: "Warning",  color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",      Icon: AlertTriangle },
  critical: { label: "Critical", color: "text-red-600",     bg: "bg-red-50 border-red-200",          Icon: XCircle },
  unknown:  { label: "Unknown",  color: "text-muted-foreground", bg: "bg-muted/40 border-border",    Icon: BarChart3 },
};

const ALERT_SEV_CFG: Record<KPIAlertSeverity, { dot: string; text: string }> = {
  critical: { dot: "bg-red-500",    text: "text-red-700"    },
  high:     { dot: "bg-orange-500", text: "text-orange-700" },
  medium:   { dot: "bg-amber-500",  text: "text-amber-700"  },
  low:      { dot: "bg-blue-400",   text: "text-blue-700"   },
};

const PRIORITY_CFG: Record<RecommendationPriority, { badge: string; label: string }> = {
  critical: { badge: "bg-red-100 text-red-700 border-red-200",    label: "Critical" },
  high:     { badge: "bg-orange-100 text-orange-700 border-orange-200", label: "High" },
  medium:   { badge: "bg-amber-100 text-amber-700 border-amber-200",  label: "Medium" },
  low:      { badge: "bg-blue-100 text-blue-700 border-blue-200",    label: "Low"  },
};

const PRIORITY_ORDER: RecommendationPriority[] = ["critical", "high", "medium", "low"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  iconClass,
  children,
  className,
}: {
  title: string;
  icon: React.ElementType;
  iconClass?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-border bg-muted/30 px-5 py-3.5">
        <Icon className={cn("h-4 w-4 shrink-0", iconClass ?? "text-primary")} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

function SkeletonSection() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-5 py-3.5">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="p-5 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  );
}

function AlertRiskRow({ alert }: { alert: KPIAlert }) {
  const cfg = ALERT_SEV_CFG[alert.severity];
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", cfg.dot)} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", cfg.text)}>{alert.kpi_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
      </div>
      <Badge variant="outline" className={cn("shrink-0 text-[10px] capitalize", cfg.text)}>
        {alert.severity}
      </Badge>
    </div>
  );
}

function ActionRow({ rec }: { rec: Recommendation }) {
  const cfg = PRIORITY_CFG[rec.priority];
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <Badge
        variant="outline"
        className={cn("shrink-0 mt-0.5 text-[10px] capitalize border", cfg.badge)}
      >
        {cfg.label}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{rec.action}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
        {rec.expected_impact && (
          <p className="text-xs text-primary/80 mt-1">Impact: {rec.expected_impact}</p>
        )}
      </div>
    </div>
  );
}

function RCASection({ data }: { data: RootCauseResponse }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-muted/20">
      <button
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        Root Cause Analysis
        <span className="ml-auto text-xs text-muted-foreground">
          {data.total_change_pct > 0 ? "+" : ""}{data.total_change_pct.toFixed(1)}% change
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-muted-foreground">{data.problem}</p>
              {data.root_causes.slice(0, 4).map((rc, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">#{rc.rank}</span>
                  <span className="font-medium text-foreground">{rc.dimension}: {rc.value}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{rc.contribution_pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BriefingWorkspace() {
  const { data: datasetsData, isLoading: datasetsLoading } = useDatasets();
  const datasets = datasetsData?.datasets ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const [generated, setGenerated] = useState(false);

  const [insightData, setInsightData] = useState<InsightResponse | null>(null);
  const [recData, setRecData] = useState<RecommendationResponse | null>(null);
  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [rcaData, setRcaData] = useState<RootCauseResponse | null>(null);

  const [insightError, setInsightError] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [rcaError, setRcaError] = useState<string | null>(null);

  // Auto-select first dataset
  useEffect(() => {
    if (!datasetsLoading && datasets.length > 0 && !selectedId) {
      setSelectedId(datasets[0].id);
    }
  }, [datasetsLoading, datasets, selectedId]);

  // Reset state when dataset changes
  useEffect(() => {
    setGenerated(false);
    setInsightData(null);
    setRecData(null);
    setForecastData(null);
    setRcaData(null);
    setInsightError(null);
    setRecError(null);
    setForecastError(null);
    setRcaError(null);
  }, [selectedId]);

  // KPI Monitor — auto-fetch when dataset selected
  const {
    data: kpiData,
    isLoading: kpiLoading,
    isError: kpiError,
    refetch: refetchKpi,
  } = useQuery<KPIMonitorResponse>({
    queryKey: ["briefing-kpi", selectedId],
    queryFn: () => getKPIMonitor(selectedId),
    enabled: !!selectedId,
    staleTime: 30_000,
  });

  // Insights mutation
  const insightMut = useMutation({
    mutationFn: () =>
      generateInsights({
        dataset_id: selectedId,
        question:
          "Provide an executive summary covering key performance drivers, trends, and strategic opportunities.",
      }),
    onSuccess: (data) => { setInsightData(data); setInsightError(null); },
    onError: (e: Error) => setInsightError(e.message),
  });

  // Recommendations mutation
  const recMut = useMutation({
    mutationFn: () =>
      generateRecommendations({
        dataset_id: selectedId,
        llm_enhance: true,
      }),
    onSuccess: (data) => { setRecData(data); setRecError(null); },
    onError: (e: Error) => setRecError(e.message),
  });

  // Forecast mutation (on demand)
  const forecastMut = useMutation({
    mutationFn: () =>
      runForecast({
        dataset_id: selectedId,
        question: "What is the overall trend forecast for the next 3 periods?",
      }),
    onSuccess: (data) => { setForecastData(data); setForecastError(null); },
    onError: (e: Error) => setForecastError(e.message),
  });

  // RCA mutation (on demand)
  const rcaMut = useMutation({
    mutationFn: () =>
      analyzeRootCause({
        dataset_id: selectedId,
        question: "What are the main drivers of change in the key metrics?",
      }),
    onSuccess: (data) => { setRcaData(data); setRcaError(null); },
    onError: (e: Error) => setRcaError(e.message),
  });

  function handleGenerate() {
    if (!selectedId) return;
    setGenerated(true);
    setInsightData(null);
    setRecData(null);
    setInsightError(null);
    setRecError(null);
    insightMut.mutate();
    recMut.mutate();
  }

  const isGenerating = insightMut.isPending || recMut.isPending;
  const selectedDataset = datasets.find((d) => d.id === selectedId);

  // Risk alerts: critical + high only
  const riskAlerts: KPIAlert[] = kpiData
    ? kpiData.alerts.filter((a) => a.severity === "critical" || a.severity === "high")
    : [];

  // Opportunities: trends from insights + rec items from forecast/insight/cross_signal sources
  const opportunityRecs: Recommendation[] = recData
    ? recData.recommendations.filter((r) =>
        ["insight", "forecast", "cross_signal"].includes(r.source)
      )
    : [];

  // Actions: all recommendations sorted by priority
  const actionRecs: Recommendation[] = recData
    ? [...recData.recommendations].sort(
        (a, b) =>
          PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
      )
    : [];

  const health = kpiData?.overall_health ?? "unknown";
  const healthCfg = HEALTH_CFG[health];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Executive Briefing
            </h1>
          </div>

          {/* Dataset selector */}
          {datasetsLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {datasets.length === 0 && (
                <option value="">No datasets available</option>
              )}
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename}
                </option>
              ))}
            </select>
          )}

          {/* Health badge from KPI Monitor */}
          {kpiData && (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                healthCfg.bg,
                healthCfg.color
              )}
            >
              <healthCfg.Icon className="h-3 w-3" />
              {healthCfg.label}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!selectedId || isGenerating || datasetsLoading}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {generated ? "Regenerate" : "Generate Briefing"}
                </>
              )}
            </Button>
          </div>
        </div>

        {selectedDataset && (
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedDataset.rows.toLocaleString()} rows · {selectedDataset.columns} columns
            {kpiData && ` · ${kpiData.kpis.length} KPIs monitored`}
          </p>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {!generated && !isGenerating && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <FileBarChart className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              Select a dataset and click Generate Briefing
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              Combines KPI monitoring, AI insights, and recommendations into a board-level summary.
            </p>
          </div>
        )}

        {(generated || isGenerating) && (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId + String(generated)}
              initial="hidden"
              animate="show"
              variants={stagger}
              className="grid gap-5 md:grid-cols-2"
            >
              {/* ── Executive Summary ─────────────────────────────── */}
              {insightMut.isPending ? (
                <SkeletonSection />
              ) : insightError ? (
                <SectionCard title="Executive Summary" icon={Sparkles} iconClass="text-primary">
                  <p className="text-xs text-destructive">{insightError}</p>
                </SectionCard>
              ) : insightData ? (
                <SectionCard
                  title="Executive Summary"
                  icon={Sparkles}
                  iconClass="text-primary"
                  className="md:col-span-2"
                >
                  <p className="text-sm text-foreground leading-relaxed">{insightData.summary}</p>
                  {insightData.key_insights.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {insightData.key_insights.map((insight, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="text-muted-foreground">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              ) : null}

              {/* ── Risks ─────────────────────────────────────────── */}
              {kpiLoading ? (
                <SkeletonSection />
              ) : kpiError ? (
                <SectionCard title="Risks" icon={AlertTriangle} iconClass="text-red-500">
                  <p className="text-xs text-destructive">Failed to load KPI monitor data.</p>
                </SectionCard>
              ) : (
                <SectionCard title="Risks" icon={AlertTriangle} iconClass="text-red-500">
                  {riskAlerts.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      No critical or high-severity alerts detected.
                    </div>
                  ) : (
                    <div>
                      {riskAlerts.map((alert, i) => (
                        <AlertRiskRow key={i} alert={alert} />
                      ))}
                    </div>
                  )}

                  {/* RCA section */}
                  {rcaData && <RCASection data={rcaData} />}
                  {rcaError && (
                    <p className="mt-3 text-xs text-destructive">RCA: {rcaError}</p>
                  )}

                  {!rcaData && !rcaMut.isPending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 h-7 text-xs"
                      onClick={() => rcaMut.mutate()}
                    >
                      <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
                      Add Root Cause Analysis
                    </Button>
                  )}
                  {rcaMut.isPending && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running root cause analysis…
                    </div>
                  )}
                </SectionCard>
              )}

              {/* ── Opportunities ─────────────────────────────────── */}
              {insightMut.isPending || recMut.isPending ? (
                <SkeletonSection />
              ) : (
                <SectionCard title="Opportunities" icon={Lightbulb} iconClass="text-amber-500">
                  {insightData?.trends && insightData.trends.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                        Trends
                      </p>
                      <ul className="space-y-2">
                        {insightData.trends.map((trend, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <span className="text-muted-foreground">{trend}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {opportunityRecs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                        Strategic Opportunities
                      </p>
                      {opportunityRecs.slice(0, 4).map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0 text-sm">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <div>
                            <p className="font-medium text-foreground">{rec.action}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{rec.expected_impact}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!insightData && !recData && !insightError && !recError && (
                    <p className="text-xs text-muted-foreground">Generating analysis…</p>
                  )}
                  {(insightData?.trends?.length === 0 || !insightData?.trends) &&
                    opportunityRecs.length === 0 &&
                    insightData && recData && (
                      <p className="text-sm text-muted-foreground">No specific opportunities identified for this dataset.</p>
                    )}

                  {/* Forecast section */}
                  {forecastData && (
                    <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                      <p className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        Forecast Outlook
                      </p>
                      <p className="text-sm text-muted-foreground">{forecastData.answer}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Method: {forecastData.method_used} · Horizon: {forecastData.horizon} periods
                      </p>
                    </div>
                  )}
                  {forecastError && (
                    <p className="mt-3 text-xs text-destructive">Forecast: {forecastError}</p>
                  )}

                  {!forecastData && !forecastMut.isPending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 h-7 text-xs"
                      onClick={() => forecastMut.mutate()}
                    >
                      <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                      Add Forecast Outlook
                    </Button>
                  )}
                  {forecastMut.isPending && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running forecast…
                    </div>
                  )}
                </SectionCard>
              )}

              {/* ── Actions ───────────────────────────────────────── */}
              {recMut.isPending ? (
                <SkeletonSection />
              ) : recError ? (
                <SectionCard title="Actions" icon={Target} iconClass="text-violet-500">
                  <p className="text-xs text-destructive">{recError}</p>
                </SectionCard>
              ) : recData ? (
                <SectionCard
                  title="Actions"
                  icon={Target}
                  iconClass="text-violet-500"
                  className={actionRecs.length > 4 ? "md:col-span-2" : ""}
                >
                  {recData.summary && (
                    <p className="mb-4 text-sm text-muted-foreground">{recData.summary}</p>
                  )}
                  {actionRecs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No prioritized actions generated.</p>
                  ) : (
                    <div>
                      {actionRecs.map((rec, i) => (
                        <ActionRow key={i} rec={rec} />
                      ))}
                    </div>
                  )}
                </SectionCard>
              ) : null}

              {/* ── KPI Strip ─────────────────────────────────────── */}
              {kpiData && kpiData.kpis.length > 0 && (
                <motion.div
                  variants={fadeUp}
                  className="md:col-span-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden"
                >
                  <div className="flex items-center gap-2.5 border-b border-border bg-muted/30 px-5 py-3.5">
                    <Zap className="h-4 w-4 shrink-0 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">KPI Overview</h2>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {kpiData.kpis.length} KPIs · {kpiData.row_count.toLocaleString()} rows
                    </span>
                  </div>
                  <div className="grid gap-px bg-border" style={{ gridTemplateColumns: `repeat(${Math.min(kpiData.kpis.length, 4)}, 1fr)` }}>
                    {kpiData.kpis.slice(0, 8).map((kpi) => {
                      const hCfg = HEALTH_CFG[kpi.health];
                      return (
                        <div key={kpi.column} className="bg-card px-4 py-3.5">
                          <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                          <p className="mt-1 text-lg font-semibold text-foreground leading-none">
                            {kpi.formatted_value}
                          </p>
                          {kpi.change_pct !== null && (
                            <p className={cn(
                              "mt-1 text-xs",
                              kpi.change_pct > 0 ? "text-emerald-600" : kpi.change_pct < 0 ? "text-red-500" : "text-muted-foreground"
                            )}>
                              {kpi.change_pct > 0 ? "+" : ""}{kpi.change_pct.toFixed(1)}%
                            </p>
                          )}
                          <p className={cn("mt-1 text-[10px] font-medium", hCfg.color)}>
                            {hCfg.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
