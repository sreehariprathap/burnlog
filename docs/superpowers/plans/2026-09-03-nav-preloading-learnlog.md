# Nav Preloading — LearnLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism to LearnLog: nav-link prefetch, a query registry, converting LearnLog's five nav tabs to it, wiring the preload into `LearnLogBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as the five prior apps. LearnLog is cleanly factored already — each tab uses its own uniquely-keyed `useSWR` call (`'learnlog-skills'`, `'learnlog-library'`, `'learnlog-roles'`, `'learnlog-certs'`, `'learnlog-goals'`, `'learnlog-reflections'`, `'learnlog-home'`), no HomeLog-style key collisions or BurnLog/MoneyLog-style silent duplication exists here. This plan's job is the same extraction-and-wiring work as TaskLog's: pull each page's existing key+fetcher into `lib/learnlog/queries.ts` so `LearnLogBottomNav` can preload the exact same cache entries. One judgment call: Home's `fetchHomeData` bundles three Supabase queries (all skills, the one in-progress library item, the one active career goal) under a single `'learnlog-home'` key — unlike BurnLog's `useFinanceData` or TravelLog's free-time/holidays/surplus composite (both excluded from their plans as UI-parameterized or externally-sourced), this is three straightforward, stably-keyed Supabase queries with no user-interactive parameters, so it's registered here rather than excluded.

