"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  History,
  Loader2,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getKPIMonitor } from "@/lib/api/kpi-monitor";
import { detectAnomalies } from "@/lib/api/anomalies";
import { useDatasets } from "@/hooks/use-datasets";
import { AlertHistoryStore } from "./AlertHistoryStore";
import type {
  AlertSnapshot,
} from "./AlertHistoryStore";
import type {
  KPIAlert,
  KPIAlertSeverity,
  KPIHealth,
  KPIMonitorResponse,
  KPIPriority,
  KPIRecommendation,
} from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.05 } },
};

// ─── Config maps ──────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<KPIAlertSeverity, {
  label: string; color: string; bg: string; border: string; dot: string; Icon: React.ElementType;
}> = {
  critical: { label: "Critical", color: "text-red-400",    bg: "bg-red-500/8",    border: "border-red-500/25",    dot: "bg-red-500",    Icon: XCircle },
  high:     { label: "High",     color: "text-orange-400", bg: "bg-orange-500/8", border: "border-orange-500/25", dot: "bg-orange-500", Icon: AlertTriangle },
  medium:   { label: "Medium",   color: "text-amber-400",  bg: "bg-amber-500/8",  border: "border-amber-500/25",  dot: "bg-amber-400",  Icon: AlertTriangle },
  low:      { label: "Low",      color: "text-sky-400",    bg: "bg-sky-500/8",    border: "border-sky-500/25",    dot: "bg-sky-400",    Icon: Bell },
};

const HEALTH_CFG: Record<KPIHealth, {
  label: string; color: string; bg: string; Icon: React.ElementType;
}> = {
  healthy:  { label: "Healthy",  color: "text-emerald-400", bg: "bg-emerald-500/10", Icon: CheckCircle2 },
  warning:  { label: "Warning",  color: "text-amber-400",   bg: "bg-amber-500/10",   Icon: AlertTriangle },
  critical: { label: "Critical", color: "text-red-400",     bg: "bg-red-500/10",     Icon: XCircle },
  unknown:  { label: "Unknown",  color: "text-muted-foreground", bg: "bg-muted/30", Icon: Zap },
};

const PRIORITY_CFG: Record<KPIPriority, { label: string; color: string; dot: string }> = {
  critical: { label: "Critical", color: "text-red-400",    dot: "bg-red-500" },
  high:     { label: "High",     color: "text-orange-400", dot: "bg-orange-500" },
  medium:   { label: "Medium",   color: "text-amber-400",  dot: "bg-amber-500" },
  low:      { label: "Low",      color: "text-sky-400",    dot: "bg-sky-500" },
};

