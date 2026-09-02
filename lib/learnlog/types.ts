// lib/learnlog/types.ts

export type LibraryItemType = 'BOOK' | 'COURSE';
export type LibraryItemStatus = 'WANT' | 'IN_PROGRESS' | 'COMPLETED';

export interface LibraryItemRow {
  id: string;
  profileId: string;
  type: LibraryItemType;
  title: string;
  authorOrProvider: string | null;
  status: LibraryItemStatus;
  progressPercent: number;
  currentPosition: string | null;
  notes: string | null;
  rating: number | null;
  sourceUrl: string | null;
  cost: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillRow {
  id: string;
  profileId: string;
  name: string;
  category: string | null;
  level: number;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string | null;
  createdAt: string;
}

export interface SkillSessionRow {
  id: string;
  skillId: string;
  date: string;
  durationMinutes: number | null;
  notes: string | null;
  xpEarned: number;
  createdAt: string;
}

export interface SkillMilestoneRow {
  id: string;
  skillId: string;
  title: string;
  achievedAt: string | null;
  createdAt: string;
}

export interface CareerRoleRow {
  id: string;
  profileId: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CareerCertificationRow {
  id: string;
  profileId: string;
  name: string;
  issuer: string | null;
  earnedAt: string;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CareerGoalRow {
  id: string;
  profileId: string;
  title: string;
  targetDate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface ReflectionRow {
  id: string;
  profileId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
