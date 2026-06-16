"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface WorkspaceLoaderProps {
  destination: string;
}

// ── Step timing (ms) ──────────────────────────────────────────────────────

const STEPS = [
  { label: "Authenticating session",       completeAt: 400  },
  { label: "Loading workspace",            completeAt: 850  },
  { label: "Initializing AI agents",       completeAt: 1300 },
  { label: "Preparing analytics environment", completeAt: 1750 },
] as const;

const REDIRECT_AT = 2250;

// ── Animation variants ────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const logoVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1 },
};

const textVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// ── Step icon ─────────────────────────────────────────────────────────────

function StepIcon({ state }: { state: "pending" | "active" | "complete" }) {
  if (state === "complete") {
    return (
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 18 }}
        className="flex h-5 w-5 shrink-0 items-center justify-center"
      >
        <CheckCircle2 className="h-[18px] w-[18px] text-success" />
      </motion.span>
    );
  }

  if (state === "active") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute h-4 w-4 rounded-full border-2 border-primary/30 animate-ping" />
        <Circle className="h-[14px] w-[14px] text-primary/70 relative z-10" />
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <Circle className="h-[14px] w-[14px] text-muted-foreground/30" />
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function WorkspaceLoader({ destination }: WorkspaceLoaderProps) {
  const router = useRouter();
  const [completedCount, setCompletedCount] = useState(0);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    // Complete each step at its scheduled time
    STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setCompletedCount(i + 1);
      }, step.completeAt);
      timersRef.current.push(t);
    });

    // Redirect after all steps
    const redirectTimer = setTimeout(() => {
      router.replace(destination);
    }, REDIRECT_AT);
    timersRef.current.push(redirectTimer);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [destination, router]);

  // Progress bar fill: fraction of REDIRECT_AT elapsed
  // We approximate with CSS transition on a fixed duration
  const progressDuration = REDIRECT_AT / 1000;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      transition={{ duration: 0.4 }}
      className="relative min-h-screen flex flex-col items-center justify-center bg-background overflow-hidden px-6"
      aria-label="Loading workspace"
    >
      {/* Background depth — matches left panel glow style */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full opacity-[0.055]"
        style={{ background: "radial-gradient(circle, hsl(148 46% 42%) 0%, transparent 65%)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, hsl(148 46% 42%) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      {/* Content card */}
      <div className="relative w-full max-w-xs text-center space-y-8">

        {/* Logo + brand */}
        <div className="flex flex-col items-center gap-4">
          <motion.div
            variants={logoVariants}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.05 }}
            className="relative"
          >
            {/* Outer glow ring */}
            <span
              className="absolute inset-0 rounded-2xl opacity-30"
              style={{
                boxShadow: "0 0 0 8px hsl(148 46% 42% / 0.15), 0 0 32px hsl(148 46% 42% / 0.12)",
              }}
              aria-hidden="true"
            />
            <Image
              src="/logo.png"
              alt="DataPilot AI"
              width={64}
              height={64}
              className="rounded-2xl relative z-10"
              priority
            />
          </motion.div>

          <motion.div
            variants={textVariants}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="space-y-1"
          >
            <h1 className="font-display text-xl font-semibold text-foreground tracking-tight">
              DataPilot AI
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              Agentic Business Intelligence Copilot
            </p>
          </motion.div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border/60 mx-4" aria-hidden="true" />

        {/* Progress steps */}
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading progress"
          className="space-y-3"
        >
          {STEPS.map((step, i) => {
            const state =
              i < completedCount ? "complete" :
              i === completedCount ? "active" :
              "pending";

            return (
              <div
                key={step.label}
                className={cn(
                  "flex items-center gap-3 text-left transition-colors duration-300",
                  state === "complete" && "text-foreground",
                  state === "active"   && "text-foreground/70",
                  state === "pending"  && "text-muted-foreground/35",
                )}
              >
                <StepIcon state={state} />
                <span
                  className={cn(
                    "text-sm transition-all duration-300",
                    state === "complete" && "font-medium",
                    state === "active"   && "font-normal",
                    state === "pending"  && "font-normal",
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-px bg-border/60 mx-4" aria-hidden="true" />

        {/* Progress bar */}
        <div
          className="h-0.5 w-full rounded-full bg-border/50 overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-primary/70"
            style={{
              width: "100%",
              transform: "scaleX(0)",
              transformOrigin: "left",
              transition: `transform ${progressDuration}s linear`,
              animation: `none`,
            }}
            ref={(el) => {
              if (el) {
                // Force reflow then animate
                requestAnimationFrame(() => {
                  el.style.transform = "scaleX(1)";
                });
              }
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
