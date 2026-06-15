import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { AgentTraceWorkspace } from "@/components/agent/AgentTraceWorkspace";

export const metadata: Metadata = { title: "Agent Trace Viewer" };

export default function AgentTracePage() {
  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <Suspense>
        <AgentTraceWorkspace />
      </Suspense>
    </AppShell>
  );
}
