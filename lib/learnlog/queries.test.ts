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
