"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScheduledReports } from "@/hooks/use-scheduled-reports";
import { useDatasets } from "@/hooks/use-datasets";
import { ScheduleCard } from "./ScheduleCard";
import { ScheduleForm } from "./ScheduleForm";
import type { ScheduledReport } from "@/lib/api/types";

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/30 bg-card/40 p-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

export function ScheduledReportsWorkspace() {
  const { data: scheduleData, isLoading: schedulesLoading } = useScheduledReports();
  const { data: datasetData, isLoading: datasetsLoading } = useDatasets();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);

  const schedules = scheduleData?.schedules ?? [];
  const datasets = datasetData?.datasets ?? [];
  const isLoading = schedulesLoading || datasetsLoading;

  function handleEdit(s: ScheduledReport) {
    setEditing(s);
    setShowForm(true);
  }

  function handleDone() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Scheduled Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reports generated automatically on your chosen schedule and saved to your report library.
          </p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => { setEditing(null); setShowForm(true); }}
          >
            <Plus className="h-4 w-4" />
            New schedule
          </Button>
        )}
      </div>

      {/* Form panel */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border/50 bg-card/60 p-6"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">
              {editing ? "Edit schedule" : "New schedule"}
            </h3>
            <ScheduleForm
              datasets={datasets}
              editing={editing}
              onDone={handleDone}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {isLoading ? (
        <SkeletonGrid />
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <CalendarClock className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No schedules yet</p>
          <p className="text-xs text-muted-foreground/70">
            Create a schedule to generate reports automatically every day, week, or month.
          </p>
        </div>
      ) : (
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {schedules.map((s) => (
            <motion.div key={s.schedule_id} variants={itemVariants}>
              <ScheduleCard schedule={s} onEdit={handleEdit} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
