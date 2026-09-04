'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AI_FEATURES, DEFAULT_MODELS, DEFAULT_TEXT_MODEL, type ModelSlot } from '@/lib/ai/modelConfig';
import { APPS, type AppId } from '@/lib/appMode';

type CatalogEntry = { id: string; name: string; isFree: boolean };
type Catalog = { text: CatalogEntry[]; vision: CatalogEntry[] };

function appLabel(app: string): string {
  return APPS[app as AppId]?.name ?? app;
}

export default function AiModelsPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ text: [], vision: [] });
  const [selected, setSelected] = useState<Record<ModelSlot, string>>({ ...DEFAULT_MODELS });
  const [saving, setSaving] = useState<ModelSlot | null>(null);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [catalogRes, settingsRes] = await Promise.all([
          fetch('/api/ai/models'),
          supabase.from('ai_model_settings').select('slot, modelId'),
        ]);

        const catalogData = await catalogRes.json();
        if (!catalogRes.ok || catalogData.error) {
          throw new Error(catalogData.error ?? 'Failed to load model catalog');
        }
        setCatalog({ text: catalogData.text ?? [], vision: catalogData.vision ?? [] });

        const rows = (settingsRes.data ?? []) as { slot: string; modelId: string }[];
        const next = { ...DEFAULT_MODELS };
        for (const row of rows) {
          if (row.slot in next) next[row.slot as ModelSlot] = row.modelId;
        }
        setSelected(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model settings');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isAdmin]);

  async function handleChange(slot: ModelSlot, modelId: string) {
    setSelected((prev) => ({ ...prev, [slot]: modelId }));
    setSaving(slot);
    setError(null);
    try {
      const { error: upsertError } = await supabase
        .from('ai_model_settings')
        .upsert({ slot, modelId, updatedAt: new Date().toISOString() }, { onConflict: 'slot' });
      if (upsertError) throw upsertError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save — you may not have admin access');
    } finally {
      setSaving(null);
    }
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  const apps = [...new Set(AI_FEATURES.map((f) => f.app))];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mt-1">
          Pick which OpenRouter model powers each AI feature, from the models curated in{' '}
          <a href="/adminlog/model-gather" className="underline">Model Gather</a>. Text features
          default to {DEFAULT_TEXT_MODEL}; photo/document features default to a free
          vision-capable model.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Loader2 className="animate-spin h-6 w-6 mx-auto" />
      ) : (
        apps.map((app) => (
          <Card key={app}>
            <CardHeader>
              <CardTitle>{appLabel(app)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {AI_FEATURES.filter((f) => f.app === app).map((feature) => {
                const options = catalog[feature.kind];
                return (
                  <div key={feature.slot} className="space-y-1.5">
                    <Label htmlFor={`model-${feature.slot}`}>{feature.label}</Label>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                    <Select
                      value={selected[feature.slot]}
                      onValueChange={(value) => handleChange(feature.slot, value)}
                      disabled={saving === feature.slot || options.length === 0}
                    >
                      <SelectTrigger id={`model-${feature.slot}`} className="w-full">
                        <SelectValue placeholder={options.length === 0 ? 'No free models available' : undefined} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.name} · {opt.isFree ? 'Free' : 'Paid'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
