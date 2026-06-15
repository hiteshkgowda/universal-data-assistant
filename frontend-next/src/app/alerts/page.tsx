import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { AlertCenterWorkspace } from "@/components/alerts/AlertCenterWorkspace";

export const metadata: Metadata = { title: "Alert Center" };

export default function AlertsPage() {
  return (
    <AppShell>
      <AlertCenterWorkspace />
    </AppShell>
  );
}
