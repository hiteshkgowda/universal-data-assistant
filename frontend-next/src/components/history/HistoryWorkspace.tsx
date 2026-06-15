"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  BarChart2,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlotlyChart } from "@/components/ask/PlotlyChart";
import { getQueryHistory } from "@/lib/api/memory";
import { askQuestion } from "@/lib/api/chart";
import { runForecast } from "@/lib/api/forecast";
import type { HistoryTurn, ChartResponse, ForecastResponse } from "@/lib/api/types";

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.04 } },
};

// ─── Turn type config ─────────────────────────────────────────────────────────

type TurnTypeKey = "query" | "chart" | "forecast" | "insight" | "anomaly" | "recommendation" | "report" | "agent";

const TYPE_CFG: Record<TurnTypeKey, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  query:          { label: "Query",          color: "text-indigo-700",  bg: "bg-indigo-100 border-indigo-200",  Icon: Search },
  chart:          { label: "Chart",          color: "text-cyan-700",    bg: "bg-cyan-100 border-cyan-200",      Icon: BarChart2 },
  forecast:       { label: "Forecast",       color: "text-amber-700",   bg: "bg-amber-100 border-amber-200",    Icon: TrendingUp },
  insight:        { label: "Insight",        color: "text-violet-700",  bg: "bg-violet-100 border-violet-200",  Icon: Sparkles },
  anomaly:        { label: "Anomaly",        color: "text-red-700",     bg: "bg-red-100 border-red-200",        Icon: Zap },
  recommendation: { label: "Recommendation", color: "text-emerald-700", bg: "bg-emerald-100 border-emerald-200",Icon: Brain },
  report:         { label: "Report",         color: "text-slate-700",   bg: "bg-slate-100 border-slate-200",    Icon: FileText },
  agent:          { label: "Agent",          color: "text-orange-700",  bg: "bg-orange-100 border-orange-200",  Icon: Bot },
};

const ALL_TYPES = Object.keys(TYPE_CFG) as TurnTypeKey[];
const RERUNNABLE = new Set<string>(["query", "chart", "forecast"]);

