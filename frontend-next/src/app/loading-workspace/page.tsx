"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WorkspaceLoader } from "@/components/branding/WorkspaceLoader";

function LoadingWorkspaceContent() {
  const params = useSearchParams();
  const raw = params.get("to") ?? "/";

  // Only allow internal paths — reject external URLs
  const destination = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return <WorkspaceLoader destination={destination} />;
}

export default function LoadingWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="h-8 w-8 animate-loader-pulse rounded-full bg-primary/40" />
        </div>
      }
    >
      <LoadingWorkspaceContent />
    </Suspense>
  );
}
