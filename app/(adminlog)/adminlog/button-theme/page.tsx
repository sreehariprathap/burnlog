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
import { apiFetch } from '@/lib/apiFetch';
import { BUTTON_SLOTS, BUTTON_STYLES, DEFAULT_BUTTON_STYLE, isButtonStyle, type ButtonStyle } from '@/lib/buttonThemes';

const STYLE_LABELS: Record<ButtonStyle, string> = {
  default: 'Default',
  liquid: 'Liquid glass',
  flow: 'Flow (fill on hover)',
  metal: 'Metal',
  link: 'Link',
};

function StylePreview({ style }: { style: ButtonStyle }) {
  if (style === 'liquid') return <LiquidButton>Preview</LiquidButton>;
  if (style === 'flow') return <FlowButton text="Preview" />;
  if (style === 'metal') return <MetalButton>Preview</MetalButton>;
  if (style === 'link') return <LinkButton variant="primary">Preview</LinkButton>;
  return <Button>Preview</Button>;
}

export default function ButtonThemePage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [settings, setSettings] = useState<Record<string, ButtonStyle>>({});
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
        const next: Record<string, ButtonStyle> = {};
        for (const slot of BUTTON_SLOTS) {
          const value = data.settings?.[slot.key];
          next[slot.key] = isButtonStyle(value) ? value : DEFAULT_BUTTON_STYLE;
        }
        setSettings(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.isAdmin]);

  async function updateSlot(slot: string, style: ButtonStyle) {
    const rollback = settings[slot];
    setSettings((prev) => ({ ...prev, [slot]: style }));
    setPendingSlots((prev) => new Set(prev).add(slot));
    try {
      const res = await apiFetch('/api/adminlog/button-theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, style }),
      });
      if (!res.ok) throw new Error('request failed');
    } catch {
      setSettings((prev) => ({ ...prev, [slot]: rollback }));
    } finally {
      setPendingSlots((prev) => {
        const next = new Set(prev);
        next.delete(slot);
        return next;
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
          Pick which visual style each themeable button element uses across the app. Only elements
          wrapped in <code className="rounded bg-muted px-1 py-0.5">ThemedButton</code> respond to this —
          existing screens are unaffected until they opt in.
        </p>
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
                  value={settings[slot.key] ?? DEFAULT_BUTTON_STYLE}
                  onValueChange={(value) => updateSlot(slot.key, value as ButtonStyle)}
                  disabled={pendingSlots.has(slot.key)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
