"use client";

import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Topbar badge indicating that conversational memory is active for this
 * session. The backend maintains per-session turn history automatically;
 * this component is a passive status indicator only.
 */
export function MemoryContextIndicator() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      aria-label="Conversational memory active"
      title="Conversational memory active — the AI remembers context across your queries"
      disabled
    >
      <Brain className="h-4 w-4" />
    </Button>
  );
}
