"use client";

import { useState } from "react";
import { Calendar, Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeleteSchedule } from "@/hooks/use-scheduled-reports";
import type { ScheduledReport } from "@/lib/api/types";

const FREQ_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const DOW_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function nextRunLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function scheduleDetail(s: ScheduledReport): string {
  const h = `${String(s.hour).padStart(2, "0")}:00 UTC`;
  if (s.frequency === "daily") return `Every day at ${h}`;
  if (s.frequency === "weekly" && s.day_of_week !== null)
    return `Every ${DOW_LABEL[s.day_of_week]} at ${h}`;
  if (s.frequency === "monthly" && s.day_of_month !== null)
    return `Day ${s.day_of_month} of every month at ${h}`;
  return h;
}

interface Props {
  schedule: ScheduledReport;
  onEdit: (s: ScheduledReport) => void;
}

export function ScheduleCard({ schedule, onEdit }: Props) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteSchedule();

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-3 hover:border-border/70 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground truncate">
            {schedule.dataset_filename}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{scheduleDetail(schedule)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(schedule)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {confirming ? (
            <div className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs px-2"
                disabled={del.isPending}
                onClick={() => del.mutate(schedule.schedule_id)}
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1 text-xs">
          <Calendar className="h-3 w-3" />
          {FREQ_LABEL[schedule.frequency]}
        </Badge>
        <Badge
          variant={schedule.enabled ? "default" : "outline"}
          className="text-xs"
        >
          {schedule.enabled ? "Active" : "Paused"}
        </Badge>
        {schedule.questions.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {schedule.questions.length} Q&amp;A{schedule.questions.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Next run */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" />
        <span>
          {schedule.last_run_at ? "Last ran" : "First run"}:{" "}
          <span className="text-foreground">
            {nextRunLabel(schedule.last_run_at ?? schedule.next_run_at)}
          </span>
        </span>
      </div>
      {schedule.last_run_at && (
        <p className="text-xs text-muted-foreground">
          Next: <span className="text-foreground">{nextRunLabel(schedule.next_run_at)}</span>
        </p>
      )}
    </div>
  );
}
