// app/profile/_components/AiModelSettingsModal.tsx
'use client';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { DEFAULT_MODELS, type ModelSlot } from '@/lib/ai/modelConfig';

type CatalogEntry = { id: string; name: string };
type Catalog = { text: CatalogEntry[]; vision: CatalogEntry[] };

type AiModelSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AiModelSettingsModal({ open, onOpenChange }: AiModelSettingsModalProps) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ text: [], vision: [] });
  const [selected, setSelected] = useState<Record<ModelSlot, string>>({ ...DEFAULT_MODELS });
  const [saving, setSaving] = useState<ModelSlot | null>(null);

  useEffect(() => {
    if (!open) return;
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

        const rows = (settingsRes.data ?? []) as { slot: ModelSlot; modelId: string }[];
        const next = { ...DEFAULT_MODELS };
        for (const row of rows) {
          next[row.slot] = row.modelId;
        }
        setSelected(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, supabase]);

  const handleChange = async (slot: ModelSlot, modelId: string) => {
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
  };

  const renderSelect = (slot: ModelSlot, label: string, options: CatalogEntry[]) => (
    <div className="space-y-1">
      <Label htmlFor={`ai-model-${slot}`}>{label}</Label>
      {options.length === 0 ? (
        <select id={`ai-model-${slot}`} disabled className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
          <option>No free models available</option>
        </select>
      ) : (
        <select
          id={`ai-model-${slot}`}
          value={selected[slot]}
          onChange={(e) => handleChange(slot, e.target.value)}
          disabled={saving === slot}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Model Settings</DialogTitle>
        </DialogHeader>
        {loading ? (
          <Loader2 className="animate-spin h-6 w-6 mx-auto" />
        ) : (
          <div className="space-y-4">
            {renderSelect('text', 'Text Model', catalog.text)}
            {renderSelect('vision', 'Image Model', catalog.vision)}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
