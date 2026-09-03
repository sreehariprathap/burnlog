// lib/intellog/extractors.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractBurnlogSnapshot } from '@/lib/burnlog/intel';
import { extractMoneylogSnapshot } from '@/lib/moneylog/intel';
import { extractTasklogSnapshot } from '@/lib/tasklog/intel';
import { extractSociallogSnapshot } from '@/lib/sociallog/intel';

export type SnapshotExtractor = (
  supabase: SupabaseClient,
  profileId: string,
  date: string
) => Promise<Record<string, number>>;

/**
 * Single place mapping app id -> its IntelLog snapshot extractor. Adding a
 * new app to the pipeline is a one-line addition here plus its own
 * `lib/<app>/intel.ts` — no changes needed in the cron route.
 */
export const SNAPSHOT_EXTRACTORS: Record<string, SnapshotExtractor> = {
  burnlog: extractBurnlogSnapshot,
  moneylog: extractMoneylogSnapshot,
  tasklog: extractTasklogSnapshot,
  sociallog: extractSociallogSnapshot,
};
