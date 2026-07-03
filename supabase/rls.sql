-- Row Level Security policies for burnlog.
--
-- Prisma (via `prisma db push`) only creates tables/columns; it has no
-- concept of RLS. These policies previously lived only in the Supabase
-- dashboard of the deleted project and weren't version-controlled anywhere,
-- which is why they were lost along with the project. Run this file's
-- contents in the new project's SQL Editor right after `prisma db push`.
--
-- The client only ever uses the anon key, so every table it touches MUST
-- have RLS enabled with a matching policy below, or it will be either
-- unreadable/unwritable (RLS on, no policy) or world-readable/writable
-- (RLS off).
--
-- profiles.userId / push_subscriptions.user_id are auth.users(id) values
-- (auth.uid()). All other tables key off profiles.id ("profileId"), so
-- their policies join back through profiles to reach auth.uid().

-- profiles ------------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = "userId");

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = "userId");

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = "userId") with check (auth.uid() = "userId");

create policy "profiles_delete_own" on profiles
  for delete using (auth.uid() = "userId");

-- Tables owned via profiles.id ("profileId") ---------------------------
-- fitness_goals, workouts, workout_plans, sessions, weight_entries,
-- calorie_burns, food_intakes, stamina_sessions all share the same shape:
-- a row is visible/writable only if its profileId belongs to the caller.

do $$
declare
  t text;
begin
  foreach t in array array[
    'fitness_goals',
    'workouts',
    'workout_plans',
    'sessions',
    'weight_entries',
    'calorie_burns',
    'food_intakes',
    'stamina_sessions'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format($f$
      create policy %I on %I
        for all
        using (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
    $f$, t || '_owner_access', t, t, t);
  end loop;
end $$;

-- push_subscriptions ----------------------------------------------------
alter table push_subscriptions enable row level security;

create policy "push_subscriptions_owner_access" on push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
