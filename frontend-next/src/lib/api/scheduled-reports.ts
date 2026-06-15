import { api } from "./client";
import type {
  ScheduledReport,
  ScheduledReportCreate,
  ScheduledReportListResponse,
} from "./types";

const PREFIX = "/api/v1/reports/scheduled";

export async function listSchedules(): Promise<ScheduledReportListResponse> {
  return api.get<ScheduledReportListResponse>(PREFIX);
}

export async function createSchedule(
  body: ScheduledReportCreate
): Promise<ScheduledReport> {
  return api.post<ScheduledReport>(PREFIX, body);
}

export async function updateSchedule(
  scheduleId: string,
  body: ScheduledReportCreate
): Promise<ScheduledReport> {
  return api.put<ScheduledReport>(`${PREFIX}/${scheduleId}`, body);
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  return api.delete<void>(`${PREFIX}/${scheduleId}`);
}