function getTurnCfg(type: string) {
  return TYPE_CFG[type as TurnTypeKey] ?? {
    label: type,
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
    Icon: Clock,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

type RerunResult =
  | { kind: "chart"; data: ChartResponse }
  | { kind: "forecast"; data: ForecastResponse }
  | { kind: "error"; message: string };

// ─── HistoryItem ──────────────────────────────────────────────────────────────

function HistoryItem({ turn }: { turn: HistoryTurn }) {
  const cfg = getTurnCfg(turn.turn_type);
  const [expanded, setExpanded] = useState(false);
  const [rerunResult, setRerunResult] = useState<RerunResult | null>(null);

  const chartMut = useMutation({
    mutationFn: () =>
      askQuestion({ dataset_id: turn.dataset_id!, question: turn.question! }),
    onSuccess: (data) => setRerunResult({ kind: "chart", data }),
    onError: (e: Error) => setRerunResult({ kind: "error", message: e.message }),
  });

  const forecastMut = useMutation({
    mutationFn: () =>
      runForecast({ dataset_id: turn.dataset_id!, question: turn.question! }),
    onSuccess: (data) => setRerunResult({ kind: "forecast", data }),
    onError: (e: Error) => setRerunResult({ kind: "error", message: e.message }),
  });

  function handleRerun() {
    setRerunResult(null);
    if (turn.turn_type === "forecast") {
      forecastMut.mutate();
    } else {
      chartMut.mutate();
    }
  }

  const isPending = chartMut.isPending || forecastMut.isPending;
  const canRerun =
    RERUNNABLE.has(turn.turn_type) && !!turn.dataset_id && !!turn.question;

  const answerPreview =
    turn.answer && turn.answer.length > 140
      ? turn.answer.slice(0, 140) + "…"
      : turn.answer;

  const rerunAnswer =
    rerunResult?.kind === "chart"
      ? rerunResult.data.answer
      : rerunResult?.kind === "forecast"
      ? rerunResult.data.answer
      : null;

  const rerunChartSpec =
    rerunResult?.kind === "chart"
      ? rerunResult.data.chart_spec
      : rerunResult?.kind === "forecast"
      ? rerunResult.data.chart_spec
      : null;

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-lg border border-border bg-card overflow-hidden"
    >
      {/* ── Header row ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3">
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 mt-0.5 gap-1 text-[10px] uppercase tracking-wide border px-1.5 py-0.5",
            cfg.color,
            cfg.bg
          )}
        >
          <cfg.Icon className="h-2.5 w-2.5" />
          {cfg.label}
        </Badge>

        <div className="min-w-0 flex-1">
          {turn.question ? (
            <p className="text-sm font-medium text-foreground line-clamp-2">
              {turn.question}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No question recorded</p>
          )}
          {turn.answer && !expanded && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {answerPreview}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {formatRelative(turn.created_at)}
          </span>

          {canRerun && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleRerun}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          )}

          {(turn.answer || rerunResult) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── Expanded answer ──────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
              {turn.answer && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {turn.answer}
                </p>
              )}

              {/* Re-run result */}
              {rerunResult?.kind === "error" && (
                <p className="text-xs text-destructive">Re-run failed: {rerunResult.message}</p>
              )}
              {rerunAnswer && rerunAnswer !== turn.answer && (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                  <p className="text-[10px] font-medium text-primary mb-1">Re-run result</p>
                  <p className="text-sm text-foreground">{rerunAnswer}</p>
                </div>
              )}
              {rerunChartSpec && (
                <PlotlyChart spec={rerunChartSpec} />
              )}

              {turn.dataset_id && (
                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {turn.dataset_id}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Inline re-run panel when not expanded ────────────────────── */}
      {!expanded && rerunResult && (
        <div className="border-t border-border px-4 pb-3 pt-2">
          {rerunResult.kind === "error" && (
            <p className="text-xs text-destructive">Re-run failed: {rerunResult.message}</p>
          )}
          {rerunResult.kind !== "error" && rerunAnswer && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-[10px] font-medium text-primary mb-1">Re-run result</p>
              <p className="text-sm text-foreground">{rerunAnswer}</p>
            </div>
          )}
          {rerunResult.kind !== "error" && rerunChartSpec && (
            <div className="mt-2">
              <PlotlyChart spec={rerunChartSpec} />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export function HistoryWorkspace() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<TurnTypeKey>>(new Set());
  const [offset, setOffset] = useState(0);

  // Debounce search input 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [selectedTypes]);

  const queryParams = {
    search: debouncedSearch || undefined,
    turn_types: selectedTypes.size > 0 ? [...selectedTypes] : undefined,
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["query-history", queryParams],
    queryFn: () => getQueryHistory(queryParams),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  function toggleType(type: TurnTypeKey) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const total = data?.total ?? 0;
  const turns = data?.turns ?? [];
  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Query History
          </h1>
          {!isLoading && total > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {total.toLocaleString()}
            </Badge>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search questions…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full h-8 rounded-md border border-input bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Turn type filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map((type) => {
            const cfg = getTurnCfg(type);
            const active = selectedTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  active
                    ? cn("border", cfg.bg, cfg.color)
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <cfg.Icon className="h-2.5 w-2.5" />
                {cfg.label}
              </button>
            );
          })}
          {selectedTypes.size > 0 && (
            <button
              onClick={() => setSelectedTypes(new Set())}
              className="flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
            <p className="text-sm text-destructive">Failed to load history.</p>
            <p className="text-xs text-muted-foreground">
              Make sure you have an active session with recorded queries.
            </p>
          </div>
        )}

        {!isLoading && !isError && turns.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <History className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              {debouncedSearch || selectedTypes.size > 0
                ? "No results match your filters."
                : "No query history yet."}
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              {debouncedSearch || selectedTypes.size > 0
                ? "Try clearing filters or searching for something else."
                : "Run queries, charts, and forecasts — they'll appear here."}
            </p>
          </div>
        )}

        {!isLoading && turns.length > 0 && (
          <motion.div
            key={JSON.stringify(queryParams)}
            initial="hidden"
            animate="show"
            variants={stagger}
            className="space-y-2"
          >
            {turns.map((turn) => (
              <HistoryItem key={turn.turn_id} turn={turn} />
            ))}
          </motion.div>
        )}

        {/* Pagination */}
        {!isLoading && (hasPrev || hasMore) && (
          <div className="flex items-center justify-between pt-4 pb-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <p className="text-xs text-muted-foreground">
              {offset + 1}–{Math.min(offset + turns.length, total)} of {total.toLocaleString()}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
