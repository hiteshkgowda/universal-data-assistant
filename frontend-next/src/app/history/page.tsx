import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { HistoryWorkspace } from "@/components/history/HistoryWorkspace";

export const metadata: Metadata = { title: "Query History" };

export default function HistoryPage() {
  return (
    <AppShell>
      <HistoryWorkspace />
    </AppShell>
  );
}
