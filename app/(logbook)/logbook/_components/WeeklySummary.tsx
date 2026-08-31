'use client';

import useSWR from 'swr';
import { Flame, ListChecks, Wallet, Moon, TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { formatCurrency } from '@/lib/format';
import type { LogbookWeekly, WeeklyMetric } from '@/lib/logbook/weekly';

async function fetchWeekly(): Promise<LogbookWeekly> {
  const res = await fetch('/api/logbook/weekly');
  if (!res.ok) throw new Error('Failed to load weekly summary');
  return res.json();
}

const METRIC_META: Record<WeeklyMetric['app'], { icon: LucideIcon; color: string }> = {
  burnlog: { icon: Flame, color: '#F97316' },
  tasklog: { icon: ListChecks, color: '#3B82F6' },
  moneylog: { icon: Wallet, color: '#22C55E' },
  lifelog: { icon: Moon, color: '#8B5CF6' },
};

function formatMetricValue(metric: WeeklyMetric, value: number): string {
  if (metric.app === 'moneylog') return formatCurrency(Math.round(value));
  return `${Math.round(value).toLocaleString()} ${metric.unit}`;
}

function DeltaBadge({ metric }: { metric: WeeklyMetric }) {
  const diff = metric.thisWeek - metric.lastWeek;
  // Spending less is an improvement, everything else is the opposite.
  const isGoodDirection = metric.app === 'moneylog' ? diff <= 0 : diff >= 0;

  if (diff === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> No change
      </span>
    );
  }

  const pct = metric.lastWeek > 0 ? Math.round((Math.abs(diff) / metric.lastWeek) * 100) : null;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;

  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${isGoodDirection ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
      <Icon className="h-3 w-3" />
      {pct !== null ? `${pct}%` : formatMetricValue(metric, Math.abs(diff))} {diff > 0 ? 'more' : 'less'}
    </span>
  );
}

function MetricRow({ metric }: { metric: WeeklyMetric }) {
  const meta = METRIC_META[metric.app];
  const Icon = meta.icon;

  if (!metric.available) {
    return (
      <div className="flex items-center justify-between gap-3 py-2 opacity-60">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: meta.color }} />
          <span className="text-sm">{metric.label}</span>
        </div>
        <span className="text-xs text-muted-foreground">Coming soon</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: meta.color }} />
        <span className="text-sm">{metric.label}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">{formatMetricValue(metric, metric.thisWeek)}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            vs {formatMetricValue(metric, metric.lastWeek)} last week
          </p>
        </div>
        <DeltaBadge metric={metric} />
      </div>
    </div>
  );
}

export function WeeklySummary() {
  const { data, isLoading, error } = useSWR('logbook-weekly', fetchWeekly);

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  return (
    <Card className="px-2">
      <Accordion type="single" collapsible defaultValue="weekly">
        <AccordionItem value="weekly" className="border-b-0">
          <AccordionTrigger className="px-2 text-sm font-semibold hover:no-underline">
            This week vs last week
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-2">
            <div className="divide-y">
              {data.metrics.map((metric) => (
                <MetricRow key={metric.app} metric={metric} />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
