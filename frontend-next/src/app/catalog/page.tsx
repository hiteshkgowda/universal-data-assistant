import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { CatalogWorkspace } from "@/components/catalog/CatalogWorkspace";

export const metadata: Metadata = { title: "Data Catalog" };

export default function CatalogPage() {
  return (
    <AppShell mainClassName="overflow-hidden p-0">
      <CatalogWorkspace />
    </AppShell>
  );
}
