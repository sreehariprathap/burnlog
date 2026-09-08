'use client';

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { APPS, type AppId } from '@/lib/appMode';
import { DESIGN_SYSTEM_PRESETS, type DesignSystemPreset } from '@/lib/theme/designSystems';

const SCOPE_OPTIONS: { value: 'global' | AppId; label: string }[] = [
  { value: 'global', label: 'Global (overrides every app)' },
  ...(Object.values(APPS).map((a) => ({ value: a.id, label: a.name })) as { value: AppId; label: string }[]),
];

function PresetCard({
  preset,
  applying,
  onApply,
}: {
  preset: DesignSystemPreset;
  applying: boolean;
  onApply: () => void;
}) {
  const radius = preset.theme.radius ?? '0.625rem';
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">{preset.name}</p>
          <div className="flex gap-1.5">
            <span
              className="size-5 rounded-full border"
              style={{ background: preset.theme.primaryLight ?? '#999' }}
              aria-hidden
            />
            <span
              className="size-5 rounded-full border"
              style={{ background: preset.theme.primaryDark ?? '#999' }}
              aria-hidden
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{preset.description}</p>
        <div
          className="flex items-center justify-between p-3"
          style={{
            background: preset.theme.backgroundLight ?? '#f9f9f9',
            borderRadius: radius,
            border: `1px solid ${preset.theme.borderLight ?? '#e5e5e5'}`,
            boxShadow: preset.theme.shadowMd ?? undefined,
          }}
        >
          <span
            className="text-sm"
            style={{ fontWeight: preset.typography.headingWeight ?? 600, color: '#1a1a1a' }}
          >
            Aa
          </span>
          <span
            className="px-3 py-1.5 text-xs font-medium text-white"
            style={{ background: preset.theme.primaryLight ?? '#999', borderRadius: radius }}
          >
            Button
          </span>
        </div>
        <Button type="button" size="sm" className="w-full" disabled={applying} onClick={onApply}>
          {applying ? <Loader2 className="size-4 animate-spin" /> : 'Apply'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DesignSystemPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [scope, setScope] = useState<'global' | AppId>('global');

  async function apply(preset: DesignSystemPreset) {
    setApplyingId(preset.id);
    setAppliedId(null);
    try {
      await Promise.all([
        apiFetch('/api/adminlog/app-theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, ...preset.theme }),
        }),
        apiFetch('/api/adminlog/typography', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, ...preset.typography }),
        }),
      ]);
      setAppliedId(preset.id);
    } finally {
      setApplyingId(null);
    }
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        One-click bundles of color, radius, spacing, border, shadow, and typography — every Button,
        Card, Input, Dialog, and menu picks these up automatically. Applying just pre-fills App Theme
        and Typography at the scope below, so you can fine-tune further on those pages afterward.
      </p>

      <div className="space-y-2">
        <Label htmlFor="scope">Apply to</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as 'global' | AppId)}>
          <SelectTrigger id="scope" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {scope === 'global'
            ? 'Global writes an override that wins over every app’s own built-in palette — every app will look the same until you set per-app values.'
            : `Only ${APPS[scope].name} changes. Every other app keeps its current look.`}
        </p>
      </div>

      {appliedId && (
        <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground">
          <Check className="size-4" /> Applied {DESIGN_SYSTEM_PRESETS.find((p) => p.id === appliedId)?.name}{' '}
          to {scope === 'global' ? 'every app' : APPS[scope].name}.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DESIGN_SYSTEM_PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            applying={applyingId === preset.id}
            onApply={() => apply(preset)}
          />
        ))}
      </div>
    </div>
  );
}
