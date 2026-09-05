'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { APPS, type AppId } from '@/lib/appMode';
import {
  APP_THEME_FIELD_KEYS,
  APP_THEME_FIELD_LABELS,
  resolveThemeField,
  type AppThemeFields,
  type AppThemeFieldKey,
} from '@/lib/theme/appTheme';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  fieldKey,
  value,
  inheritedFrom,
  onChange,
}: {
  fieldKey: AppThemeFieldKey;
  value: string;
  inheritedFrom?: string;
  onChange: (next: string) => void;
}) {
  const swatch = HEX_PATTERN.test(value) ? value : '#888888';
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldKey}>{APP_THEME_FIELD_LABELS[fieldKey]}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${APP_THEME_FIELD_LABELS[fieldKey]} picker`}
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
        />
        <input
          id={fieldKey}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={inheritedFrom ? `inherits ${inheritedFrom}` : 'unset — uses default'}
          className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        {value && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange('')} aria-label={`Clear ${APP_THEME_FIELD_LABELS[fieldKey]}`}>
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Preview({ primary, background, label }: { primary?: string; background?: string; label: string }) {
  return (
    <div
      className="flex flex-1 flex-col gap-2 rounded-lg border p-3"
      style={{ background: background || (label === 'Dark' ? '#22223b' : '#f9f9f9') }}
    >
      <span className="text-xs font-medium" style={{ color: label === 'Dark' ? '#f9f9f9' : '#333' }}>{label}</span>
      <div
        className="rounded-md px-3 py-1.5 text-center text-sm font-medium text-white"
        style={{ background: primary || '#999' }}
      >
        Primary button
      </div>
    </div>
  );
}

const SCOPE_OPTIONS: { value: 'global' | AppId; label: string }[] = [
  { value: 'global', label: 'Global (default for every app)' },
  ...(Object.values(APPS).map((a) => ({ value: a.id, label: a.name })) as { value: AppId; label: string }[]),
];

export default function AppThemePage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'global' | AppId>('global');
  const [global, setGlobalState] = useState<AppThemeFields>({});
  const [apps, setApps] = useState<Record<string, AppThemeFields>>({});

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/app-theme');
      if (res.ok) {
        const data = await res.json();
        setGlobalState(data.global ?? {});
        setApps(data.apps ?? {});
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  const current: AppThemeFields = scope === 'global' ? global : (apps[scope] ?? {});

  function setField(key: AppThemeFieldKey, raw: string) {
    const value = raw.trim() === '' ? null : raw;
    if (scope === 'global') {
      setGlobalState((prev) => ({ ...prev, [key]: value }));
    } else {
      setApps((prev) => ({ ...prev, [scope]: { ...prev[scope], [key]: value } }));
    }
  }

  async function save(fields: AppThemeFields) {
    setSaving(true);
    await apiFetch('/api/adminlog/app-theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, ...fields }),
    });
    setSaving(false);
  }

  async function resetScope() {
    const cleared: AppThemeFields = {
      primaryLight: null,
      backgroundLight: null,
      primaryDark: null,
      backgroundDark: null,
      ...(scope === 'global' ? { radius: null } : {}),
    };
    if (scope === 'global') setGlobalState({});
    else setApps((prev) => ({ ...prev, [scope]: {} }));
    await save(cleared);
  }

  const previewGlobal = scope === 'global' ? current : global;
  const previewApp = scope === 'global' ? undefined : current;
  const resolvedLightPrimary = resolveThemeField(previewApp?.primaryLight, previewGlobal.primaryLight);
  const resolvedLightBg = resolveThemeField(previewApp?.backgroundLight, previewGlobal.backgroundLight);
  const resolvedDarkPrimary = resolveThemeField(previewApp?.primaryDark, previewGlobal.primaryDark);
  const resolvedDarkBg = resolveThemeField(previewApp?.backgroundDark, previewGlobal.backgroundDark);

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
        Sets the primary and background colors, light & dark, globally or per app. An app-level value
        always wins over global; leaving a field blank falls back to global, then to that app&rsquo;s
        built-in default.
      </p>

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
        <CardContent className="space-y-4 p-4">
          {loading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <>
              {APP_THEME_FIELD_KEYS.map((key) => (
                <ColorField
                  key={key}
                  fieldKey={key}
                  value={current[key] ?? ''}
                  inheritedFrom={scope !== 'global' ? 'global' : undefined}
                  onChange={(v) => setField(key, v)}
                />
              ))}
              {scope === 'global' && (
                <div className="space-y-1.5">
                  <Label htmlFor="radius">Border radius</Label>
                  <input
                    id="radius"
                    type="text"
                    value={global.radius ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setGlobalState((prev) => ({ ...prev, radius: raw === '' ? null : raw }));
                    }}
                    placeholder="unset — uses default (0.625rem)"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button type="button" disabled={saving} onClick={() => save(current)}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={resetScope}>
                  Reset to default
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Live preview</p>
          <div className="flex gap-3">
            <Preview label="Light" primary={resolvedLightPrimary} background={resolvedLightBg} />
            <Preview label="Dark" primary={resolvedDarkPrimary} background={resolvedDarkBg} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
