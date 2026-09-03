// lib/ai/curatedModels.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CuratedModelOption {
  id: string;
  name: string;
  modality: 'text' | 'vision';
  isFree: boolean;
}

/** Reads the admin-curated model list (ai_model_catalog), sorted by name. */
export async function listCuratedModels(admin: SupabaseClient): Promise<CuratedModelOption[]> {
  const { data, error } = await admin
    .from('ai_model_catalog')
    .select('modelId, name, modality, isFree')
    .order('name', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as { modelId: string; name: string; modality: string; isFree: boolean }[]).map((row) => ({
    id: row.modelId,
    name: row.name,
    modality: row.modality as 'text' | 'vision',
    isFree: row.isFree,
  }));
}