**Tech Stack:** Next.js App Router, `swr@2.5.1`, Supabase JS client, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plans (shared mechanism, already merged):**
- `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-moneylog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-tasklog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-travellog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-homelog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: `` [`${app}-${resource}`, profileId] `` — this app already follows it exactly (`'learnlog-skills'`, `'learnlog-home'`, etc.); the registry keeps every string unchanged.
- Zero `.tsx` component tests exist in this repo. Every fetcher in this plan calls Supabase directly (no `apiFetch`), so the `.tsx`-import gotcha from the MoneyLog/TravelLog plans does not apply here.
- `usePreloadRoutes`/`PreloadableQuery` (`lib/usePreloadRoutes.ts`) already exist — do not redefine them.

---

## File Structure

New files:
- `lib/learnlog/queries.ts` — LearnLog's query registry: `homeDataQuery`, `skillsQuery`, `libraryItemsQuery`, `rolesQuery`, `certsQuery`, `goalsQuery`, `reflectionsQuery`.
- `lib/learnlog/queries.test.ts` — Vitest coverage for all seven fetchers/factories.
- `app/(learnlog)/learnlog/loading.tsx` — Suspense fallback for `/learnlog/*`.

Modified files:
- `components/LearnLogBottomNav.tsx` — add `prefetch` to its tab `<Link>`s (never had it) and wire `usePreloadRoutes`.
- `app/(learnlog)/learnlog/page.tsx` (Home) — consume `homeDataQuery` instead of its own inline `fetchHomeData`.
- `app/(learnlog)/learnlog/library/page.tsx` — consume `libraryItemsQuery` instead of its own inline fetcher.
- `app/(learnlog)/learnlog/skills/page.tsx` — consume `skillsQuery` instead of its own inline fetcher.
- `app/(learnlog)/learnlog/career/page.tsx` — consume `rolesQuery`, `certsQuery`, `goalsQuery` instead of its three inline fetchers.
- `app/(learnlog)/learnlog/reflections/page.tsx` — consume `reflectionsQuery` instead of its own inline fetcher.

No deep page in scope — LearnLog's five nav tabs cover the app's full surface, matching the spec's original scope table.

---

## Task 1: LearnLog query registry

**Files:**
- Create: `lib/learnlog/queries.ts`
- Test: `lib/learnlog/queries.test.ts`

**Interfaces:**
- Consumes: `SkillRow`, `LibraryItemRow`, `CareerGoalRow`, `CareerRoleRow`, `CareerCertificationRow`, `ReflectionRow` (existing, `lib/learnlog/types.ts`).
- Produces:
  - `type HomeData = { skills: SkillRow[]; inProgressBook: LibraryItemRow | null; nextGoal: CareerGoalRow | null }`
  - `fetchHomeData(supabase: SupabaseClient, profileId: string): Promise<HomeData>`
  - `homeDataQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<HomeData> }`
  - `fetchSkills(supabase: SupabaseClient, profileId: string): Promise<SkillRow[]>`
  - `skillsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<SkillRow[]> }`
  - `fetchLibraryItems(supabase: SupabaseClient, profileId: string): Promise<LibraryItemRow[]>`
  - `libraryItemsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<LibraryItemRow[]> }`
  - `fetchRoles(supabase: SupabaseClient, profileId: string): Promise<CareerRoleRow[]>`
  - `rolesQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<CareerRoleRow[]> }`
  - `fetchCerts(supabase: SupabaseClient, profileId: string): Promise<CareerCertificationRow[]>`
  - `certsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<CareerCertificationRow[]> }`
  - `fetchCareerGoals(supabase: SupabaseClient, profileId: string): Promise<CareerGoalRow[]>`
  - `goalsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<CareerGoalRow[]> }`
  - `fetchReflections(supabase: SupabaseClient, profileId: string): Promise<ReflectionRow[]>`
  - `reflectionsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<ReflectionRow[]> }`

Note: `goalsQuery`/`fetchCareerGoals` here are named distinctly from `fetchGoals` in `career/page.tsx`'s current code — `fetchCareerGoals` (not `fetchGoals`) avoids any ambiguity with other apps' `goalsQuery` exports once multiple registries are imported side by side in shared code, though each registry is its own module so a same-named export across `lib/burnlog/queries.ts` and `lib/learnlog/queries.ts` would never actually collide — this is purely a within-file clarity choice.

- [ ] **Step 1: Write the registry**

```ts
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
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/learnlog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  fetchHomeData,
  fetchSkills,
  fetchLibraryItems,
  fetchRoles,
  fetchCerts,
  fetchCareerGoals,
  fetchReflections,
  homeDataQuery,
  skillsQuery,
  libraryItemsQuery,
  rolesQuery,
  certsQuery,
  goalsQuery,
  reflectionsQuery,
} from './queries';

// Same thenable-and-chainable mock shape as the other four registries.
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const limit = vi.fn().mockReturnValue(makeThenable({}));
  const order = vi.fn().mockReturnValue(makeThenable({ limit }));
  const eqSecond = makeThenable({ order });
  const eqFirst = makeThenable({ eq: vi.fn().mockReturnValue(eqSecond), order });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqFirst) });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchHomeData', () => {
  it('combines skills, the one in-progress book, and the one active goal', async () => {
    const skills = [{ id: 'sk1', title: 'Piano' }];
    const supabase = fakeSupabase({ data: skills, error: null });
    const result = await fetchHomeData(supabase, 'profile-1');
    // With one shared mock resolving every leg of the Promise.all, all
    // three legs resolve to the same `skills` payload — this test only
    // needs to confirm the aggregate shape and error-propagation path are
    // wired correctly, not that the mock differentiates per-table
    // responses (that's covered per-table by the other fetchers below).
    expect(result.skills).toEqual(skills);
  });

  it('throws when any of the three legs errors', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchHomeData(supabase, 'profile-1')).rejects.toThrow('boom');
  });
});

describe('fetchSkills', () => {
  it('returns the profile\'s skills', async () => {
    const skills = [{ id: 'sk1', title: 'Piano', currentStreak: 3 }];
    const supabase = fakeSupabase({ data: skills, error: null });
    const result = await fetchSkills(supabase, 'profile-1');
    expect(result).toEqual(skills);
  });

  it('throws on a Supabase error', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchSkills(supabase, 'profile-1')).rejects.toThrow('boom');
  });
});

describe('fetchLibraryItems', () => {
  it('returns the profile\'s library items', async () => {
    const items = [{ id: 'l1', title: 'Atomic Habits', status: 'IN_PROGRESS' }];
    const supabase = fakeSupabase({ data: items, error: null });
    const result = await fetchLibraryItems(supabase, 'profile-1');
    expect(result).toEqual(items);
  });
});

describe('fetchRoles', () => {
  it('returns the profile\'s career roles', async () => {
    const roles = [{ id: 'r1', title: 'Engineer' }];
    const supabase = fakeSupabase({ data: roles, error: null });
    const result = await fetchRoles(supabase, 'profile-1');
    expect(result).toEqual(roles);
  });
});

describe('fetchCerts', () => {
  it('returns the profile\'s certifications', async () => {
    const certs = [{ id: 'c1', title: 'AWS Certified' }];
    const supabase = fakeSupabase({ data: certs, error: null });
    const result = await fetchCerts(supabase, 'profile-1');
    expect(result).toEqual(certs);
  });
});

describe('fetchCareerGoals', () => {
  it('returns the profile\'s career goals', async () => {
    const goals = [{ id: 'g1', title: 'Get promoted' }];
    const supabase = fakeSupabase({ data: goals, error: null });
    const result = await fetchCareerGoals(supabase, 'profile-1');
    expect(result).toEqual(goals);
  });
});

describe('fetchReflections', () => {
  it('returns the profile\'s reflections', async () => {
    const reflections = [{ id: 're1', title: 'Q3 review' }];
    const supabase = fakeSupabase({ data: reflections, error: null });
    const result = await fetchReflections(supabase, 'profile-1');
    expect(result).toEqual(reflections);
  });
});

describe('registry key shapes', () => {
  it('homeDataQuery keys by app+resource+profileId', () => {
    expect(homeDataQuery('profile-1').key).toEqual(['learnlog-home', 'profile-1']);
  });

  it('skillsQuery keys by app+resource+profileId', () => {
    expect(skillsQuery('profile-1').key).toEqual(['learnlog-skills', 'profile-1']);
  });

  it('libraryItemsQuery keys by app+resource+profileId', () => {
    expect(libraryItemsQuery('profile-1').key).toEqual(['learnlog-library', 'profile-1']);
  });

  it('rolesQuery keys by app+resource+profileId', () => {
    expect(rolesQuery('profile-1').key).toEqual(['learnlog-roles', 'profile-1']);
  });

  it('certsQuery keys by app+resource+profileId', () => {
    expect(certsQuery('profile-1').key).toEqual(['learnlog-certs', 'profile-1']);
  });

  it('goalsQuery keys by app+resource+profileId', () => {
    expect(goalsQuery('profile-1').key).toEqual(['learnlog-goals', 'profile-1']);
  });

  it('reflectionsQuery keys by app+resource+profileId', () => {
    expect(reflectionsQuery('profile-1').key).toEqual(['learnlog-reflections', 'profile-1']);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/learnlog/queries.test.ts`
Expected: all tests PASS. If `fetchHomeData`'s `.limit()` chain fails because a step in the mock isn't both thenable and chainable at the right depth, extend `fakeSupabase` (not the source file) the same way each prior plan's mock was fixed.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/learnlog/queries"` — expect no output.
Run: `npx eslint lib/learnlog/queries.ts lib/learnlog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/learnlog/queries.ts lib/learnlog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add LearnLog query registry (home, skills, library, roles, certs, goals, reflections)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `page.tsx` (Home) to `homeDataQuery`

**Files:**
- Modify: `app/(learnlog)/learnlog/page.tsx`

**Interfaces:**
- Consumes: `homeDataQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { FlameIcon, type FlameIconHandle } from '@/components/ui/flame';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { GroupInvitesBanner } from '@/components/learnlog/GroupInvitesBanner';
import type { SkillRow, LibraryItemRow, CareerGoalRow } from '@/lib/learnlog/types';

async function fetchHomeData(profileId: string) {
  const supabase = createClient();
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

export default function LearnLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(
    profile ? ['learnlog-home', profile.id] : null,
    () => fetchHomeData(profile!.id)
  );
```

to:

```tsx
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { FlameIcon, type FlameIconHandle } from '@/components/ui/flame';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { GroupInvitesBanner } from '@/components/learnlog/GroupInvitesBanner';
import { homeDataQuery } from '@/lib/learnlog/queries';

export default function LearnLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(
    profile ? homeDataQuery(profile.id).key : null,
    profile ? homeDataQuery(profile.id).fetcher : null
  );
```

(`SkillRow`, `LibraryItemRow`, `CareerGoalRow` are no longer referenced directly in this file — the registry's `fetchHomeData` owns those casts now. `createClient` is also no longer called directly here.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "\(learnlog\)/learnlog/page"` — expect no output.
Run: `npx eslint "app/(learnlog)/learnlog/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(learnlog)/learnlog/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: LearnLog home page consumes shared homeDataQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `library/page.tsx` to `libraryItemsQuery`

**Files:**
- Modify: `app/(learnlog)/learnlog/library/page.tsx`

**Interfaces:**
- Consumes: `libraryItemsQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plus, Star, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { createTaskLogTask, logToMoneyLog } from '@/lib/learnlog/crossApp';
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
import type { LibraryItemRow } from '@/lib/learnlog/types';
import { LibraryItemDrawer } from './_components/LibraryItemDrawer';

async function fetchLibraryItems(profileId: string): Promise<LibraryItemRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_library_items')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LibraryItemRow[];
}

const STATUS_LABEL: Record<string, string> = {
  WANT: 'Want to read/take',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export default function LearnLogLibraryPage() {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shareItem, setShareItem] = useState<LibraryItemRow | null>(null);
  const { data: items, isLoading, mutate } = useSWR(
    profile ? ['learnlog-library', profile.id] : null,
    () => fetchLibraryItems(profile!.id)
  );
```

to:

```tsx
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plus, Star, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { createTaskLogTask, logToMoneyLog } from '@/lib/learnlog/crossApp';
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
import type { LibraryItemRow } from '@/lib/learnlog/types';
import { libraryItemsQuery } from '@/lib/learnlog/queries';
import { LibraryItemDrawer } from './_components/LibraryItemDrawer';

const STATUS_LABEL: Record<string, string> = {
  WANT: 'Want to read/take',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export default function LearnLogLibraryPage() {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shareItem, setShareItem] = useState<LibraryItemRow | null>(null);
  const { data: items, isLoading, mutate } = useSWR(
    profile ? libraryItemsQuery(profile.id).key : null,
    profile ? libraryItemsQuery(profile.id).fetcher : null
  );
```

(`LibraryItemRow` stays imported — still used for the `shareItem` state's type. `createClient` is no longer called directly in this file's fetch path, but check whether any other handler in the file — e.g. a create/update/delete action — still calls `createClient()`/`supabase.` directly before removing the import: run `grep -n "supabase\.\|createClient" "app/(learnlog)/learnlog/library/page.tsx"` and keep the import if anything besides the deleted fetcher used it.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "library/page"` — expect no output.
Run: `npx eslint "app/(learnlog)/learnlog/library/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(learnlog)/learnlog/library/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: library page consumes shared libraryItemsQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `skills/page.tsx` to `skillsQuery`

**Files:**
- Modify: `app/(learnlog)/learnlog/skills/page.tsx`

**Interfaces:**
- Consumes: `skillsQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Flame } from 'lucide-react';
import type { SkillRow } from '@/lib/learnlog/types';
import { SkillDrawer } from './_components/SkillDrawer';

async function fetchSkills(profileId: string): Promise<SkillRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_skills')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export default function LearnLogSkillsPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: skills, isLoading, mutate } = useSWR(
    profile ? ['learnlog-skills', profile.id] : null,
    () => fetchSkills(profile!.id)
  );
```

to:

```tsx
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Flame } from 'lucide-react';
import { skillsQuery } from '@/lib/learnlog/queries';
import { SkillDrawer } from './_components/SkillDrawer';

export default function LearnLogSkillsPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: skills, isLoading, mutate } = useSWR(
    profile ? skillsQuery(profile.id).key : null,
    profile ? skillsQuery(profile.id).fetcher : null
  );
```

(Check for any other `supabase.`/`createClient` usage in this file the same way as Task 3, before dropping the import — a "log a session" or "delete skill" handler may still need it.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "skills/page"` — expect no output.
Run: `npx eslint "app/(learnlog)/learnlog/skills/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(learnlog)/learnlog/skills/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: skills page consumes shared skillsQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Convert `career/page.tsx` to `rolesQuery`/`certsQuery`/`goalsQuery`

**Files:**
- Modify: `app/(learnlog)/learnlog/career/page.tsx`

**Interfaces:**
- Consumes: `rolesQuery`, `certsQuery`, `goalsQuery` (Task 1).

- [ ] **Step 1: Replace the three inline fetchers**

Change:

```tsx
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
import type { CareerRoleRow, CareerCertificationRow, CareerGoalRow } from '@/lib/learnlog/types';
import { RoleDrawer } from './_components/RoleDrawer';
import { CertDrawer } from './_components/CertDrawer';
import { GoalDrawer } from './_components/GoalDrawer';

async function fetchRoles(profileId: string): Promise<CareerRoleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_roles').select('*').eq('profileId', profileId).order('startDate', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerRoleRow[];
}

async function fetchCerts(profileId: string): Promise<CareerCertificationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_certifications').select('*').eq('profileId', profileId).order('earnedAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerCertificationRow[];
}

async function fetchGoals(profileId: string): Promise<CareerGoalRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_goals').select('*').eq('profileId', profileId).order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerGoalRow[];
}

export default function LearnLogCareerPage() {
  const { profile } = useCurrentProfile();
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [certDrawerOpen, setCertDrawerOpen] = useState(false);
  const [goalDrawerOpen, setGoalDrawerOpen] = useState(false);
  const [shareGoal, setShareGoal] = useState<CareerGoalRow | null>(null);

  const { data: roles, mutate: mutateRoles } = useSWR(profile ? ['learnlog-roles', profile.id] : null, () => fetchRoles(profile!.id));
  const { data: certs, mutate: mutateCerts } = useSWR(profile ? ['learnlog-certs', profile.id] : null, () => fetchCerts(profile!.id));
  const { data: goals, mutate: mutateGoals } = useSWR(profile ? ['learnlog-goals', profile.id] : null, () => fetchGoals(profile!.id));
```

to:

```tsx
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
import type { CareerGoalRow } from '@/lib/learnlog/types';
import { rolesQuery, certsQuery, goalsQuery } from '@/lib/learnlog/queries';
import { RoleDrawer } from './_components/RoleDrawer';
import { CertDrawer } from './_components/CertDrawer';
import { GoalDrawer } from './_components/GoalDrawer';

export default function LearnLogCareerPage() {
  const { profile } = useCurrentProfile();
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [certDrawerOpen, setCertDrawerOpen] = useState(false);
  const [goalDrawerOpen, setGoalDrawerOpen] = useState(false);
  const [shareGoal, setShareGoal] = useState<CareerGoalRow | null>(null);

  const { data: roles, mutate: mutateRoles } = useSWR(
    profile ? rolesQuery(profile.id).key : null,
    profile ? rolesQuery(profile.id).fetcher : null
  );
  const { data: certs, mutate: mutateCerts } = useSWR(
    profile ? certsQuery(profile.id).key : null,
    profile ? certsQuery(profile.id).fetcher : null
  );
  const { data: goals, mutate: mutateGoals } = useSWR(
    profile ? goalsQuery(profile.id).key : null,
    profile ? goalsQuery(profile.id).fetcher : null
  );
```

(`CareerGoalRow` stays imported — still used for `shareGoal`'s type. `CareerRoleRow`/`CareerCertificationRow` are dropped since nothing else in the file names them directly. Check `supabase.`/`createClient` usage elsewhere in the file the same way as Tasks 3–4 before removing that import.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "career/page"` — expect no output.
Run: `npx eslint "app/(learnlog)/learnlog/career/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(learnlog)/learnlog/career/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: career page consumes shared rolesQuery/certsQuery/goalsQuery registry entries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: Convert `reflections/page.tsx` to `reflectionsQuery`

**Files:**
- Modify: `app/(learnlog)/learnlog/reflections/page.tsx`

**Interfaces:**
- Consumes: `reflectionsQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import type { ReflectionRow } from '@/lib/learnlog/types';
import { ReflectionDrawer } from './_components/ReflectionDrawer';

async function fetchReflections(profileId: string): Promise<ReflectionRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_reflections')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReflectionRow[];
}

export default function LearnLogReflectionsPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: reflections, isLoading, mutate } = useSWR(
    profile ? ['learnlog-reflections', profile.id] : null,
    () => fetchReflections(profile!.id)
  );
```

to:

```tsx
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { reflectionsQuery } from '@/lib/learnlog/queries';
import { ReflectionDrawer } from './_components/ReflectionDrawer';

export default function LearnLogReflectionsPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: reflections, isLoading, mutate } = useSWR(
    profile ? reflectionsQuery(profile.id).key : null,
    profile ? reflectionsQuery(profile.id).fetcher : null
  );
```

(Check `supabase.`/`createClient` usage elsewhere in the file the same way as the prior three tasks before removing that import.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "reflections/page"` — expect no output.
Run: `npx eslint "app/(learnlog)/learnlog/reflections/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(learnlog)/learnlog/reflections/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: reflections page consumes shared reflectionsQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 7: Prefetch + preload wiring in `LearnLogBottomNav`

**Files:**
- Modify: `components/LearnLogBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (existing), `useCurrentProfile()`, all seven registry query factories (Task 1).

- [ ] **Step 1: Add prefetch + the preload call**

Change:

```tsx
// components/LearnLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { LibraryIcon, DumbbellIcon, BriefcaseIcon, NotebookPenIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LearnLogMark } from '@/components/LearnLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/learnlog', label: 'Home', Icon: null },
  { href: '/learnlog/library', label: 'Library', Icon: LibraryIcon },
  { href: '/learnlog/skills', label: 'Skills', Icon: DumbbellIcon },
  { href: '/learnlog/career', label: 'Career', Icon: BriefcaseIcon },
  { href: '/learnlog/reflections', label: 'Reflect', Icon: NotebookPenIcon },
];

export function LearnLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/learnlog/config' || pathname.startsWith('/learnlog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/learnlog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
```

to:

```tsx
// components/LearnLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { LibraryIcon, DumbbellIcon, BriefcaseIcon, NotebookPenIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LearnLogMark } from '@/components/LearnLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import {
  homeDataQuery,
  libraryItemsQuery,
  skillsQuery,
  rolesQuery,
  certsQuery,
  goalsQuery,
  reflectionsQuery,
} from '@/lib/learnlog/queries';

const tabs = [
  { href: '/learnlog', label: 'Home', Icon: null },
  { href: '/learnlog/library', label: 'Library', Icon: LibraryIcon },
  { href: '/learnlog/skills', label: 'Skills', Icon: DumbbellIcon },
  { href: '/learnlog/career', label: 'Career', Icon: BriefcaseIcon },
  { href: '/learnlog/reflections', label: 'Reflect', Icon: NotebookPenIcon },
];

export function LearnLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/learnlog/config' || pathname.startsWith('/learnlog/config/');

  // Warms every nav tab's data: Home, Library, Skills, Career (roles +
  // certs + goals), and Reflections.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [
          homeDataQuery(profile.id),
          libraryItemsQuery(profile.id),
          skillsQuery(profile.id),
          rolesQuery(profile.id),
          certsQuery(profile.id),
          goalsQuery(profile.id),
          reflectionsQuery(profile.id),
        ]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/learnlog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={isActive ? 'page' : undefined}
            className={cn(
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "LearnLogBottomNav"` — expect no output.
Run: `npx eslint components/LearnLogBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, land on `/learnlog`. Wait ~1 second, then tap "Library", "Skills", "Career", and "Reflect" in sequence. Confirm: no new `learnlog_*` request fires for any of them, and all render with no loading skeleton flash.

- [ ] **Step 4: Commit**

```bash
git add components/LearnLogBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: LearnLogBottomNav prefetches tab links and preloads their data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 8: `loading.tsx` for LearnLog + full verification pass

**Files:**
- Create: `app/(learnlog)/learnlog/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(learnlog)/learnlog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function LearnLogLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
```

Same generic shape as the prior five apps' `loading.tsx`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "learnlog/loading"` — expect no output.
Run: `npx eslint "app/(learnlog)/learnlog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Throttle the network, hard-navigate to `/learnlog/skills` via URL bar, confirm `LearnLogLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(learnlog)/**/*.tsx" "lib/learnlog/**/*.ts" components/LearnLogBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(learnlog)/learnlog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /learnlog/* so prefetch fully warms dynamic routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** all five LearnLog nav tabs converted (Tasks 2–6), prefetch + preload wiring (Task 7), `loading.tsx` (Task 8). No deep page or Server Component exclusion applies to this app.
- **No drift bug found here, matching TaskLog's plan** — stated plainly; LearnLog's pages were already cleanly keyed with no collisions before this plan touched them. The one judgment call (registering Home's composite `fetchHomeData` rather than excluding it like BurnLog's/TravelLog's page-internal composites) is explained in the Architecture section: the deciding factor is whether a composite fetch has a stable key with no UI-interactive parameters, not whether it touches more than one table.
- **Type consistency check:** all seven fetchers return exactly the types each page already typed its data as (`SkillRow[]`, `LibraryItemRow[]`, `CareerRoleRow[]`, `CareerCertificationRow[]`, `CareerGoalRow[]`, `ReflectionRow[]`, and the composite `HomeData`) — traced from each page's pre-existing `as XRow[]` casts, carried into the registry's fetcher return types unchanged. `goalsQuery`'s underlying `fetchCareerGoals` is deliberately renamed from the original file's `fetchGoals` to read unambiguously once several apps' registries might be imported in the same file elsewhere — noted explicitly in Task 1 rather than left as an unexplained naming choice.
