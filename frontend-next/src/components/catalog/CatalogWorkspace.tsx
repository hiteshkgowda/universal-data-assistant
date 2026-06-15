"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Loader2,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listDatasets, getDatasetPreview } from "@/lib/api/datasets";
import { listConnections, listTables } from "@/lib/api/connections";
import { describeTable } from "@/lib/api/catalog";
import type {
  ConnectionMetadata,
  DatasetMetadata,
  DbColumn,
  ForeignKeyInfo,
  TableInfo,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const fadeIn: Variants = {
  hidden: { opacity: 0, x: -4 },
  show: { opacity: 1, x: 0, transition: { duration: 0.15 } },
};

const slideDown: Variants = {
  hidden: { opacity: 0, height: 0 },
  show: { opacity: 1, height: "auto", transition: { duration: 0.18 } },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectedItem =
  | { kind: "file"; dataset: DatasetMetadata }
  | { kind: "db"; connectionId: string; table: string; schema: string | null; datasetId?: string };

// ---------------------------------------------------------------------------
// Dtype badge
// ---------------------------------------------------------------------------

function TypeBadge({ type, numeric }: { type: string; numeric: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium font-mono",
        numeric
          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
          : "bg-muted/60 text-muted-foreground"
      )}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column table
// ---------------------------------------------------------------------------

function ColumnTable({ columns }: { columns: DbColumn[] }) {
  if (columns.length === 0)
    return <p className="text-sm text-muted-foreground">No columns found.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
              Column
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
              Type
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
              Numeric
            </th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => (
            <tr
              key={col.name}
              className={cn(
                "border-b border-border/40 last:border-0",
                i % 2 === 0 ? "bg-card/40" : "bg-muted/10"
              )}
            >
              <td className="px-3 py-2 font-mono text-xs text-foreground">
                {col.name}
              </td>
              <td className="px-3 py-2">
                <TypeBadge type={col.data_type} numeric={col.is_numeric} />
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {col.is_numeric ? "yes" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FK table
// ---------------------------------------------------------------------------

function ForeignKeyTable({ fks }: { fks: ForeignKeyInfo[] }) {
  if (fks.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No foreign key relationships found.
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
              Column(s)
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
              References
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
              Constraint
            </th>
          </tr>
        </thead>
        <tbody>
          {fks.map((fk, i) => (
            <tr
              key={i}
              className="border-b border-border/40 last:border-0 hover:bg-muted/20"
            >
              <td className="px-3 py-2 font-mono text-xs text-foreground">
                {fk.constrained_columns.join(", ")}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-primary">
                {fk.referred_schema
                  ? `${fk.referred_schema}.${fk.referred_table}`
                  : fk.referred_table}
                .{fk.referred_columns.join(", ")}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[140px]">
                {fk.name ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel for a DB table (registered or unregistered)
// ---------------------------------------------------------------------------

function DbTableDetail({
  connectionId,
  table,
  schema,
  datasetId,
}: {
  connectionId: string;
  table: string;
  schema: string | null;
  datasetId?: string;
}) {
  const [tab, setTab] = useState<"columns" | "relationships">("columns");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog-describe", connectionId, schema, table],
    queryFn: () => describeTable(connectionId, table, schema),
    staleTime: 60_000,
  });

  const displayName = schema ? `${schema}.${table}` : table;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Table2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground font-mono">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground">
              Database table
              {data && ` · ${data.columns.length} columns`}
            </p>
          </div>
        </div>
        {datasetId && (
          <Link
            href={`/datasets/${datasetId}/ask`}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open in Ask
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/60">
        {(["columns", "relationships"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
            {t === "relationships" && data && data.foreign_keys.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                {data.foreign_keys.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading schema…
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load table schema.</p>
      ) : data ? (
        tab === "columns" ? (
          <ColumnTable columns={data.columns} />
        ) : (
          <ForeignKeyTable fks={data.foreign_keys} />
        )
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel for a file dataset
// ---------------------------------------------------------------------------

function FileDatasetDetail({ dataset }: { dataset: DatasetMetadata }) {
  const [tab, setTab] = useState<"columns" | "relationships">("columns");

  const { data: preview, isLoading } = useQuery({
    queryKey: ["catalog-preview", dataset.id],
    queryFn: () => getDatasetPreview(dataset.id, 0),
    staleTime: 120_000,
  });

  const columns: DbColumn[] = dataset.column_names.map((name) => ({
    name,
    data_type: preview?.data_types?.[name] ?? "unknown",
    is_numeric: /int|float|numeric|decimal|double/i.test(
      preview?.data_types?.[name] ?? ""
    ),
  }));

  const Icon = dataset.file_type === "excel" ? FileSpreadsheet : FileText;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
            <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">
              {dataset.filename}
            </p>
            <p className="text-xs text-muted-foreground">
              {dataset.file_type?.toUpperCase() ?? "File"} ·{" "}
              {dataset.rows.toLocaleString()} rows · {dataset.columns} columns
            </p>
          </div>
        </div>
        <Link
          href={`/datasets/${dataset.id}/ask`}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open in Ask
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/60">
        {(["columns", "relationships"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "columns" ? (
        isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading column types…
          </div>
        ) : (
          <ColumnTable columns={columns} />
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          File datasets do not have foreign key relationships.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree: single connection section
// ---------------------------------------------------------------------------

function ConnectionSection({
  connection,
  datasets,
  selected,
  onSelect,
}: {
  connection: ConnectionMetadata;
  datasets: DatasetMetadata[];
  selected: SelectedItem | null;
  onSelect: (item: SelectedItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const { data: tableList, isLoading } = useQuery({
    queryKey: ["catalog-tables", connection.id],
    queryFn: () => listTables(connection.id),
    staleTime: 60_000,
  });

  // Map table key → registered dataset for quick lookup
  const registeredMap = new Map<string, DatasetMetadata>();
  for (const ds of datasets) {
    if (ds.connection_id === connection.id && ds.table_name) {
      const key = `${ds.db_schema ?? ""}::${ds.table_name}`;
      registeredMap.set(key, ds);
    }
  }

  const tables: TableInfo[] = tableList?.tables ?? [];

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors group"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground truncate flex-1 text-left">
          {connection.name}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0 uppercase tracking-wide">
          {connection.db_type}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="tables"
            variants={slideDown}
            initial="hidden"
            animate="show"
            exit="hidden"
            className="overflow-hidden ml-4 mt-0.5 space-y-0.5"
          >
            {isLoading ? (
              <p className="text-xs text-muted-foreground px-2 py-1">
                Loading tables…
              </p>
            ) : tables.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1">
                No tables found.
              </p>
            ) : (
              tables.map((t) => {
                const key = `${t.schema_name ?? ""}::${t.name}`;
                const ds = registeredMap.get(key);
                const isSelected =
                  selected?.kind === "db" &&
                  selected.connectionId === connection.id &&
                  selected.table === t.name &&
                  selected.schema === t.schema_name;

                return (
                  <button
                    key={key}
                    onClick={() =>
                      onSelect({
                        kind: "db",
                        connectionId: connection.id,
                        table: t.name,
                        schema: t.schema_name,
                        datasetId: ds?.id,
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1 rounded-md text-left transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/40 text-foreground"
                    )}
                  >
                    <Table2
                      className={cn(
                        "h-3 w-3 shrink-0",
                        isSelected ? "text-primary-foreground" : "text-muted-foreground"
                      )}
                    />
                    <span className="text-xs truncate font-mono flex-1">
                      {t.schema_name ? `${t.schema_name}.${t.name}` : t.name}
                    </span>
                    {ds && (
                      <span
                        className={cn(
                          "shrink-0 h-1.5 w-1.5 rounded-full",
                          isSelected ? "bg-primary-foreground" : "bg-primary"
                        )}
                        title="Registered as dataset"
                      />
                    )}
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree: file datasets section
// ---------------------------------------------------------------------------

function FileDatasetsSection({
  datasets,
  selected,
  onSelect,
}: {
  datasets: DatasetMetadata[];
  selected: SelectedItem | null;
  onSelect: (item: SelectedItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (datasets.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <FileText className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1 text-left">
          File Datasets
        </span>
        <span className="text-[10px] text-muted-foreground">{datasets.length}</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="files"
            variants={slideDown}
            initial="hidden"
            animate="show"
            exit="hidden"
            className="overflow-hidden ml-4 mt-0.5 space-y-0.5"
          >
            {datasets.map((ds) => {
              const isSelected =
                selected?.kind === "file" && selected.dataset.id === ds.id;
              const Icon =
                ds.file_type === "excel" ? FileSpreadsheet : FileText;
              return (
                <button
                  key={ds.id}
                  onClick={() => onSelect({ kind: "file", dataset: ds })}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1 rounded-md text-left transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/40 text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isSelected
                        ? "text-primary-foreground"
                        : "text-emerald-500"
                    )}
                  />
                  <span className="text-xs truncate flex-1">{ds.filename}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main workspace
// ---------------------------------------------------------------------------

export function CatalogWorkspace() {
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const { data: datasetsResp, isLoading: dsLoading } = useQuery({
    queryKey: ["datasets-list"],
    queryFn: listDatasets,
    staleTime: 30_000,
  });

  const { data: connections, isLoading: connLoading } = useQuery({
    queryKey: ["connections-list"],
    queryFn: listConnections,
    staleTime: 30_000,
  });

  const allDatasets = datasetsResp?.datasets ?? [];
  const fileDatasets = allDatasets.filter((d) => d.source === "file");
  const dbDatasets = allDatasets.filter((d) => d.source === "table");
  const allConnections = connections ?? [];

  const isLoading = dsLoading || connLoading;

  const totalTables =
    fileDatasets.length +
    dbDatasets.length; // approximate; full count comes after table expansion

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Tree panel ──────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-border/60 bg-card/50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border/60 px-3 py-3">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Data Catalog
          </span>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading catalog…
            </div>
          ) : (
            <>
              <FileDatasetsSection
                datasets={fileDatasets}
                selected={selected}
                onSelect={setSelected}
              />

              {allConnections.length > 0 && (
                <div className="pt-1 space-y-1">
                  <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Databases
                  </p>
                  {allConnections.map((conn) => (
                    <ConnectionSection
                      key={conn.id}
                      connection={conn}
                      datasets={dbDatasets}
                      selected={selected}
                      onSelect={setSelected}
                    />
                  ))}
                </div>
              )}

              {allDatasets.length === 0 && allConnections.length === 0 && (
                <div className="px-2 py-6 text-center space-y-2">
                  <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">
                    No datasets or connections yet.
                  </p>
                  <Link
                    href="/datasets"
                    className="text-xs text-primary hover:underline"
                  >
                    Upload a dataset →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer stats */}
        {!isLoading && (
          <div className="border-t border-border/60 px-3 py-2">
            <p className="text-[10px] text-muted-foreground">
              {allDatasets.length} dataset{allDatasets.length !== 1 ? "s" : ""}
              {" · "}
              {allConnections.length} connection
              {allConnections.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </aside>

      {/* ── Detail panel ──────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={
                selected.kind === "file"
                  ? selected.dataset.id
                  : `${selected.connectionId}::${selected.schema}::${selected.table}`
              }
              variants={fadeIn}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0 }}
              className="max-w-3xl"
            >
              {selected.kind === "file" ? (
                <FileDatasetDetail dataset={selected.dataset} />
              ) : (
                <DbTableDetail
                  connectionId={selected.connectionId}
                  table={selected.table}
                  schema={selected.schema}
                  datasetId={selected.datasetId}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              variants={fadeIn}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center text-center space-y-4 max-w-sm mx-auto"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
                <GitMerge className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Select a table or dataset
                </p>
                <p className="text-sm text-muted-foreground">
                  Choose any item from the tree to view its columns, data
                  types, and relationships.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
