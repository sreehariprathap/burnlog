// app/(adminlog)/adminlog/card-glow/page.tsx
'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { mutate } from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { APPS, type AppId } from '@/lib/appMode';
import {
  CARD_GLOW_KEY,
  CARD_GLOW_PRESET_KEYS,
  CARD_GLOW_PRESETS,
  resolveCardGlowPreset,
  type CardGlowFields,
  type CardGlowPreset,
} from '@/lib/theme/cardGlow';

const PRESET_LABELS: Record<CardGlowPreset, string> = {
  off: 'Off',
  subtle: 'Subtle',
  vibrant: 'Vibrant',
};

const SCOPE_OPTIONS: { value: 'global' | AppId; label: string }[] = [
  { value: 'global', label: 'Global (default for every app)' },
  ...(Object.values(APPS).map((a) => ({ value: a.id, label: a.name })) as { value: AppId; label: string }[]),
];

export default function CardGlowPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'global' | AppId>('global');
  const [global, setGlobalState] = useState<CardGlowFields>({});
  const [apps, setApps] = useState<Record<string, CardGlowFields>>({});

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/card-glow');
      if (res.ok) {
        const data = await res.json();
        setGlobalState(data.global ?? {});
        setApps(data.apps ?? {});
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  const current: CardGlowFields = scope === 'global' ? global : (apps[scope] ?? {});
  const resolvedPreset = resolveCardGlowPreset(scope === 'global' ? undefined : apps[scope]?.preset, global.preset);

  async function setPreset(preset: CardGlowPreset) {
    if (scope === 'global') setGlobalState((prev) => ({ ...prev, preset }));
    else setApps((prev) => ({ ...prev, [scope]: { ...prev[scope], preset } }));

    setSaving(true);
    await apiFetch('/api/adminlog/card-glow', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, preset }),
    });
    setSaving(false);
    // Every consumer (CardGlowSettingsEffect, this page) shares this SWR
    // key — revalidate so the change is visible immediately instead of
    // waiting out the 60s dedupingInterval.
    mutate(CARD_GLOW_KEY);
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const previewStyle = {
    '--card-glow-opacity': CARD_GLOW_PRESETS[resolvedPreset].opacity,
    '--card-glow-blur': CARD_GLOW_PRESETS[resolvedPreset].blur,
  } as CSSProperties;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Sets how strong gradients and glow effects look on dashboard cards, globally or per app. An app-level
        choice always wins over global; leaving a scope unset falls back to global, then to Subtle.
      </p>

      <div className="space-y-2">
        <Label htmlFor="scope">Scope</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as 'global' | AppId)}>
          <SelectTrigger id="scope" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          {loading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {CARD_GLOW_PRESET_KEYS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={(current.preset ?? resolvedPreset) === preset ? 'default' : 'outline'}
                  disabled={saving}
                  onClick={() => setPreset(preset)}
                >
                  {PRESET_LABELS[preset]}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Live preview</p>
          <div className="relative h-24 overflow-hidden rounded-xl border bg-card" style={previewStyle}>
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--chart-2))',
                opacity: 'var(--card-glow-opacity)',
                filter: 'blur(var(--card-glow-blur))',
              }}
            />
            <div className="relative flex h-full items-center justify-center text-sm text-muted-foreground">
              {PRESET_LABELS[resolvedPreset]} preview
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
