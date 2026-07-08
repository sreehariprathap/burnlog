// lib/ai/modelConfig.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type ModelSlot = 'text' | 'vision';

export const DEFAULT_MODELS: Record<ModelSlot, string> = {
  text: 'openai/gpt-oss-120b:free',
  vision: 'google/gemini-flash-1.5',
};

export async function getModel(supabase: SupabaseClient, slot: ModelSlot): Promise<string> {
  const { data } = await supabase
    .from('ai_model_settings')
    .select('modelId')
    .eq('slot', slot)
    .maybeSingle();

  return data?.modelId || DEFAULT_MODELS[slot];
}
