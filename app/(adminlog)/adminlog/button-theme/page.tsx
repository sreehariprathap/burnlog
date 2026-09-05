'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LiquidButton } from '@/components/ui/liquid-button';
import { FlowButton } from '@/components/ui/flow-button';
import { MetalButton } from '@/components/ui/metal-button';
import { LinkButton } from '@/components/ui/link-button';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/apiFetch';
import { APPS, type AppId } from '@/lib/appMode';
import { BUTTON_SLOTS, BUTTON_STYLES, DEFAULT_BUTTON_STYLE, isButtonStyle, type ButtonStyle } from '@/lib/buttonThemes';

const STYLE_LABELS: Record<ButtonStyle, string> = {
  default: 'Default',
  liquid: 'Liquid glass',
  flow: 'Flow (fill on hover)',
  metal: 'Metal',
  link: 'Link',
};

/** Sentinel for an app-scoped slot with no row of its own — it falls back to
 * whatever global says. Global scope never offers it (there's nothing above
 * global to inherit from). */
const INHERIT = 'inherit';

const SCOPE_OPTIONS: { value: 'global' | AppId; label: string }[] = [
  { value: 'global', label: 'Global (default for every app)' },
  ...(Object.values(APPS).map((a) => ({ value: a.id, label: a.name })) as { value: AppId; label: string }[]),
];

function StylePreview({ style }: { style: ButtonStyle }) {
  if (style === 'liquid') return <LiquidButton>Preview</LiquidButton>;
  if (style === 'flow') return <FlowButton text="Preview" />;
  if (style === 'metal') return <MetalButton>Preview</MetalButton>;
  if (style === 'link') return <LinkButton variant="primary">Preview</LinkButton>;
  return <Button>Preview</Button>;
}

export default function ButtonThemePage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [scope, setScope] = useState<'global' | AppId>('global');
  const [global, setGlobal] = useState<Record<string, ButtonStyle>>({});
  const [apps, setApps] = useState<Record<string, Record<string, ButtonStyle>>>({});
  const [loading, setLoading] = useState(true);
  const [pendingSlots, setPendingSlots] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/api/adminlog/button-theme');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load settings');

        const nextGlobal: Record<string, ButtonStyle> = {};
        for (const slot of BUTTON_SLOTS) {
          const value = data.global?.[slot.key];
          nextGlobal[slot.key] = isButtonStyle(value) ? value : DEFAULT_BUTTON_STYLE;
        }
        const nextApps: Record<string, Record<string, ButtonStyle>> = {};
        for (const [appId, slots] of Object.entries((data.apps ?? {}) as Record<string, Record<string, unknown>>)) {
          const resolved: Record<string, ButtonStyle> = {};
          for (const [key, value] of Object.entries(slots)) {
            if (isButtonStyle(value)) resolved[key] = value;
          }
          nextApps[appId] = resolved;
        }
        setGlobal(nextGlobal);
        setApps(nextApps);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.isAdmin]);

  /** What the Select shows: the row's own style, or INHERIT for an
   * app-scoped slot with no row. */
  function valueFor(slot: string): string {
    if (scope === 'global') return global[slot] ?? DEFAULT_BUTTON_STYLE;
    return apps[scope]?.[slot] ?? INHERIT;
  }

  async function updateSlot(slot: string, next: string) {
    const previousGlobal = global;
    const previousApps = apps;

    // Optimistic, rolled back below if the write fails.
    if (scope === 'global') {
      setGlobal((prev) => ({ ...prev, [slot]: next as ButtonStyle }));
    } else {
      setApps((prev) => {
        const forApp = { ...prev[scope] };
        if (next === INHERIT) delete forApp[slot];
        else forApp[slot] = next as ButtonStyle;
        return { ...prev, [scope]: forApp };
      });
    }
    setPendingSlots((prev) => new Set(prev).add(slot));

    try {
      const res = await apiFetch('/api/adminlog/button-theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, slot, style: next === INHERIT ? null : next }),
      });
      if (!res.ok) throw new Error('request failed');
    } catch {
      setGlobal(previousGlobal);
      setApps(previousApps);
    } finally {
      setPendingSlots((prev) => {
        const updated = new Set(prev);
        updated.delete(slot);
        return updated;
      });
    }
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Pick which visual style each themeable button element uses, globally or per app. An
          app-level choice wins over global; leaving a slot on &ldquo;Inherit&rdquo; falls back to
          global. Only elements wrapped in{' '}
          <code className="rounded bg-muted px-1 py-0.5">ThemedButton</code> respond to this —
          existing screens are unaffected until they opt in.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="scope">Scope</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as 'global' | AppId)}>
          <SelectTrigger id="scope" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-4">
          {BUTTON_STYLES.map((style) => (
            <div key={style} className="flex flex-col items-center gap-2">
              <StylePreview style={style} />
              <span className="text-xs text-muted-foreground">{STYLE_LABELS[style]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <div className="space-y-3">
          {BUTTON_SLOTS.map((slot) => (
            <Card key={slot.key}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{slot.label}</p>
                  <p className="text-xs text-muted-foreground">{slot.description}</p>
                </div>
                <Select
                  value={valueFor(slot.key)}
                  onValueChange={(value) => updateSlot(slot.key, value)}
                  disabled={pendingSlots.has(slot.key)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scope !== 'global' && (
                      <SelectItem value={INHERIT}>
                        Inherit ({STYLE_LABELS[global[slot.key] ?? DEFAULT_BUTTON_STYLE]})
                      </SelectItem>
                    )}
                    {BUTTON_STYLES.map((style) => (
                      <SelectItem key={style} value={style}>
                        {STYLE_LABELS[style]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
