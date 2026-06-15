import { api } from "./client";
import type { TableSchemaResponse } from "./types";

const CONNECTIONS_PREFIX = "/api/v1/connections";

export async function describeTable(
  connectionId: string,
  table: string,
  schema?: string | null
): Promise<TableSchemaResponse> {
  const params = new URLSearchParams({ table });
  if (schema) params.set("schema", schema);
  return api.get<TableSchemaResponse>(
    `${CONNECTIONS_PREFIX}/${connectionId}/describe?${params.toString()}`
  );
}
