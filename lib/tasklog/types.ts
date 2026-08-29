// lib/tasklog/types.ts

export type TaskLane = 'todo' | 'in_progress' | 'done';
export type TaskCategory = 'life' | 'work';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskRow {
  id: string;
  profileId: string;
  goalId: string | null;
  title: string;
  notes: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  lane: TaskLane | null;
  dueDate: string | null; // 'YYYY-MM-DD'
  plannedForToday: boolean;
  position: number;
  completedAt: string | null;
  createdAt: string;
}

export interface TaskGoalRow {
  id: string;
  profileId: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
}

export type IdeaCategory = 'idea' | 'startup' | 'business' | 'money' | 'other';
export type IdeaStatus = 'open' | 'planned' | 'archived';

export interface IdeaRow {
  id: string;
  profileId: string;
  title: string;
  notes: string | null;
  category: IdeaCategory;
  plan: string | null;
  status: IdeaStatus;
  createdAt: string;
}

export interface IdeaCategoryMeta {
  id: IdeaCategory;
  label: string;
}

export const IDEA_CATEGORIES: IdeaCategoryMeta[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'startup', label: 'Startup' },
  { id: 'business', label: 'Business' },
  { id: 'money', label: 'Money' },
  { id: 'other', label: 'Other' },
];

export interface LaneMeta {
  id: TaskLane;
  label: string;
}

export const LANES: LaneMeta[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

export interface PriorityMeta {
  id: TaskPriority;
  label: string;
  color: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { id: 'low', label: 'Low', color: '#60A5FA' },
  { id: 'medium', label: 'Medium', color: '#F59E0B' },
  { id: 'high', label: 'High', color: '#EF4444' },
];

export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
