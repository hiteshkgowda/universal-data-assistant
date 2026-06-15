import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { InsightWorkspace } from "@/components/insights/InsightWorkspace";

export const metadata: Metadata = { title: "AI Insights" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InsightsPage({ params }: Props) {
  const { id } = await params;

  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <InsightWorkspace datasetId={id} />
    </AppShell>
  );
}
