'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { APPS, type AppId } from '@/lib/appMode';
import {
  FONT_CATALOG,
  FONT_CATEGORY_LABELS,
  WEIGHT_OPTIONS,
  WEIGHT_LABELS,
  HEADING_SCALE_OPTIONS,
  HEADING_SCALE_LABELS,
  resolveTypographyField,
  fontCatalogEntry,
  DEFAULT_HEADING_FONT,
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_WEIGHT,
  DEFAULT_BODY_WEIGHT,
  DEFAULT_HEADING_SCALE,
  type FontCategory,
  type TypographyFields,
} from '@/lib/typography';

const CATEGORIES: FontCategory[] = ['sans-serif', 'serif', 'slab-serif', 'display'];

function FontSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (fontId: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((cat) => {
          const entries = FONT_CATALOG.filter((f) => f.category === cat);
          if (entries.length === 0) return null;
          return (
            <SelectGroup key={cat}>
              <SelectLabel>{FONT_CATEGORY_LABELS[cat]}</SelectLabel>
              {entries.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

const SCOPE_OPTIONS: { value: 'global' | AppId; label: string }[] = [
  { value: 'global', label: 'Global (default for every app)' },
  ...(Object.values(APPS).map((a) => ({ value: a.id, label: a.name })) as { value: AppId; label: string }[]),
];

export default function TypographyPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'global' | AppId>('global');
  const [global, setGlobalState] = useState<TypographyFields>({});
  const [apps, setApps] = useState<Record<string, TypographyFields>>({});

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/typography');
      if (res.ok) {
        const data = await res.json();
        setGlobalState(data.global ?? {});
        setApps(data.apps ?? {});
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  const current: TypographyFields = scope === 'global' ? global : (apps[scope] ?? {});

  function setField<K extends keyof TypographyFields>(key: K, value: TypographyFields[K]) {
    if (scope === 'global') {
      setGlobalState((prev) => ({ ...prev, [key]: value }));
    } else {
      setApps((prev) => ({ ...prev, [scope]: { ...prev[scope], [key]: value } }));
    }
  }

  async function save(fields: TypographyFields) {
    setSaving(true);
    await apiFetch('/api/adminlog/typography', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, ...fields }),
    });
    setSaving(false);
  }

  async function resetScope() {
    const cleared: TypographyFields = { headingFont: null, bodyFont: null, headingWeight: null, bodyWeight: null, headingScale: null };
    if (scope === 'global') setGlobalState({});
    else setApps((prev) => ({ ...prev, [scope]: {} }));
    await save(cleared);
  }

  const resolvedHeadingFontId = resolveTypographyField(scope === 'global' ? undefined : current.headingFont, global.headingFont, DEFAULT_HEADING_FONT);
  const resolvedBodyFontId = resolveTypographyField(scope === 'global' ? undefined : current.bodyFont, global.bodyFont, DEFAULT_BODY_FONT);
  const resolvedHeadingWeight = resolveTypographyField(scope === 'global' ? undefined : current.headingWeight, global.headingWeight, DEFAULT_HEADING_WEIGHT);
  const resolvedBodyWeight = resolveTypographyField(scope === 'global' ? undefined : current.bodyWeight, global.bodyWeight, DEFAULT_BODY_WEIGHT);
  const resolvedHeadingScale = resolveTypographyField(scope === 'global' ? undefined : current.headingScale, global.headingScale, DEFAULT_HEADING_SCALE);

  const headingFontEntry = useMemo(() => fontCatalogEntry(resolvedHeadingFontId), [resolvedHeadingFontId]);
  const bodyFontEntry = useMemo(() => fontCatalogEntry(resolvedBodyFontId), [resolvedBodyFontId]);
  const headingIsSingleWeight = headingFontEntry?.singleWeight ?? false;
  const bodyIsSingleWeight = bodyFontEntry?.singleWeight ?? false;

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
        Picks heading and body fonts, weight, and heading size — globally or per app. An app-level
        value always wins over global; leaving a field blank falls back to global, then the app default.
        Loosely follows{' '}
        <a href="https://www.alignui.com/docs/v1.2/foundation/typography" target="_blank" rel="noreferrer" className="underline">
          AlignUI&rsquo;s typography foundation
        </a>. Seven names (Proxima Nova, Cooper, Avant Garde, Recoletta, Berthold, Sailors, Helvetica)
        aren&rsquo;t free to bundle, so those entries are free lookalikes, labeled as such.
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
              <div className="space-y-2">
                <Label htmlFor="heading-font">Heading font</Label>
                <FontSelect
                  id="heading-font"
                  value={resolvedHeadingFontId}
                  onChange={(v) => { setField('headingFont', v); save({ headingFont: v }); }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="heading-weight">Heading weight {headingIsSingleWeight && '(this font only ships one weight)'}</Label>
                <Select
                  value={String(resolvedHeadingWeight)}
                  disabled={headingIsSingleWeight}
                  onValueChange={(v) => { const n = Number(v); setField('headingWeight', n); save({ headingWeight: n }); }}
                >
                  <SelectTrigger id="heading-weight" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEIGHT_OPTIONS.map((w) => (
                      <SelectItem key={w} value={String(w)}>{WEIGHT_LABELS[w]} ({w})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="heading-scale">Heading size</Label>
                <Select
                  value={String(resolvedHeadingScale)}
                  onValueChange={(v) => { const n = Number(v); setField('headingScale', n); save({ headingScale: n }); }}
                >
                  <SelectTrigger id="heading-scale" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HEADING_SCALE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={String(s)}>{HEADING_SCALE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="body-font">Body font</Label>
                <FontSelect
                  id="body-font"
                  value={resolvedBodyFontId}
                  onChange={(v) => { setField('bodyFont', v); save({ bodyFont: v }); }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body-weight">Body weight {bodyIsSingleWeight && '(this font only ships one weight)'}</Label>
                <Select
                  value={String(resolvedBodyWeight)}
                  disabled={bodyIsSingleWeight}
                  onValueChange={(v) => { const n = Number(v); setField('bodyWeight', n); save({ bodyWeight: n }); }}
                >
                  <SelectTrigger id="body-weight" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEIGHT_OPTIONS.map((w) => (
                      <SelectItem key={w} value={String(w)}>{WEIGHT_LABELS[w]} ({w})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="button" variant="outline" disabled={saving} onClick={resetScope}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : 'Reset scope to default'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Live preview</p>
          <h2
            style={{
              fontFamily: `var(${headingFontEntry?.cssVar ?? '--font-quicksand'})`,
              fontWeight: resolvedHeadingWeight,
              fontSize: `calc(28px * ${resolvedHeadingScale})`,
            }}
          >
            The quick brown fox jumps over the lazy dog.
          </h2>
          <p
            className="text-muted-foreground"
            style={{
              fontFamily: `var(${bodyFontEntry?.cssVar ?? '--font-figtree'})`,
              fontWeight: resolvedBodyWeight,
            }}
          >
            The quick brown fox jumps over the lazy dog — this is body text, set in whichever font, weight, and size are picked above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
