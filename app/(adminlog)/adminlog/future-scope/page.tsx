'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  FINDINGS,
  FUTURE_SCOPE_DOC_PATH,
  FUTURE_SCOPE_REVIEW_DATE,
  SEQUENCING,
  SEVERITY_BLURBS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  STRENGTHS,
  type Finding,
  type FindingSeverity,
  type FindingStatus,
} from '@/lib/adminlog/futureScope';

// Severity and status accents use the semantic tokens from globals.css
// (destructive/warning/success/info/primary) rather than Tailwind palette
// scales, so AdminLog > UI theme changes reach this page too — and they are
// written out as literal class strings rather than interpolated from the
// severity key, since Tailwind only ships classes it can see in the source.
const SEVERITY_STYLES: Record<FindingSeverity, { dot: string; chip: string }> = {
  critical: { dot: 'bg-destructive', chip: 'bg-destructive/10 text-destructive' },
  high: { dot: 'bg-warning', chip: 'bg-warning/10 text-warning' },
  medium: { dot: 'bg-primary', chip: 'bg-primary/10 text-primary' },
  ux: { dot: 'bg-info', chip: 'bg-info/10 text-info' },
};

const STATUS_STYLES: Record<FindingStatus, { label: string; chip: string }> = {
  open: { label: 'Open', chip: 'bg-muted text-muted-foreground' },
  'in-progress': { label: 'In progress', chip: 'bg-info/10 text-info' },
  done: { label: 'Done', chip: 'bg-success/10 text-success' },
  wontfix: { label: "Won't fix", chip: 'bg-muted text-muted-foreground line-through' },
};

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const severity = SEVERITY_STYLES[finding.severity];
  const status = STATUS_STYLES[finding.status];
  const bodyId = `finding-${finding.id}-body`;

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50
                   focus-visible:bg-accent/50 focus-visible:outline-none"
      >
        <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', severity.dot)} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs text-muted-foreground">{finding.id}</span>
            <span className="font-medium">{finding.title}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', severity.chip)}>
              {SEVERITY_LABELS[finding.severity]}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {finding.area}
            </span>
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', status.chip)}>
              {status.label}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <div id={bodyId} hidden={!open} className="space-y-3 px-4 pb-4 pl-9 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problem</p>
          <p className="mt-0.5">{finding.problem}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impact</p>
          <p className="mt-0.5">{finding.impact}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fix</p>
          <p className="mt-0.5">{finding.fix}</p>
        </div>
        {finding.note && (
          <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{finding.note}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {finding.files.map((file) => (
            <code key={file} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] break-all">
              {file}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FutureScopePage() {
  const { profile, loading } = useRequireAdmin();
  const [filter, setFilter] = useState<FindingSeverity | 'all'>('all');

  const counts = useMemo(() => {
    const bySeverity = Object.fromEntries(
      SEVERITY_ORDER.map((s) => [s, FINDINGS.filter((f) => f.severity === s).length])
    ) as Record<FindingSeverity, number>;
    const resolved = FINDINGS.filter((f) => f.status === 'done' || f.status === 'wontfix').length;
    return { bySeverity, resolved, total: FINDINGS.length };
  }, []);

  const visible = useMemo(
    () => (filter === 'all' ? FINDINGS : FINDINGS.filter((f) => f.severity === filter)),
    [filter]
  );

  if (loading || !profile?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Findings from the whole-codebase review of {FUTURE_SCOPE_REVIEW_DATE} — frontend and backend,
          ~86k LOC across 907 files, 167 API routes, 109 tables. Every item was verified against the code
          at commit <code className="font-mono text-xs">74a6c2e</code>; where a finding depends on live
          database or hosting state, the caveat says what to check.
        </p>
        <p className="text-sm text-muted-foreground">
          Full write-up, with failure scenarios, verification queries, and refactored code:{' '}
          <code className="font-mono text-xs break-all">{FUTURE_SCOPE_DOC_PATH}</code>
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          {SEVERITY_ORDER.map((severity) => (
            <div key={severity} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn('h-2 w-2 rounded-full', SEVERITY_STYLES[severity].dot)}
                  aria-hidden="true"
                />
                <span className="text-2xl font-semibold tabular-nums">{counts.bySeverity[severity]}</span>
              </div>
              <p className="text-xs text-muted-foreground">{SEVERITY_LABELS[severity]}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter findings by severity">
        {(['all', ...SEVERITY_ORDER] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              filter === key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            )}
          >
            {key === 'all' ? `All (${counts.total})` : `${SEVERITY_LABELS[key]} (${counts.bySeverity[key]})`}
          </button>
        ))}
      </div>

      {filter !== 'all' && (
        <p className="text-sm text-muted-foreground">{SEVERITY_BLURBS[filter]}</p>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {visible.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Suggested sequencing</h2>
        <Card>
          <CardContent className="space-y-3 p-4">
            {SEQUENCING.map((phase, i) => (
              <div key={phase.step} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full
                                 bg-muted text-[11px] font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">
                    {phase.step}{' '}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {phase.ids.join(' · ')}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{phase.why}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">What is already working well</h2>
        <Card>
          <CardContent className="p-4">
            <ul className="space-y-2">
              {STRENGTHS.map((strength) => (
                <li key={strength} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
