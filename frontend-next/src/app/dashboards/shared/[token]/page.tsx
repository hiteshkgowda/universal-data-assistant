"use client";

import { useEffect, useRef, useState } from "react";
import { use } from "react";
import GridLayout, { type Layout, type LayoutItem } from "react-grid-layout";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  BarChart2,
  LayoutDashboard,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlotlyChart } from "@/components/ask/PlotlyChart";
import { getSharedDashboard } from "@/lib/api/dashboards";
import type { KPIMetric, ChartPanel, LayoutConfig, DashboardConfig } from "@/lib/api/types";

const COLS = 12;
const ROW_HEIGHT = 60;
const GRID_MARGIN: [number, number] = [12, 12];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.06 } },
};

function buildLayout(kpis: KPIMetric[], charts: ChartPanel[], lc: LayoutConfig): LayoutItem[] {
  const items: LayoutItem[] = [];
  kpis.forEach((kpi, i) => {
    items.push({ i: `kpi-${kpi.id}`, x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2, minW: 2, minH: 2 });
  });
  const kpiRows = kpis.length > 0 ? Math.ceil(kpis.length / 4) * 2 : 0;
  let rowY = kpiRows;
  for (const row of lc.rows) {
    let x = 0;
    for (const cell of row) {
      if (!charts.find((c) => c.id === cell.id)) continue;
      const w = cell.width === "full" ? 12 : 6;
      items.push({ i: `chart-${cell.id}`, x, y: rowY, w, h: 6, minW: 4, minH: 4 });
      x += w;
    }
    rowY += 6;
  }
  return items;
}

function KpiWidget({ kpi }: { kpi: KPIMetric }) {
  const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
  const trendColor = kpi.trend === "up" ? "text-emerald-400" : kpi.trend === "down" ? "text-red-400" : "text-muted-foreground";
  return (
    <div className="relative h-full flex flex-col justify-between rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 overflow-hidden select-none">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/4 to-transparent pointer-events-none" />
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{kpi.label}</p>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold text-foreground tabular-nums leading-none">{kpi.formatted_value}</span>
        {kpi.change_pct !== null && (
          <div className={cn("flex items-center gap-0.5 text-xs font-semibold shrink-0", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {Math.abs(kpi.change_pct).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/50 truncate">{kpi.aggregation} · {kpi.column}</p>
    </div>
  );
}

function ChartWidget({ chart }: { chart: ChartPanel }) {
  const Icon = chart.chart_type === "bar" ? BarChart2 : TrendingUp;
  return (
    <div className="h-full flex flex-col rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary/60 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{chart.title}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <PlotlyChart spec={chart.chart_spec} />
      </div>
    </div>
  );
}

export default function SharedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [gridWidth, setGridWidth] = useState(900);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setGridWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    getSharedDashboard(token)
      .then((cfg) => {
        setConfig(cfg);
        setLayout(buildLayout(cfg.kpis, cfg.charts, cfg.layout));
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3 px-4">
          <LayoutDashboard className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-base font-medium text-foreground">Dashboard not found</p>
          <p className="text-sm text-muted-foreground">This link may have been revoked or never existed.</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background gap-4">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* header */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-2.5">
          <LayoutDashboard className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-sm font-medium text-foreground truncate">{config.dashboard_name}</h1>
          <span className="ml-auto text-xs text-muted-foreground/60 shrink-0">Read-only · shared view</span>
        </div>
      </div>

      {/* canvas */}
      <div className="max-w-7xl mx-auto px-5 py-5">
        <div ref={containerRef} className="w-full">
          {mounted && gridWidth > 0 ? (
            <motion.div variants={stagger} initial="hidden" animate="show">
              <GridLayout
                layout={layout}
                width={gridWidth}
                gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: GRID_MARGIN, containerPadding: [0, 0], maxRows: Infinity }}
                dragConfig={{ enabled: false }}
                resizeConfig={{ enabled: false }}
                onLayoutChange={(_l: Layout) => {}}
              >
                {config.kpis.map((kpi) => (
                  <motion.div key={`kpi-${kpi.id}`} variants={fadeUp}>
                    <KpiWidget kpi={kpi} />
                  </motion.div>
                ))}
                {config.charts.map((chart) => (
                  <motion.div key={`chart-${chart.id}`} variants={fadeUp}>
                    <ChartWidget chart={chart} />
                  </motion.div>
                ))}
              </GridLayout>
            </motion.div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-[132px] rounded-xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
