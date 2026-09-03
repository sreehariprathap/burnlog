// lib/tasklog/queries.ts
//
// Single source of truth for TaskLog's preloadable page queries — same
// pattern as lib/burnlog/queries.ts and lib/moneylog/queries.ts. Every key
// here matches the string this app's pages already used before this
// registry existed (see e.g. app/(tasklog)/tasklog/page.tsx's
// ['tasklog-today', profileId]) — unchanged on purpose, so no cache entry
// is orphaned by a rename.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { todayDateString, type TaskRow, type IdeaRow, type TaskGoalRow } from '@/lib/tasklog/types';

export async function fetchTodayTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]> {
  const today = todayDateString();
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('*')
    .eq('profileId', profileId)
    .or(`dueDate.eq.${today},plannedForToday.eq.true`)
    .order('dueDate', { ascending: true });
  return (data as TaskRow[]) ?? [];
}

export function todayTasksQuery(profileId: string) {
  return {
    key: ['tasklog-today', profileId] as const,
    fetcher: () => fetchTodayTasks(createClient(), profileId),
  };
}

export async function fetchBoardTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]> {
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('*')
    .eq('profileId', profileId)
    .not('lane', 'is', null)
    .order('position', { ascending: true });
  return (data as TaskRow[]) ?? [];
}

export function boardTasksQuery(profileId: string) {
  return {
    key: ['tasklog-board', profileId] as const,
    fetcher: () => fetchBoardTasks(createClient(), profileId),
  };
}

export async function fetchInboxTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]> {
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('*')
    .eq('profileId', profileId)
    .is('lane', null)
    .order('createdAt', { ascending: false });
  return (data as TaskRow[]) ?? [];
}

export function inboxTasksQuery(profileId: string) {
  return {
    key: ['tasklog-inbox', profileId] as const,
    fetcher: () => fetchInboxTasks(createClient(), profileId),
  };
}

export async function fetchIdeas(supabase: SupabaseClient, profileId: string): Promise<IdeaRow[]> {
  const { data } = await supabase
    .from('tasklog_ideas')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  return (data as IdeaRow[]) ?? [];
}

export function ideasQuery(profileId: string) {
  return {
    key: ['tasklog-ideas', profileId] as const,
    fetcher: () => fetchIdeas(createClient(), profileId),
  };
}

export async function fetchIdeaTaskCounts(supabase: SupabaseClient, profileId: string): Promise<{ ideaId: string }[]> {
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('ideaId')
    .eq('profileId', profileId)
    .not('ideaId', 'is', null);
  return (data as { ideaId: string }[]) ?? [];
}

export function ideaTaskCountsQuery(profileId: string) {
  return {
    key: ['tasklog-idea-task-counts', profileId] as const,
    fetcher: () => fetchIdeaTaskCounts(createClient(), profileId),
  };
}

export async function fetchGoals(supabase: SupabaseClient, profileId: string): Promise<TaskGoalRow[]> {
  const { data } = await supabase
    .from('task_goals')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  return (data as TaskGoalRow[]) ?? [];
}

export function goalsQuery(profileId: string) {
  return {
    key: ['tasklog-goals', profileId] as const,
    fetcher: () => fetchGoals(createClient(), profileId),
  };
}
