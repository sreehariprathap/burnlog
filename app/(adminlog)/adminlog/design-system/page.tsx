'use client';

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DESIGN_SYSTEM_PRESETS, type DesignSystemPreset } from '@/lib/theme/designSystems';

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

  async function apply(preset: DesignSystemPreset) {
    setApplyingId(preset.id);
    setAppliedId(null);
    try {
      await Promise.all([
        apiFetch('/api/adminlog/app-theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'global', ...preset.theme }),
        }),
        apiFetch('/api/adminlog/typography', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'global', ...preset.typography }),
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
        One-click bundles of color, radius, spacing, border, shadow, and typography, applied globally
        across every app — every Button, Card, Input, Dialog, and menu picks these up automatically.
        This just pre-fills App Theme and Typography (both global scope) — fine-tune further on those
        pages afterward, or per-app there as usual.
      </p>

      {appliedId && (
        <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground">
          <Check className="size-4" /> Applied {DESIGN_SYSTEM_PRESETS.find((p) => p.id === appliedId)?.name}.
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
