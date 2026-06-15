"use client";

import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { generateInsights } from "@/lib/api/insights";
import type { InsightResponse } from "@/lib/api/types";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.07 } },
};

function InsightCard({ text, index }: { text: string; index: number }) {
  return (
    <motion.div
      variants={fadeUp}
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
        {index + 1}
      </span>
      <p className="text-sm text-foreground leading-relaxed">{text}</p>
    </motion.div>
  );
}

function TrendBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}

function RecommendationRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-border/50 last:border-0 text-sm">
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-5/6 mb-2" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-28 mb-3" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    </div>
  );
}

interface InsightWorkspaceProps {
  datasetId: string;
}

export function InsightWorkspace({ datasetId }: InsightWorkspaceProps) {
  const mutation = useMutation<InsightResponse, Error>({
    mutationFn: () =>
      generateInsights({
        dataset_id: datasetId,
        question:
          "What are the key insights, trends, patterns, and strategic opportunities in this dataset?",
      }),
  });

  useEffect(() => {
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight text-foreground">AI Insights</h1>
        {mutation.data && !mutation.isPending && (
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

        {mutation.data && !mutation.isPending && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="space-y-6"
          >
            {/* Generation time */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                mutation.data.cache_hit
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
              )}>
                {mutation.data.cache_hit ? "Cached" : "Live"}
              </span>
              Generated in {mutation.data.generation_time_ms.toFixed(0)} ms
            </div>

            {/* Summary */}
            {mutation.data.summary && (
              <motion.div
                variants={fadeUp}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Executive Summary
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {mutation.data.summary}
                </p>
              </motion.div>
            )}

            {/* Key Insights */}
            {mutation.data.key_insights.length > 0 && (
              <motion.div variants={fadeUp}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Key Insights
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {mutation.data.key_insights.length} findings
                  </span>
                </h2>
                <motion.div variants={stagger} className="space-y-2.5">
                  {mutation.data.key_insights.map((insight, i) => (
                    <InsightCard key={i} text={insight} index={i} />
                  ))}
                </motion.div>
              </motion.div>
            )}

            {/* Trends */}
            {mutation.data.trends.length > 0 && (
              <motion.div
                variants={fadeUp}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Trends
                </h2>
                <div className="space-y-2">
                  {mutation.data.trends.map((trend, i) => (
                    <TrendBadge key={i} text={trend} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recommendations */}
            {mutation.data.recommendations.length > 0 && (
              <motion.div
                variants={fadeUp}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Recommendations
                </h2>
                <div>
                  {mutation.data.recommendations.map((rec, i) => (
                    <RecommendationRow key={i} text={rec} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Loading indicator for re-runs */}
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Regenerating…
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
