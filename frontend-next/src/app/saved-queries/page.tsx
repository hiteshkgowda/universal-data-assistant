import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { SavedQueriesWorkspace } from "@/components/saved-queries/SavedQueriesWorkspace";

export const metadata: Metadata = { title: "Saved Queries" };

export default function SavedQueriesPage() {
  return (
    <AppShell>
      <SavedQueriesWorkspace />
    </AppShell>
  );
}
