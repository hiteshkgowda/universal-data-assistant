"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  Bookmark,
  CalendarDays,
  Check,
  Database,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { listDatasets } from "@/lib/api/datasets";
import {
  deleteSavedQuery,
  listSavedQueries,
  renameQuery,
  saveQuery,
} from "@/lib/api/saved-queries";
import { askQuestion } from "@/lib/api/chart";
import { PlotlyChart } from "@/components/ask/PlotlyChart";
import { formatRelativeTime } from "@/lib/format";
import type { ChartResponse, SavedQuery } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.05 } },
};

// ---------------------------------------------------------------------------
// Save Form
// ---------------------------------------------------------------------------

function SaveForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [question, setQuestion] = useState("");

  const { data: datasetsResp, isLoading: datasetsLoading } = useQuery({
    queryKey: ["datasets-list"],
    queryFn: listDatasets,
    staleTime: 30_000,
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const ds = datasetsResp?.datasets.find((d) => d.id === datasetId);
      return saveQuery({
        name: name.trim(),
        dataset_id: datasetId,
        dataset_filename: ds?.filename ?? datasetId,
        question: question.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Query saved");
      setName("");
      setDatasetId("");
      setQuestion("");
      setOpen(false);
      onSaved();
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const canSave =
    name.trim().length > 0 &&
    datasetId.length > 0 &&
    question.trim().length > 0 &&
    !saveMutation.isPending;

  return (
    <div className="rounded-xl border border-border/60 bg-card/70">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors rounded-xl"
      >
        <Plus className="h-4 w-4 text-primary" aria-hidden />
        Save a new query
        <span className="ml-auto text-muted-foreground/60 text-xs">
          {open ? "cancel" : "expand"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Query name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Monthly revenue by region"
                  className={cn(
                    "w-full rounded-lg border border-border/60 bg-card/60 px-3 py-2",
                    "text-sm text-foreground placeholder:text-muted-foreground/50",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Dataset
                </label>
                {datasetsLoading ? (
                  <div className="h-9 rounded-lg bg-muted/40 animate-pulse" />
                ) : (
                  <select
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    className={cn(
                      "w-full rounded-lg border border-border/60 bg-card/60 px-3 py-2",
                      "text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    )}
                  >
                    <option value="">Select a dataset…</option>
                    {datasetsResp?.datasets.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.filename}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Question
                </label>
                <textarea
                  rows={2}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What do you want to ask?"
                  className={cn(
                    "w-full resize-none rounded-lg border border-border/60 bg-card/60 px-3 py-2",
                    "text-sm text-foreground placeholder:text-muted-foreground/50",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                  )}
                />
              </div>

              <Button
                size="sm"
                disabled={!canSave}
                onClick={() => saveMutation.mutate()}
                className="w-full"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bookmark className="mr-2 h-3.5 w-3.5" />
                )}
                {saveMutation.isPending ? "Saving…" : "Save Query"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panel shown below a card after re-run
// ---------------------------------------------------------------------------

function ResultPanel({ result }: { result: ChartResponse }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-3">
        {result.answer && (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {result.answer}
          </p>
        )}

        {result.chart_spec && (
          <PlotlyChart spec={result.chart_spec} />
        )}

        {result.table_data.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  {Object.keys(result.table_data[0]).map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.table_data.slice(0, 5).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                  >
                    {Object.values(row).map((cell, j) => (
                      <td
                        key={j}
                        className="px-3 py-2 text-foreground whitespace-nowrap"
                      >
                        {String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {result.table_data.length > 5 && (
              <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border/40">
                Showing 5 of {result.table_data.length} rows
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          {result.total_time_ms}ms
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Single query card
// ---------------------------------------------------------------------------

function QueryCard({ query }: { query: SavedQuery }) {
  const queryClient = useQueryClient();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(query.name);
  const [result, setResult] = useState<ChartResponse | null>(null);
  const [showResult, setShowResult] = useState(false);

  const renameMutation = useMutation({
    mutationFn: () => renameQuery(query.query_id, renameValue.trim()),
    onSuccess: () => {
      setIsRenaming(false);
      queryClient.invalidateQueries({ queryKey: ["saved-queries"] });
      toast.success("Renamed");
    },
    onError: (err: Error) => toast.error(`Rename failed: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSavedQuery(query.query_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-queries"] });
      toast.success("Deleted");
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const rerunMutation = useMutation({
    mutationFn: () =>
      askQuestion({ dataset_id: query.dataset_id, question: query.question }),
    onSuccess: (data) => {
      setResult(data);
      setShowResult(true);
    },
    onError: (err: Error) => toast.error(`Re-run failed: ${err.message}`),
  });

  function commitRename() {
    if (renameValue.trim() && renameValue.trim() !== query.name) {
      renameMutation.mutate();
    } else {
      setIsRenaming(false);
      setRenameValue(query.name);
    }
  }

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border/60 bg-card/70 overflow-hidden"
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
          <Bookmark className="h-4 w-4 text-primary" aria-hidden />
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          {isRenaming ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setIsRenaming(false);
                    setRenameValue(query.name);
                  }
                }}
                className={cn(
                  "flex-1 rounded border border-primary/40 bg-card/80 px-2 py-0.5",
                  "text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                )}
              />
              <button
                onClick={commitRename}
                disabled={renameMutation.isPending}
                className="text-primary hover:text-primary/80 transition-colors"
                aria-label="Confirm rename"
              >
                {renameMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => {
                  setIsRenaming(false);
                  setRenameValue(query.name);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cancel rename"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-foreground truncate">
              {query.name}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              {query.dataset_filename}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {formatRelativeTime(query.created_at)}
            </span>
          </div>

          <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1">
            {query.question}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => {
              setIsRenaming(true);
              setRenameValue(query.name);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            aria-label="Rename query"
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => rerunMutation.mutate()}
            disabled={rerunMutation.isPending}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label="Re-run query"
            title="Re-run"
          >
            {rerunMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            onClick={() => {
              if (confirm(`Delete "${query.name}"?`)) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Delete query"
            title="Delete"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>

          {result && (
            <button
              onClick={() => setShowResult((v) => !v)}
              className="text-[11px] text-primary hover:underline px-1"
            >
              {showResult ? "Hide" : "Show"} result
            </button>
          )}
        </div>
      </div>

      {/* Result panel */}
      <AnimatePresence initial={false}>
        {showResult && result && (
          <ResultPanel key="result" result={result} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main workspace
// ---------------------------------------------------------------------------

export function SavedQueriesWorkspace() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["saved-queries"],
    queryFn: listSavedQueries,
    staleTime: 30_000,
  });

  const queries = data?.queries ?? [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Bookmark className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Saved Queries</h1>
          <p className="text-sm text-muted-foreground">
            {queries.length} saved {queries.length !== 1 ? "queries" : "query"}
          </p>
        </div>
      </div>

      {/* Save form */}
      <SaveForm
        onSaved={() =>
          queryClient.invalidateQueries({ queryKey: ["saved-queries"] })
        }
      />

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-[88px] rounded-xl bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border/60 bg-card/60 p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Failed to load saved queries
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : queries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-12 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 mx-auto">
            <Bookmark className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              No saved queries yet
            </p>
            <p className="text-sm text-muted-foreground">
              Save a question and dataset to quickly re-run it any time
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {queries.map((q) => (
            <QueryCard key={q.query_id} query={q} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
