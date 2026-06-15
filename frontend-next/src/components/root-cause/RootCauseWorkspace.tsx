"use client";

import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  Loader2,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeRootCause } from "@/lib/api/root-cause";
import type { RootCauseResponse } from "@/lib/api/types";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.07 } },
};

function ContributionBar({ pct }: { pct: number }) {
  const abs = Math.min(Math.abs(pct), 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 0 ? "bg-emerald-500" : "bg-red-500"
        )}
        style={{ width: `${abs}%` }}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-40 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <Skeleton className="h-4 w-32 mb-3" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3.5 w-12" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface RootCauseWorkspaceProps {
  datasetId: string;
}

export function RootCauseWorkspace({ datasetId }: RootCauseWorkspaceProps) {
  const mutation = useMutation<RootCauseResponse, Error>({
    mutationFn: () =>
      analyzeRootCause({
        dataset_id: datasetId,
        question:
          "Why did the main metric change? Analyze all key dimensions and segment contributions.",
      }),
  });

  useEffect(() => {
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const data = mutation.data;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4 flex items-center gap-3">
        <Search className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Root Cause Analysis
        </h1>
        {data && !mutation.isPending && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 text-xs"
            onClick={() => mutation.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {mutation.isPending && <LoadingSkeleton />}

        {mutation.isError && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <AlertCircle className="h-8 w-8 text-destructive/60" />
            <p className="text-sm text-destructive">{mutation.error.message}</p>
            <Button size="sm" variant="outline" onClick={() => mutation.mutate()}>
              Try again
            </Button>
          </div>
        )}

        {data && !mutation.isPending && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="space-y-6"
          >
            {/* Overall change */}
            <motion.div
              variants={fadeUp}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <BarChart3 className="h-4 w-4 text-primary shrink-0" />
                <h2 className="text-sm font-semibold text-foreground">Overview</h2>
                <div className={cn(
                  "ml-auto flex items-center gap-1 text-sm font-semibold",
                  data.total_change_pct > 0 ? "text-emerald-600" : "text-red-500"
                )}>
                  {data.total_change_pct > 0
                    ? <TrendingUp className="h-4 w-4" />
                    : <TrendingDown className="h-4 w-4" />}
                  {data.total_change_pct > 0 ? "+" : ""}
                  {data.total_change_pct.toFixed(1)}% total change
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{data.problem}</p>
            </motion.div>

            {/* Root cause contributors */}
            {data.root_causes.length > 0 && (
              <motion.div
                variants={fadeUp}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Search className="h-4 w-4 text-primary" />
                  Top Contributors
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {data.root_causes.length} factors
                  </span>
                </h2>
                <div className="space-y-4">
                  {data.root_causes.map((rc, i) => (
                    <motion.div key={i} variants={fadeUp} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-4 shrink-0 font-bold text-muted-foreground">
                          #{rc.rank}
                        </span>
                        <span className="font-medium text-foreground truncate">
                          {rc.dimension}
                          <span className="text-muted-foreground font-normal"> · {rc.value}</span>
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "ml-auto shrink-0 text-[10px] font-semibold",
                            rc.contribution_pct > 0
                              ? "border-emerald-200 text-emerald-700"
                              : "border-red-200 text-red-600"
                          )}
                        >
                          {rc.contribution_pct > 0 ? "+" : ""}
                          {rc.contribution_pct.toFixed(1)}%
                        </Badge>
                      </div>
                      <ContributionBar pct={rc.contribution_pct} />
                      {rc.description && (
                        <p className="pl-6 text-[11px] text-muted-foreground">{rc.description}</p>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recommendations */}
            {data.recommendations.length > 0 && (
              <motion.div
                variants={fadeUp}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Search className="h-4 w-4 text-primary" />
                  Recommendations
                </h2>
                <ul className="space-y-2">
                  {data.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="text-muted-foreground">{rec}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Re-run loading */}
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reanalysing…
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
