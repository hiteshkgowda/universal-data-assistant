/**
 * Lightweight localStorage store for alert history snapshots.
 * Keeps the last MAX_PER_DATASET scans per dataset. No backend required.
 */

import type { KPIAlert, KPIRecommendation, KPIHealth } from "@/lib/api/types";

export interface AlertSnapshot {
  timestamp: string; // ISO 8601
  dataset_id: string;
  dataset_filename: string;
  overall_health: KPIHealth;
  alert_count: number;
  critical_count: number;
  warning_count: number;
  healthy_count: number;
  alerts: KPIAlert[];
  recommendations: KPIRecommendation[];
  anomaly_count: number;
  anomaly_severity: string;
}

const STORAGE_KEY = "uda_alert_history_v1";
const MAX_PER_DATASET = 10;

function readAll(): Record<string, AlertSnapshot[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, AlertSnapshot[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded — silently ignore
  }
}

export const AlertHistoryStore = {
  push(snapshot: AlertSnapshot): void {
    const all = readAll();
    const existing = all[snapshot.dataset_id] ?? [];
    const updated = [snapshot, ...existing].slice(0, MAX_PER_DATASET);
    all[snapshot.dataset_id] = updated;
    writeAll(all);
  },

  list(datasetId: string): AlertSnapshot[] {
    return readAll()[datasetId] ?? [];
  },

  allDatasetIds(): string[] {
    return Object.keys(readAll());
  },

  clearDataset(datasetId: string): void {
    const all = readAll();
    delete all[datasetId];
    writeAll(all);
  },
};
