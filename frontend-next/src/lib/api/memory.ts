import { api } from "./client";
import type {
  ConversationContext,
  MemoryClearResponse,
  QueryHistoryResponse,
} from "./types";

const PREFIX = "/api/v1";

export async function getQueryHistory(params: {
  search?: string;
  turn_types?: string[];
  dataset_id?: string;
  limit?: number;
  offset?: number;
}): Promise<QueryHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.turn_types?.length) {
    params.turn_types.forEach((t) => qs.append("turn_types", t));
  }
  if (params.dataset_id) qs.set("dataset_id", params.dataset_id);
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  return api.get<QueryHistoryResponse>(`${PREFIX}/memory/history?${qs.toString()}`);
}

export async function getSessionContext(
  sessionId: string
): Promise<ConversationContext> {
  return api.get<ConversationContext>(
    `${PREFIX}/memory/context?session_id=${encodeURIComponent(sessionId)}`
  );
}

export async function clearSession(
  sessionId: string
): Promise<MemoryClearResponse> {
  return api.delete<MemoryClearResponse>(
    `${PREFIX}/memory/clear?session_id=${encodeURIComponent(sessionId)}`
  );
}
