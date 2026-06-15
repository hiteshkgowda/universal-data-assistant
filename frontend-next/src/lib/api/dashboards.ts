import { api, BASE_URL, LLM_TIMEOUT_MS } from "./client";
import type {
  DashboardConfig,
  DashboardListResponse,
  GenerateDashboardRequest,
  GenerateDashboardResponse,
  SaveDashboardRequest,
  SaveDashboardResponse,
  ShareDashboardResponse,
} from "./types";

const PREFIX = "/api/v1";

export async function generateDashboard(
  request: GenerateDashboardRequest
): Promise<GenerateDashboardResponse> {
  return api.post<GenerateDashboardResponse>(
    `${PREFIX}/dashboards/generate`,
    request,
    { timeoutMs: LLM_TIMEOUT_MS }
  );
}

export async function saveDashboard(
  request: SaveDashboardRequest
): Promise<SaveDashboardResponse> {
  return api.post<SaveDashboardResponse>(`${PREFIX}/dashboards/save`, request);
}

export async function getDashboard(id: string): Promise<DashboardConfig> {
  return api.get<DashboardConfig>(`${PREFIX}/dashboards/${id}`);
}

export async function listDashboards(): Promise<DashboardListResponse> {
  return api.get<DashboardListResponse>(`${PREFIX}/dashboards`);
}

export async function shareDashboard(
  dashboardId: string
): Promise<ShareDashboardResponse> {
  return api.post<ShareDashboardResponse>(
    `${PREFIX}/dashboards/${dashboardId}/share`
  );
}

export async function revokeDashboardShare(dashboardId: string): Promise<void> {
  return api.delete<void>(`${PREFIX}/dashboards/${dashboardId}/share`);
}

export async function getSharedDashboard(
  token: string
): Promise<DashboardConfig> {
  const res = await fetch(`${BASE_URL}${PREFIX}/dashboards/shared/${token}`, {
    credentials: "omit",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<DashboardConfig>;
}
