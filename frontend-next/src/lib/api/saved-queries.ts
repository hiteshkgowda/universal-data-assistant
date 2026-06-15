import { api, apiFetch } from "./client";
import type { SavedQuery, SavedQueryListResponse } from "./types";

const PREFIX = "/api/v1/saved-queries";

export async function saveQuery(body: {
  name: string;
  dataset_id: string;
  dataset_filename: string;
  question: string;
}): Promise<SavedQuery> {
  return api.post<SavedQuery>(PREFIX, body);
}

export async function listSavedQueries(): Promise<SavedQueryListResponse> {
  return api.get<SavedQueryListResponse>(PREFIX);
}

export async function renameQuery(
  queryId: string,
  name: string
): Promise<SavedQuery> {
  return apiFetch<SavedQuery>(`${PREFIX}/${queryId}/rename`, {
    method: "PATCH",
    body: { name },
  });
}

export async function deleteSavedQuery(queryId: string): Promise<void> {
  return api.delete<void>(`${PREFIX}/${queryId}`);
}
