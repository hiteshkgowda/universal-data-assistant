import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { BriefingWorkspace } from "@/components/briefing/BriefingWorkspace";

export const metadata: Metadata = { title: "Executive Briefing" };

export default function BriefingPage() {
  return (
    <AppShell>
      <BriefingWorkspace />
    </AppShell>
  );
}
