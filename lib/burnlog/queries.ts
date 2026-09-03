// lib/burnlog/queries.ts
//
// Single source of truth for BurnLog's preloadable page queries. Each
// `xQuery(...)` factory returns the exact `{ key, fetcher }` pair a page's
// own `useSWR(...)` call uses AND the exact pair `usePreloadRoutes` warms —
// they can't drift apart because both call sites import the same function.
//
// The underlying `fetchX(supabase, ...)` functions take an explicit
// SupabaseClient so they're unit-testable without mocking module-level
// `createClient()` — the same pattern lib/burnlog/intel.ts already uses.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type FitnessGoal = {
  id: string;
  goalType: string;
  targetValue: number;
};

export async function fetchFitnessGoals(supabase: SupabaseClient, profileId: string): Promise<FitnessGoal[]> {
  const { data, error } = await supabase.from('fitness_goals').select('*').eq('profileId', profileId);
  if (error) throw error;
  return (data as FitnessGoal[]) ?? [];
}

export function fitnessGoalsQuery(profileId: string) {
  return {
    key: ['burnlog-fitness-goals', profileId] as const,
    fetcher: () => fetchFitnessGoals(createClient(), profileId),
  };
}

export type WorkoutPlanDay = { dayIndex: number; bodyPart: string; repeatWeekly: boolean } | null;

export async function fetchWorkoutPlan(
  supabase: SupabaseClient,
  profileId: string,
  dayOfWeek: number
): Promise<WorkoutPlanDay> {
  const { data } = await supabase
    .from('workout_plans')
    .select('dayOfWeek, bodyPart, repeatWeekly')
    .eq('profileId', profileId)
    .eq('dayOfWeek', dayOfWeek)
    .single();
  return data ? { dayIndex: data.dayOfWeek, bodyPart: data.bodyPart, repeatWeekly: data.repeatWeekly } : null;
}

export function workoutPlanQuery(profileId: string, dayOfWeek: number) {
  return {
    key: ['burnlog-workout-plan', profileId, dayOfWeek] as const,
    fetcher: () => fetchWorkoutPlan(createClient(), profileId, dayOfWeek),
  };
}

export type DateSession = { completed: boolean; bodyPart?: string; duration?: number; notes?: string } | null;

export async function fetchDateSession(
  supabase: SupabaseClient,
  profileId: string,
  dateStr: string
): Promise<DateSession> {
  const { data } = await supabase
    .from('sessions')
    .select('sessionData')
    .eq('profileId', profileId)
    .eq('date', dateStr)
    .maybeSingle();
  return data ? (data.sessionData as DateSession) : null;
}

export function dateSessionQuery(profileId: string, dateStr: string) {
  return {
    key: ['burnlog-date-session', profileId, dateStr] as const,
    fetcher: () => fetchDateSession(createClient(), profileId, dateStr),
  };
}
