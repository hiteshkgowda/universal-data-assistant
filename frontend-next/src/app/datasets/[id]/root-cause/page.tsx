import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { RootCauseWorkspace } from "@/components/root-cause/RootCauseWorkspace";

export const metadata: Metadata = { title: "Root Cause Analysis" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RootCausePage({ params }: Props) {
  const { id } = await params;

  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <RootCauseWorkspace datasetId={id} />
    </AppShell>
  );
}
