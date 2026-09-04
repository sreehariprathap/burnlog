'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  HEADING_FONTS, BODY_FONTS, HEADING_FONT_LABELS, BODY_FONT_LABELS,
  DEFAULT_HEADING_FONT, DEFAULT_BODY_FONT, type HeadingFont, type BodyFont,
} from '@/lib/typography';

export default function TypographyPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [headingFont, setHeadingFont] = useState<HeadingFont>(DEFAULT_HEADING_FONT);
  const [bodyFont, setBodyFont] = useState<BodyFont>(DEFAULT_BODY_FONT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/typography');
      if (res.ok) {
        const data = await res.json();
        setHeadingFont(data.headingFont);
        setBodyFont(data.bodyFont);
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  async function save(next: { headingFont?: HeadingFont; bodyFont?: BodyFont }) {
    setSaving(true);
    await apiFetch('/api/adminlog/typography', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
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
        Switches the app&rsquo;s heading and body fonts globally, for every user. Loosely follows{' '}
        <a href="https://www.alignui.com/docs/v1.2/foundation/typography" target="_blank" rel="noreferrer" className="underline">
          AlignUI&rsquo;s typography foundation
        </a>{' '}
        (font choice only — the full named type scale isn&rsquo;t reproduced here).
      </p>

      <Card>
        <CardContent className="space-y-4 p-4">
          {loading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="heading-font">Heading font</Label>
                <Select
                  value={headingFont}
                  onValueChange={(v) => {
                    const next = v as HeadingFont;
                    setHeadingFont(next);
                    save({ headingFont: next });
                  }}
                  disabled={saving}
                >
                  <SelectTrigger id="heading-font" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HEADING_FONTS.map((f) => (
                      <SelectItem key={f} value={f}>{HEADING_FONT_LABELS[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="body-font">Body font</Label>
                <Select
                  value={bodyFont}
                  onValueChange={(v) => {
                    const next = v as BodyFont;
                    setBodyFont(next);
                    save({ bodyFont: next });
                  }}
                  disabled={saving}
                >
                  <SelectTrigger id="body-font" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BODY_FONTS.map((f) => (
                      <SelectItem key={f} value={f}>{BODY_FONT_LABELS[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Live preview</p>
          <h2 className="font-header text-2xl font-semibold">The quick brown fox jumps over the lazy dog.</h2>
          <p className="text-sm text-muted-foreground">
            The quick brown fox jumps over the lazy dog — this is body text, set in whichever font is picked above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
