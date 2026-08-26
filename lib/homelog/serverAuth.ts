// lib/homelog/serverAuth.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getMyProfileId(admin: SupabaseClient, userId: string): Promise<string | undefined> {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export interface MyMembership {
  householdId: string;
  role: 'owner' | 'member';
}

export async function getMyHouseholdMembership(admin: SupabaseClient, profileId: string): Promise<MyMembership | undefined> {
  const { data } = await admin
    .from('household_members')
    .select('householdId, role')
    .eq('profileId', profileId)
    .maybeSingle();
  return data ? { householdId: data.householdId, role: data.role } : undefined;
}