const SEVERITY_ORDER: KPIAlertSeverity[] = ["critical", "high", "medium", "low"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: KPIHealth }) {
  const cfg = HEALTH_CFG[health];
  const Icon = cfg.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cfg.bg, cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: KPIAlertSeverity }) {
  const cfg = SEVERITY_CFG[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border", cfg.bg, cfg.color, cfg.border)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function AlertCard({ alert }: { alert: KPIAlert }) {
  const cfg = SEVERITY_CFG[alert.severity as KPIAlertSeverity] ?? SEVERITY_CFG.low;
  const Icon = cfg.Icon;
  return (
    <motion.div
      variants={fadeUp}
      className={cn(
        "rounded-xl border p-4 space-y-1.5",
        cfg.bg, cfg.border
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />
          <span className="text-sm font-medium text-foreground truncate">
            {alert.kpi_name}
          </span>
        </div>
        <SeverityBadge severity={alert.severity as KPIAlertSeverity} />
      </div>
      <p className="text-xs text-muted-foreground pl-6">{alert.message}</p>
      <div className="flex items-center gap-3 pl-6 text-xs text-muted-foreground/70">
        <span>Value: <span className="text-foreground">{alert.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
        <span>Threshold: <span className="text-foreground">{alert.threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
        {alert.label && <span>Period: <span className="text-foreground">{alert.label}</span></span>}
      </div>
    </motion.div>
  );
}

function RecommendationCard({ rec }: { rec: KPIRecommendation }) {
  const cfg = PRIORITY_CFG[rec.priority as KPIPriority] ?? PRIORITY_CFG.low;
  return (
    <motion.div variants={fadeUp} className="flex gap-3 rounded-xl border border-border/40 bg-card/60 p-4">
      <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", cfg.dot)} />
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
          <span className="text-xs text-muted-foreground">· {rec.kpi}</span>
        </div>
        <p className="text-xs text-muted-foreground">{rec.issue}</p>
        <p className="text-xs text-foreground font-medium">{rec.action}</p>
      </div>
    </motion.div>
  );
}

function AlertGroup({ severity, alerts }: { severity: KPIAlertSeverity; alerts: KPIAlert[] }) {
  const [open, setOpen] = useState(severity === "critical" || severity === "high");
  const cfg = SEVERITY_CFG[severity];
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />
        <span className={cn("text-sm font-semibold", cfg.color)}>{cfg.label}</span>
        <Badge variant="secondary" className="text-xs h-5">{alerts.length}</Badge>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2 pl-4">
              {alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActiveAlertsPane({ data, refetch, isFetching }: { data: KPIMonitorResponse; refetch: () => void; isFetching: boolean }) {
  const grouped = SEVERITY_ORDER.reduce<Record<KPIAlertSeverity, KPIAlert[]>>(
    (acc, s) => { acc[s] = data.alerts.filter((a) => a.severity === s); return acc; },
    { critical: [], high: [], medium: [], low: [] }
  );

  return (
    <div className="space-y-5">
      {/* Health summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-card/50 px-4 py-3">
        <HealthBadge health={data.overall_health} />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><span className="font-medium text-red-400">{data.critical_count}</span> critical</span>
          <span><span className="font-medium text-amber-400">{data.warning_count}</span> warning</span>
          <span><span className="font-medium text-emerald-400">{data.healthy_count}</span> healthy</span>
        </div>
        <button
          onClick={refetch}
          disabled={isFetching}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </button>
      </div>

      {data.alerts.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400/60" />
          <p className="text-sm font-medium text-foreground">No alerts</p>
          <p className="text-xs text-muted-foreground">All KPIs are within expected thresholds.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {SEVERITY_ORDER.filter((s) => grouped[s].length > 0).map((s) => (
            <AlertGroup key={s} severity={s} alerts={grouped[s]} />
          ))}
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Related recommendations</h3>
          </div>
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
            {data.recommendations.map((r, i) => <RecommendationCard key={i} rec={r} />)}
          </motion.div>
        </div>
      )}
    </div>
  );
}

function AnomalyPanel({ datasetId }: { datasetId: string }) {
  const mutation = useMutation({
    mutationFn: () => detectAnomalies({ dataset_id: datasetId, methods: ["zscore", "iqr", "isolation_forest"] }),
    onError: (err: Error) => toast.error(`Anomaly scan failed: ${err.message}`),
  });

  const result = mutation.data;

  const SEV_COLOR: Record<string, string> = {
    critical: "text-red-400", high: "text-orange-400", medium: "text-amber-400", low: "text-sky-400", none: "text-muted-foreground",
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/40 bg-card/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Anomaly Detection</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="mr-1.5 h-3.5 w-3.5" />}
          {mutation.isPending ? "Scanning…" : result ? "Re-scan" : "Scan"}
        </Button>
      </div>

      {!result && !mutation.isPending && (
        <p className="text-xs text-muted-foreground">
          Run statistical anomaly detection (z-score, IQR, Isolation Forest) across all numeric columns.
        </p>
      )}

      {mutation.isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analysing dataset…
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-xs">
            <span>Overall severity: <span className={cn("font-semibold", SEV_COLOR[result.severity])}>{result.severity}</span></span>
            <span>Anomalies found: <span className="font-semibold text-foreground">{result.total_anomaly_count}</span></span>
            <span>Affected metrics: <span className="font-semibold text-foreground">{result.affected_metrics.length}</span></span>
          </div>
          {result.affected_metrics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.affected_metrics.map((m) => (
                <span key={m} className="rounded-full bg-muted/50 border border-border/40 px-2 py-0.5 text-xs text-foreground">{m}</span>
              ))}
            </div>
          )}
          {result.possible_reasons.length > 0 && (
            <ul className="space-y-1">
              {result.possible_reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          )}
          {result.anomalies.map((col) => (
            col.anomaly_count > 0 && (
              <div key={col.column} className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{col.column}</span>
                  <span className="text-muted-foreground">{col.anomaly_count} anomal{col.anomaly_count === 1 ? "y" : "ies"}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {col.anomaly_points.slice(0, 5).map((pt, i) => (
                    <span
                      key={i}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] border",
                        pt.severity === "critical" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                        pt.severity === "high" ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
                        pt.severity === "medium" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                        "bg-sky-500/10 border-sky-500/20 text-sky-400"
                      )}
                    >
                      {pt.label ?? `row ${pt.row_index}`} — {pt.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </span>
                  ))}
                  {col.anomaly_points.length > 5 && (
                    <span className="text-[10px] text-muted-foreground py-0.5">+{col.anomaly_points.length - 5} more</span>
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function HistoricalPane({ snapshots, onClear }: { snapshots: AlertSnapshot[]; onClear: () => void }) {
  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-center">
        <History className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-foreground">No history yet</p>
        <p className="text-xs text-muted-foreground">Run a KPI scan first. History is saved per session in your browser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{snapshots.length} past scan{snapshots.length !== 1 ? "s" : ""} · stored locally</p>
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-3 w-3" />
          Clear history
        </button>
      </div>
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
        {snapshots.map((snap, i) => {
          const health = HEALTH_CFG[snap.overall_health];
          const HealthIcon = health.Icon;
          return (
            <motion.div
              key={i}
              variants={fadeUp}
              className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <HealthIcon className={cn("h-4 w-4 shrink-0", health.color)} />
                  <span className={cn("text-sm font-medium", health.color)}>{health.label}</span>
                </div>
                <span className="text-xs text-muted-foreground/70 shrink-0">
                  <Clock className="inline h-3 w-3 mr-1" />
                  {formatRelativeTime(snap.timestamp)}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {snap.critical_count > 0 && <span className="text-red-400">{snap.critical_count} critical</span>}
                {snap.warning_count > 0 && <span className="text-amber-400">{snap.warning_count} warning</span>}
                <span>{snap.healthy_count} healthy</span>
                {snap.alert_count > 0 && <span>{snap.alert_count} total alert{snap.alert_count !== 1 ? "s" : ""}</span>}
                {snap.anomaly_count > 0 && <span className="text-orange-400">{snap.anomaly_count} anomali{snap.anomaly_count !== 1 ? "es" : "y"} ({snap.anomaly_severity})</span>}
              </div>
              {snap.alerts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {snap.alerts.slice(0, 6).map((a, j) => (
                    <SeverityBadge key={j} severity={a.severity as KPIAlertSeverity} />
                  ))}
                  {snap.alerts.length > 6 && (
                    <span className="text-xs text-muted-foreground py-0.5">+{snap.alerts.length - 6} more</span>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

type Tab = "active" | "history";

export function AlertCenterWorkspace() {
  const { data: dsData, isLoading: dsLoading } = useDatasets();
  const [selectedId, setSelectedId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("active");
  const [snapshots, setSnapshots] = useState<AlertSnapshot[]>([]);

  const datasets = dsData?.datasets ?? [];

  // Auto-select first dataset
  useEffect(() => {
    if (!selectedId && datasets.length > 0) {
      setSelectedId(datasets[0].id);
    }
  }, [datasets, selectedId]);

  // Load history when dataset changes
  useEffect(() => {
    if (selectedId) {
      setSnapshots(AlertHistoryStore.list(selectedId));
    }
  }, [selectedId]);

  const selectedMeta = datasets.find((d) => d.id === selectedId);

  const { data: kpiData, isFetching, refetch, isError } = useQuery({
    queryKey: ["alerts-kpi-monitor", selectedId],
    queryFn: () => getKPIMonitor(selectedId),
    enabled: !!selectedId,
    staleTime: 30_000,
  });

  // Save snapshot to history when KPI data arrives
  useEffect(() => {
    if (!kpiData || !selectedId || !selectedMeta) return;
    const snap: AlertSnapshot = {
      timestamp: new Date().toISOString(),
      dataset_id: selectedId,
      dataset_filename: selectedMeta.filename,
      overall_health: kpiData.overall_health,
      alert_count: kpiData.alerts.length,
      critical_count: kpiData.critical_count,
      warning_count: kpiData.warning_count,
      healthy_count: kpiData.healthy_count,
      alerts: kpiData.alerts,
      recommendations: kpiData.recommendations,
      anomaly_count: 0,
      anomaly_severity: "none",
    };
    AlertHistoryStore.push(snap);
    setSnapshots(AlertHistoryStore.list(selectedId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiData]);

  const handleClearHistory = useCallback(() => {
    if (!selectedId) return;
    AlertHistoryStore.clearDataset(selectedId);
    setSnapshots([]);
  }, [selectedId]);

  const activeCount = kpiData?.alerts.length ?? 0;
  const criticalCount = kpiData?.critical_count ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Alert Center
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            KPI alerts, anomaly detection, and recommendations across your datasets.
          </p>
        </div>
        {criticalCount > 0 && (
          <span className="flex h-7 items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-3 text-xs font-semibold text-red-400 shrink-0">
            <XCircle className="h-3.5 w-3.5" />
            {criticalCount} critical
          </span>
        )}
      </div>

      {/* ── Dataset selector ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Database className="h-4 w-4 text-muted-foreground shrink-0" />
        {dsLoading ? (
          <Skeleton className="h-9 w-56 rounded-lg" />
        ) : (
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setTab("active"); }}
            className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {datasets.length === 0 && <option value="">No datasets</option>}
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.filename}</option>
            ))}
          </select>
        )}
        {selectedMeta && (
          <span className="text-xs text-muted-foreground">
            {selectedMeta.rows.toLocaleString()} rows · {selectedMeta.columns} cols
          </span>
        )}
      </div>

      {!selectedId ? (
        <div className="flex flex-col items-center py-20 gap-3 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Upload a dataset to start monitoring alerts.</p>
        </div>
      ) : (
        <>
          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <div className="flex gap-1 rounded-lg border border-border/40 bg-muted/20 p-1 w-fit">
            {(["active", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  tab === t
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "active" ? <Bell className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                {t === "active" ? "Active" : "History"}
                {t === "active" && activeCount > 0 && (
                  <span className={cn("rounded-full px-1.5 text-[10px] font-bold", criticalCount > 0 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400")}>
                    {activeCount}
                  </span>
                )}
                {t === "history" && snapshots.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                    {snapshots.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Content ───────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {tab === "active" ? (
              <motion.div
                key="active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                {isFetching && !kpiData ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 rounded-xl" />
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                  </div>
                ) : isError ? (
                  <div className="rounded-xl border border-border/40 bg-card/50 p-8 text-center space-y-3">
                    <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
                    <p className="text-sm text-muted-foreground">Failed to load KPI monitor data.</p>
                    <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
                  </div>
                ) : kpiData ? (
                  <ActiveAlertsPane data={kpiData} refetch={refetch} isFetching={isFetching} />
                ) : null}

                {/* Anomaly scan always visible when dataset selected */}
                {selectedId && <AnomalyPanel datasetId={selectedId} />}
              </motion.div>
            ) : (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <HistoricalPane snapshots={snapshots} onClear={handleClearHistory} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
