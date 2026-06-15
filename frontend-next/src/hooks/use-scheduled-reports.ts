"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from "@/lib/api/scheduled-reports";
import type { ScheduledReport, ScheduledReportCreate } from "@/lib/api/types";

const QK = ["scheduled-reports"] as const;

export function useScheduledReports() {
  return useQuery({
    queryKey: QK,
    queryFn: listSchedules,
    staleTime: 15_000,
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduledReport, Error, ScheduledReportCreate>({
    mutationFn: createSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Schedule created");
    },
    onError: (err) => toast.error("Failed to create schedule", { description: err.message }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduledReport, Error, { id: string; body: ScheduledReportCreate }>({
    mutationFn: ({ id, body }) => updateSchedule(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Schedule updated");
    },
    onError: (err) => toast.error("Failed to update schedule", { description: err.message }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Schedule deleted");
    },
    onError: (err) => toast.error("Failed to delete schedule", { description: err.message }),
  });
}
