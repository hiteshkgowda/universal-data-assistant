"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { shareDashboard, revokeDashboardShare } from "@/lib/api/dashboards";

interface Props {
  dashboardId: string;
  initialToken?: string | null;
  onClose: () => void;
  onTokenChange?: (token: string | null) => void;
}

export function ShareModal({
  dashboardId,
  initialToken,
  onClose,
  onTokenChange,
}: Props) {
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [shareUrl, setShareUrl] = useState<string | null>(
    initialToken
      ? `${window.location.origin}/dashboards/shared/${initialToken}`
      : null
  );
  const [copied, setCopied] = useState(false);

  const shareMutation = useMutation({
    mutationFn: () => shareDashboard(dashboardId),
    onSuccess: (data) => {
      setToken(data.share_token);
      const url = `${window.location.origin}/dashboards/shared/${data.share_token}`;
      setShareUrl(url);
      onTokenChange?.(data.share_token);
      toast.success("Share link created");
    },
    onError: (err: Error) => toast.error(`Share failed: ${err.message}`),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeDashboardShare(dashboardId),
    onSuccess: () => {
      setToken(null);
      setShareUrl(null);
      onTokenChange?.(null);
      toast.success("Share link revoked");
    },
    onError: (err: Error) => toast.error(`Revoke failed: ${err.message}`),
  });

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  const busy = shareMutation.isPending || revokeMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-2xl p-6 space-y-5"
      >
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Link2 className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Share dashboard
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <AnimatePresence mode="wait">
          {token ? (
            <motion.div
              key="shared"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                Anyone with this link can view the dashboard — no account required.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <span className="flex-1 text-xs text-foreground truncate font-mono">
                  {shareUrl}
                </span>
                <button
                  onClick={handleCopy}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy link"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1"
                  onClick={handleCopy}
                  disabled={busy}
                >
                  {copied ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => revokeMutation.mutate()}
                  disabled={busy}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  {revokeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Revoke"
                  )}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="unshared"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                Generate a public link so anyone can view this dashboard without
                signing in. You can revoke it at any time.
              </p>
              <Button
                className="w-full"
                onClick={() => shareMutation.mutate()}
                disabled={busy}
              >
                {shareMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                {shareMutation.isPending ? "Generating link…" : "Create share link"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
