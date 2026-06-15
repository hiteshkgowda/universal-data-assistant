"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  Activity,
  ArrowRight,
  DollarSign,
  Megaphone,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  max_kpis: number;
  max_charts: number;
  kpiHints: string[];
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: "sales",
    name: "Sales",
    description: "Revenue trends, order volume, customer acquisition, and top product performance.",
    prompt:
      "Create a sales performance dashboard showing revenue trends, order volume by category, top customers, and customer acquisition metrics.",
    max_kpis: 6,
    max_charts: 4,
    kpiHints: ["Revenue", "Orders", "Customers", "Conversion"],
  },
  {
    id: "finance",
    name: "Finance",
    description: "Profit margins, cost analysis, income, earnings, and budget tracking.",
    prompt:
      "Create a financial overview dashboard with profit margins, cost analysis, income, earnings, and budget tracking metrics.",
    max_kpis: 6,
    max_charts: 4,
    kpiHints: ["Profit", "Revenue", "Cost", "Margin"],
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "Conversion rates, campaign spend, sessions, CTR, and customer acquisition cost.",
    prompt:
      "Create a marketing analytics dashboard featuring conversion rates, campaign spend, click-through rates, sessions, impressions, and customer acquisition cost.",
    max_kpis: 6,
    max_charts: 4,
    kpiHints: ["Conversions", "Sessions", "CTR", "CAC"],
  },
  {
    id: "operations",
    name: "Operations",
    description: "Transaction volume, processing costs, quality scores, and throughput efficiency.",
    prompt:
      "Create an operations efficiency dashboard with transaction volume, processing costs, quality scores, unit counts, and operational spend.",
    max_kpis: 6,
    max_charts: 4,
    kpiHints: ["Volume", "Cost", "Units", "Score"],
  },
];

// ---------------------------------------------------------------------------
// Visual config per template
// ---------------------------------------------------------------------------

const TEMPLATE_VISUAL: Record<
  string,
  { icon: React.ElementType; accent: string; bg: string; border: string }
> = {
  sales: {
    icon: TrendingUp,
    accent: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200/60 dark:border-emerald-700/40 hover:border-emerald-400/60",
  },
  finance: {
    icon: DollarSign,
    accent: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200/60 dark:border-blue-700/40 hover:border-blue-400/60",
  },
  marketing: {
    icon: Megaphone,
    accent: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    border: "border-purple-200/60 dark:border-purple-700/40 hover:border-purple-400/60",
  },
  operations: {
    icon: Activity,
    accent: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-200/60 dark:border-orange-700/40 hover:border-orange-400/60",
  },
};

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

// ---------------------------------------------------------------------------
// Single template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onSelect,
  selected,
}: {
  template: DashboardTemplate;
  onSelect: (t: DashboardTemplate) => void;
  selected: boolean;
}) {
  const visual = TEMPLATE_VISUAL[template.id] ?? TEMPLATE_VISUAL.sales;
  const Icon = visual.icon;

  return (
    <motion.button
      variants={fadeUp}
      onClick={() => onSelect(template)}
      className={cn(
        "group w-full text-left rounded-xl border bg-card/70 p-4 transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        visual.border,
        selected && "ring-2 ring-primary/40 border-primary/50 bg-primary/5"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            visual.bg
          )}
        >
          <Icon className={cn("h-4 w-4", visual.accent)} aria-hidden />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">
              {template.name}
            </span>
            <ArrowRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-colors",
                selected ? "text-primary" : "text-muted-foreground/30 group-hover:text-muted-foreground/70"
              )}
              aria-hidden
            />
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {template.description}
          </p>

          <div className="flex flex-wrap gap-1 pt-0.5">
            {template.kpiHints.map((hint) => (
              <span
                key={hint}
                className={cn(
                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                  visual.bg,
                  visual.accent
                )}
              >
                {hint}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

interface DashboardTemplateGalleryProps {
  onSelect: (template: DashboardTemplate) => void;
  selectedId?: string | null;
  className?: string;
}

export function DashboardTemplateGallery({
  onSelect,
  selectedId,
  className,
}: DashboardTemplateGalleryProps) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}
    >
      {DASHBOARD_TEMPLATES.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          onSelect={onSelect}
          selected={selectedId === t.id}
        />
      ))}
    </motion.div>
  );
}
