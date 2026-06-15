import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ScheduledReportsWorkspace } from "@/components/reports/ScheduledReportsWorkspace";

export const metadata: Metadata = { title: "Scheduled Reports" };

export default function ScheduledReportsPage() {
  return (
    <AppShell>
      <ScheduledReportsWorkspace />
    </AppShell>
  );
}
