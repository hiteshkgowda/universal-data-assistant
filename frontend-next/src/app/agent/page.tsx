import { AppShell } from "@/components/layout/AppShell";
import { AgentWorkspace } from "@/components/agent/AgentWorkspace";

export const metadata = { title: "Agent — DataPilot AI" };

export default function AgentPage() {
  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <AgentWorkspace />
    </AppShell>
  );
}
