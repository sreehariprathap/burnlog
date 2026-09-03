// lib/learnlog/queries.ts
//
// Single source of truth for LearnLog's preloadable page queries — same
// pattern as the four prior registries. Every fetcher takes an explicit
// SupabaseClient so it's unit-testable without mocking module-level
// createClient(), and every key matches the string this app's pages
// already used before this registry existed.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type {
  SkillRow,
  LibraryItemRow,
  CareerGoalRow,
  CareerRoleRow,
  CareerCertificationRow,
  ReflectionRow,
} from '@/lib/learnlog/types';

export type HomeData = {
  skills: SkillRow[];
  inProgressBook: LibraryItemRow | null;
  nextGoal: CareerGoalRow | null;
};

export async function fetchHomeData(supabase: SupabaseClient, profileId: string): Promise<HomeData> {
  const [skillsRes, libraryRes, goalsRes] = await Promise.all([
    supabase.from('learnlog_skills').select('*').eq('profileId', profileId).order('currentStreak', { ascending: false }),
    supabase.from('learnlog_library_items').select('*').eq('profileId', profileId).eq('status', 'IN_PROGRESS').order('updatedAt', { ascending: false }).limit(1),
    supabase.from('learnlog_career_goals').select('*').eq('profileId', profileId).eq('status', 'active').order('targetDate', { ascending: true }).limit(1),
  ]);
  if (skillsRes.error) throw skillsRes.error;
  if (libraryRes.error) throw libraryRes.error;
  if (goalsRes.error) throw goalsRes.error;
  return {
    skills: (skillsRes.data ?? []) as SkillRow[],
    inProgressBook: (libraryRes.data?.[0] ?? null) as LibraryItemRow | null,
    nextGoal: (goalsRes.data?.[0] ?? null) as CareerGoalRow | null,
  };
}

export function homeDataQuery(profileId: string) {
  return {
    key: ['learnlog-home', profileId] as const,
    fetcher: () => fetchHomeData(createClient(), profileId),
  };
}

export async function fetchSkills(supabase: SupabaseClient, profileId: string): Promise<SkillRow[]> {
  const { data, error } = await supabase
    .from('learnlog_skills')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export function skillsQuery(profileId: string) {
  return {
    key: ['learnlog-skills', profileId] as const,
    fetcher: () => fetchSkills(createClient(), profileId),
  };
}

export async function fetchLibraryItems(supabase: SupabaseClient, profileId: string): Promise<LibraryItemRow[]> {
  const { data, error } = await supabase
    .from('learnlog_library_items')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LibraryItemRow[];
}

export function libraryItemsQuery(profileId: string) {
  return {
    key: ['learnlog-library', profileId] as const,
    fetcher: () => fetchLibraryItems(createClient(), profileId),
  };
}

export async function fetchRoles(supabase: SupabaseClient, profileId: string): Promise<CareerRoleRow[]> {
  const { data, error } = await supabase
    .from('learnlog_career_roles')
    .select('*')
    .eq('profileId', profileId)
    .order('startDate', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerRoleRow[];
}

export function rolesQuery(profileId: string) {
  return {
    key: ['learnlog-roles', profileId] as const,
    fetcher: () => fetchRoles(createClient(), profileId),
  };
}

export async function fetchCerts(supabase: SupabaseClient, profileId: string): Promise<CareerCertificationRow[]> {
  const { data, error } = await supabase
    .from('learnlog_career_certifications')
    .select('*')
    .eq('profileId', profileId)
    .order('earnedAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerCertificationRow[];
}

export function certsQuery(profileId: string) {
  return {
    key: ['learnlog-certs', profileId] as const,
    fetcher: () => fetchCerts(createClient(), profileId),
  };
}

export async function fetchCareerGoals(supabase: SupabaseClient, profileId: string): Promise<CareerGoalRow[]> {
  const { data, error } = await supabase
    .from('learnlog_career_goals')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerGoalRow[];
}

export function goalsQuery(profileId: string) {
  return {
    key: ['learnlog-goals', profileId] as const,
    fetcher: () => fetchCareerGoals(createClient(), profileId),
  };
}

export async function fetchReflections(supabase: SupabaseClient, profileId: string): Promise<ReflectionRow[]> {
  const { data, error } = await supabase
    .from('learnlog_reflections')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReflectionRow[];
}

export function reflectionsQuery(profileId: string) {
  return {
    key: ['learnlog-reflections', profileId] as const,
    fetcher: () => fetchReflections(createClient(), profileId),
  };
}
