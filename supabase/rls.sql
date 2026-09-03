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

-- _prisma_migrations: Prisma's own bookkeeping table. Never queried via the
-- anon/authenticated roles (the migration engine connects directly as the
-- database owner, bypassing RLS), so enabling RLS with no policies simply
-- locks out roles that have no legitimate reason to touch it.
alter table "_prisma_migrations" enable row level security;

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
-- calorie_burns, food_intakes, stamina_sessions, step_entries all share
-- the same shape: a row is visible/writable only if its profileId
-- belongs to the caller.

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
    'stamina_sessions',
    'step_entries',
    'water_entries',
    'recurring_items',
    'finance_transactions',
    'financial_goals',
    'meal_plan_entries',
    'meal_plan_checkins',
    'grocery_lists',
    'scheduled_reminders',
    'food_favorites',
    'workout_templates',
    'task_goals',
    'tasklog_tasks',
    'tasklog_ideas',
    'myday_blocks'
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

-- ai_model_settings -----------------------------------------------------
-- Global (non-per-user) config: any authenticated user may read it (every
-- AI route needs to resolve the active model regardless of who's calling),
-- but only an admin (profiles.isAdmin = true) may write it. This is the
-- first admin-gated RLS policy in this file — everywhere else "admin" is
-- currently only a client-side UI check.
alter table ai_model_settings enable row level security;

create policy "ai_model_settings_select_any_authenticated" on ai_model_settings
  for select
  using (auth.uid() is not null);

create policy "ai_model_settings_admin_write" on ai_model_settings
  for insert
  with check (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );

create policy "ai_model_settings_admin_update" on ai_model_settings
  for update
  using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );

-- ai_jobs -----------------------------------------------------------------
-- Owned via profileId, same shape as the owner-loop tables above (kept
-- separate since it was added after that loop existed).
alter table ai_jobs enable row level security;

create policy "ai_jobs_owner_access" on ai_jobs
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = ai_jobs."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = ai_jobs."profileId"
        and profiles."userId" = auth.uid()
    )
  );

-- avatars storage bucket ------------------------------------------------
-- Public read (avatars are just profile pictures); writes restricted to
-- objects under the caller's own auth.uid() folder, e.g. avatars/{uid}/*.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- programs / program_weeks ------------------------------------------------
-- programs is owned directly via profileId (same shape as the owner-loop
-- tables). program_weeks has no profileId of its own — ownership is via
-- its parent program row, so it gets a bespoke join-based policy instead
-- of joining the generic do-loop.
alter table programs enable row level security;

create policy "programs_owner_access" on programs
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = programs."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = programs."profileId"
        and profiles."userId" = auth.uid()
    )
  );

alter table program_weeks enable row level security;

create policy "program_weeks_owner_access" on program_weeks
  for all
  using (
    exists (
      select 1 from programs
      join profiles on profiles.id = programs."profileId"
      where programs.id = program_weeks."programId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from programs
      join profiles on profiles.id = programs."profileId"
      where programs.id = program_weeks."programId"
        and profiles."userId" = auth.uid()
    )
  );

-- friendships -----------------------------------------------------------
-- Not accessed directly by client-side Supabase calls (all social features
-- go through app/api/social/* routes using the service-role client, which
-- bypasses RLS and does its own authorization). RLS is still enabled here
-- as a defensive default matching every other table in this file.
alter table friendships enable row level security;

create policy "friendships_select_own" on friendships
  for select using (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );

create policy "friendships_insert_own" on friendships
  for insert with check (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
  );

create policy "friendships_update_addressee" on friendships
  for update using (
    exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  )
  with check (
    exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );

create policy "friendships_delete_own" on friendships
  for delete using (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );

-- households / household_members / household_invites --------------------
-- Same posture as friendships: all mutations go through app/api/homelog/*
-- routes using the service-role client (create/invite/accept/decline/leave/
-- remove-member all need cross-profile authorization logic RLS can't express
-- alone). These read-only policies are a defensive default so client-side
-- reads (listing my household/members/invites) work without needing the
-- service role.
alter table households enable row level security;

create policy "households_member_read" on households
  for select using (
    exists (
      select 1 from household_members hm
      join profiles p on p.id = hm."profileId"
      where hm."householdId" = households.id and p."userId" = auth.uid()
    )
  );

alter table household_members enable row level security;

create policy "household_members_read" on household_members
  for select using (
    exists (
      select 1 from household_members hm2
      join profiles p on p.id = hm2."profileId"
      where hm2."householdId" = household_members."householdId" and p."userId" = auth.uid()
    )
  );

alter table household_invites enable row level security;

create policy "household_invites_read_own" on household_invites
  for select using (
    exists (select 1 from profiles p where p.id = household_invites."inviteeId" and p."userId" = auth.uid())
    or exists (select 1 from profiles p where p.id = household_invites."invitedById" and p."userId" = auth.uid())
  );

-- household_chores / _instances, _inventory_items, _shopping_list_items,
-- _expenses / _splits, _settlements -----------------------------------
-- Same posture as the tables above: every mutation (and every read that
-- needs another member's name) goes through app/api/homelog/* using the
-- service-role client. These are defensive read policies only.
alter table household_chores enable row level security;
create policy "household_chores_member_read" on household_chores
  for select using (
    exists (
      select 1 from household_members hm
      join profiles p on p.id = hm."profileId"
      where hm."householdId" = household_chores."householdId" and p."userId" = auth.uid()
    )
  );

alter table household_chore_instances enable row level security;
create policy "household_chore_instances_member_read" on household_chore_instances
  for select using (
    exists (
      select 1 from household_chores hc
      join household_members hm on hm."householdId" = hc."householdId"
      join profiles p on p.id = hm."profileId"
      where hc.id = household_chore_instances."choreId" and p."userId" = auth.uid()
    )
  );

alter table household_inventory_items enable row level security;
create policy "household_inventory_items_member_read" on household_inventory_items
  for select using (
    exists (
      select 1 from household_members hm
      join profiles p on p.id = hm."profileId"
      where hm."householdId" = household_inventory_items."householdId" and p."userId" = auth.uid()
    )
  );

alter table household_shopping_list_items enable row level security;
create policy "household_shopping_list_items_member_read" on household_shopping_list_items
  for select using (
    exists (
      select 1 from household_members hm
      join profiles p on p.id = hm."profileId"
      where hm."householdId" = household_shopping_list_items."householdId" and p."userId" = auth.uid()
    )
  );

alter table household_expenses enable row level security;
create policy "household_expenses_member_read" on household_expenses
  for select using (
    exists (
      select 1 from household_members hm
      join profiles p on p.id = hm."profileId"
      where hm."householdId" = household_expenses."householdId" and p."userId" = auth.uid()
    )
  );

alter table household_expense_splits enable row level security;
create policy "household_expense_splits_member_read" on household_expense_splits
  for select using (
    exists (
      select 1 from household_expenses he
      join household_members hm on hm."householdId" = he."householdId"
      join profiles p on p.id = hm."profileId"
      where he.id = household_expense_splits."expenseId" and p."userId" = auth.uid()
    )
  );

alter table household_settlements enable row level security;
create policy "household_settlements_member_read" on household_settlements
  for select using (
    exists (
      select 1 from household_members hm
      join profiles p on p.id = hm."profileId"
      where hm."householdId" = household_settlements."householdId" and p."userId" = auth.uid()
    )
  );

-- sociallog ---------------------------------------------------------------
-- social_posts / social_comments / social_votes: publicly readable (it's a
-- feed), writable only by the row's own profile.
do $$
declare
  t text;
begin
  foreach t in array array['social_posts', 'social_comments', 'social_votes']
  loop
    execute format('alter table %I enable row level security', t);

    execute format($f$
      create policy %I on %I
        for select using (true)
    $f$, t || '_public_read', t);

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
    $f$, t || '_owner_write', t, t, t);
  end loop;
end $$;

-- social_follows: publicly readable (follower/following counts), but a
-- profile may only create/remove follow rows where it is the follower.
alter table social_follows enable row level security;

create policy "social_follows_public_read" on social_follows
  for select using (true);

create policy "social_follows_follower_write" on social_follows
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = social_follows."followerId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = social_follows."followerId"
        and profiles."userId" = auth.uid()
    )
  );

-- social_topics / social_post_topics: publicly readable; no client-side
-- write policy (only the service-role API routes create/link topics).
alter table social_topics enable row level security;
create policy "social_topics_public_read" on social_topics
  for select using (true);

alter table social_post_topics enable row level security;
create policy "social_post_topics_public_read" on social_post_topics
  for select using (true);

-- social_message_threads / social_messages: visible only to participants.
alter table social_message_threads enable row level security;

create policy "social_message_threads_participant_read" on social_message_threads
  for select using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and (profiles.id = social_message_threads."participantAId" or profiles.id = social_message_threads."participantBId")
    )
  );

alter table social_messages enable row level security;

create policy "social_messages_participant_read" on social_messages
  for select using (
    exists (
      select 1 from social_message_threads t
      join profiles on profiles."userId" = auth.uid()
      where t.id = social_messages."threadId"
        and (profiles.id = t."participantAId" or profiles.id = t."participantBId")
    )
  );

create policy "social_messages_sender_insert" on social_messages
  for insert with check (
    exists (
      select 1 from social_message_threads t
      join profiles on profiles."userId" = auth.uid()
      where t.id = social_messages."threadId"
        and profiles.id = social_messages."senderId"
        and (profiles.id = t."participantAId" or profiles.id = t."participantBId")
    )
  );

-- social_profile_settings: bio/privacy flags are publicly readable (needed
-- to render other users' profile cards), writable only by the owner.
alter table social_profile_settings enable row level security;

create policy "social_profile_settings_public_read" on social_profile_settings
  for select using (true);

create policy "social_profile_settings_owner_write" on social_profile_settings
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = social_profile_settings."profileId"
        and profiles."userId" = auth.uid()
    )
  );

create policy "social_profile_settings_owner_update" on social_profile_settings
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = social_profile_settings."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = social_profile_settings."profileId"
        and profiles."userId" = auth.uid()
    )
  );

-- sociallog-media storage bucket --------------------------------------------
insert into storage.buckets (id, name, public)
values ('sociallog-media', 'sociallog-media', true)
on conflict (id) do nothing;

create policy "sociallog_media_public_read" on storage.objects
  for select
  using (bucket_id = 'sociallog-media');

create policy "sociallog_media_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sociallog_media_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sociallog_media_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- shoppinglog ---------------------------------------------------------------
-- shop_categories: public read, no client write (seeded server-side only).
alter table shop_categories enable row level security;
create policy "shop_categories_public_read" on shop_categories
  for select using (true);

-- shop_listings / shop_listing_images / shop_reviews: publicly readable,
-- writable only by the owning profile.
do $$
declare
  t text;
begin
  foreach t in array array['shop_listings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($f$ create policy %I on %I for select using (true) $f$, t || '_public_read', t);
    execute format($f$
      create policy %I on %I
        for all
        using (exists (select 1 from profiles where profiles.id = %I."sellerId" and profiles."userId" = auth.uid()))
        with check (exists (select 1 from profiles where profiles.id = %I."sellerId" and profiles."userId" = auth.uid()))
    $f$, t || '_owner_write', t, t, t);
  end loop;
end $$;

alter table shop_listing_images enable row level security;
create policy "shop_listing_images_public_read" on shop_listing_images
  for select using (true);
create policy "shop_listing_images_owner_write" on shop_listing_images
  for all
  using (
    exists (
      select 1 from shop_listings sl
      join profiles p on p.id = sl."sellerId"
      where sl.id = shop_listing_images."listingId" and p."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from shop_listings sl
      join profiles p on p.id = sl."sellerId"
      where sl.id = shop_listing_images."listingId" and p."userId" = auth.uid()
    )
  );

alter table shop_reviews enable row level security;
create policy "shop_reviews_public_read" on shop_reviews
  for select using (true);
create policy "shop_reviews_owner_write" on shop_reviews
  for all
  using (exists (select 1 from profiles where profiles.id = shop_reviews."reviewerId" and profiles."userId" = auth.uid()))
  with check (exists (select 1 from profiles where profiles.id = shop_reviews."reviewerId" and profiles."userId" = auth.uid()));

-- shop_favorites / shop_cart_items: private, owner-only.
do $$
declare
  t text;
begin
  foreach t in array array['shop_favorites', 'shop_cart_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %I on %I
        for all
        using (exists (select 1 from profiles where profiles.id = %I."profileId" and profiles."userId" = auth.uid()))
        with check (exists (select 1 from profiles where profiles.id = %I."profileId" and profiles."userId" = auth.uid()))
    $f$, t || '_owner_access', t, t, t);
  end loop;
end $$;

-- shop_orders / shop_order_items: participant-only read, no direct client
-- write (created only via the service-role checkout API route).
alter table shop_orders enable row level security;
create policy "shop_orders_participant_read" on shop_orders
  for select using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and (profiles.id = shop_orders."buyerId" or profiles.id = shop_orders."sellerId")
    )
  );

alter table shop_order_items enable row level security;
create policy "shop_order_items_participant_read" on shop_order_items
  for select using (
    exists (
      select 1 from shop_orders so
      join profiles p on p."userId" = auth.uid()
      where so.id = shop_order_items."orderId"
        and (p.id = so."buyerId" or p.id = so."sellerId")
    )
  );

-- shoplog-media storage bucket --------------------------------------------
insert into storage.buckets (id, name, public)
values ('shoplog-media', 'shoplog-media', true)
on conflict (id) do nothing;

create policy "shoplog_media_public_read" on storage.objects
  for select
  using (bucket_id = 'shoplog-media');

create policy "shoplog_media_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'shoplog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "shoplog_media_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'shoplog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'shoplog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "shoplog_media_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'shoplog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- adminlog_toggles / adminlog_toggle_overrides ---------------------------
-- Unified on/off switch for apps and beta features. Any authenticated user
-- may read both tables (every client resolves its own effective toggle
-- state); only an admin (profiles.isAdmin = true) may write. Same
-- admin-gated shape as ai_model_settings.
alter table adminlog_toggles enable row level security;

create policy "adminlog_toggles_select_any_authenticated" on adminlog_toggles
  for select
  using (auth.uid() is not null);

create policy "adminlog_toggles_admin_write" on adminlog_toggles
  for insert
  with check (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

create policy "adminlog_toggles_admin_update" on adminlog_toggles
  for update
  using (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  )
  with check (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

alter table adminlog_toggle_overrides enable row level security;

create policy "adminlog_toggle_overrides_select_any_authenticated" on adminlog_toggle_overrides
  for select
  using (auth.uid() is not null);

create policy "adminlog_toggle_overrides_admin_write" on adminlog_toggle_overrides
  for insert
  with check (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

create policy "adminlog_toggle_overrides_admin_update" on adminlog_toggle_overrides
  for update
  using (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  )
  with check (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

create policy "adminlog_toggle_overrides_admin_delete" on adminlog_toggle_overrides
  for delete
  using (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

-- adminlog_error_logs -----------------------------------------------------
-- Persisted client/server error log. Any authenticated user may insert
-- (their own client-side errors get reported here regardless of whether
-- an admin is watching); only admins may read or mark resolved.
alter table adminlog_error_logs enable row level security;

create policy "adminlog_error_logs_insert_any_authenticated" on adminlog_error_logs
  for insert
  with check (auth.uid() is not null);

create policy "adminlog_error_logs_admin_select" on adminlog_error_logs
  for select
  using (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

create policy "adminlog_error_logs_admin_update" on adminlog_error_logs
  for update
  using (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  )
  with check (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

-- adminlog_invites --------------------------------------------------------
-- Admin-only courtesy invite tracker. Not a signup gate — matching a new
-- user's email against a pending invite (to mark signed_up) happens
-- server-side via the service-role client, which bypasses RLS, so no
-- policy is needed for that write.
alter table adminlog_invites enable row level security;

create policy "adminlog_invites_admin_select" on adminlog_invites
  for select
  using (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

create policy "adminlog_invites_admin_insert" on adminlog_invites
  for insert
  with check (
    exists (select 1 from profiles where profiles."userId" = auth.uid() and profiles."isAdmin" = true)
  );

-- private owner-only tables added after the original owner-loop -----------
-- same shape as the fitness_goals/workouts/... loop above (a row is
-- visible/writable only if its profileId belongs to the caller); kept as a
-- separate loop since these were added later.
do $$
declare
  t text;
begin
  foreach t in array array[
    'notifications',
    'assets',
    'travellog_visits',
    'learnlog_library_items',
    'learnlog_skills',
    'learnlog_career_roles',
    'learnlog_career_certifications',
    'learnlog_career_goals',
    'learnlog_reflections'
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

-- onboarding_page_flags / adminlog_toggles ---------------------------------
-- Global (non-per-user) config, same posture as ai_model_settings: any
-- authenticated user may read it, only an admin may write it.
do $$
declare
  t text;
begin
  foreach t in array array['onboarding_page_flags', 'adminlog_toggles']
  loop
    execute format('alter table %I enable row level security', t);

    execute format($f$
      create policy %I on %I
        for select
        using (auth.uid() is not null)
    $f$, t || '_select_any_authenticated', t);

    execute format($f$
      create policy %I on %I
        for insert
        with check (
          exists (
            select 1 from profiles
            where profiles."userId" = auth.uid()
              and profiles."isAdmin" = true
          )
        )
    $f$, t || '_admin_insert', t);

    execute format($f$
      create policy %I on %I
        for update
        using (
          exists (
            select 1 from profiles
            where profiles."userId" = auth.uid()
              and profiles."isAdmin" = true
          )
        )
        with check (
          exists (
            select 1 from profiles
            where profiles."userId" = auth.uid()
              and profiles."isAdmin" = true
          )
        )
    $f$, t || '_admin_update', t);
  end loop;
end $$;

-- adminlog_toggle_overrides: an admin-set per-profile override of a toggle.
-- The affected profile may read its own override (to know whether it's
-- overridden); only an admin may write.
alter table adminlog_toggle_overrides enable row level security;

create policy "adminlog_toggle_overrides_owner_read" on adminlog_toggle_overrides
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = adminlog_toggle_overrides."profileId"
        and profiles."userId" = auth.uid()
    )
    or exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );

create policy "adminlog_toggle_overrides_admin_all" on adminlog_toggle_overrides
  for all
  using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );

-- asset_balance_entries: owned via its parent asset's profileId (bespoke
-- join, same shape as program_weeks above).
alter table asset_balance_entries enable row level security;

create policy "asset_balance_entries_owner_access" on asset_balance_entries
  for all
  using (
    exists (
      select 1 from assets
      join profiles on profiles.id = assets."profileId"
      where assets.id = asset_balance_entries."assetId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from assets
      join profiles on profiles.id = assets."profileId"
      where assets.id = asset_balance_entries."assetId"
        and profiles."userId" = auth.uid()
    )
  );

-- payments: two-party (payer/payee), participant-only read. All writes go
-- through app/api/moneylog/pay and app/api/shoppinglog/checkout using the
-- service-role client, same posture as shop_orders.
alter table payments enable row level security;

create policy "payments_participant_read" on payments
  for select using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and (profiles.id = payments."payerId" or profiles.id = payments."payeeId")
    )
  );

-- social_follow_requests: same shape as friendships above (requester may
-- read/insert/delete their own request, target may read/update to respond).
alter table social_follow_requests enable row level security;

create policy "social_follow_requests_select_own" on social_follow_requests
  for select using (
    exists (select 1 from profiles where profiles.id = social_follow_requests."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = social_follow_requests."targetId" and profiles."userId" = auth.uid())
  );

create policy "social_follow_requests_insert_own" on social_follow_requests
  for insert with check (
    exists (select 1 from profiles where profiles.id = social_follow_requests."requesterId" and profiles."userId" = auth.uid())
  );

create policy "social_follow_requests_update_target" on social_follow_requests
  for update using (
    exists (select 1 from profiles where profiles.id = social_follow_requests."targetId" and profiles."userId" = auth.uid())
  )
  with check (
    exists (select 1 from profiles where profiles.id = social_follow_requests."targetId" and profiles."userId" = auth.uid())
  );

create policy "social_follow_requests_delete_own" on social_follow_requests
  for delete using (
    exists (select 1 from profiles where profiles.id = social_follow_requests."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = social_follow_requests."targetId" and profiles."userId" = auth.uid())
  );

-- travellog: unlike the friendships/households-style tables, the shared
-- trips feature (lib/travellog/acceptPlan.ts, called from a client
-- component) writes travellog_plans/travellog_plan_members directly with
-- the session client, so these need real owner/member policies, not just a
-- defensive read default.
alter table travellog_plans enable row level security;

create policy "travellog_plans_owner_access" on travellog_plans
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = travellog_plans."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = travellog_plans."profileId"
        and profiles."userId" = auth.uid()
    )
  );

create policy "travellog_plans_member_read" on travellog_plans
  for select using (
    exists (
      select 1 from travellog_plan_members tpm
      join profiles p on p.id = tpm."profileId"
      where tpm."planId" = travellog_plans.id and p."userId" = auth.uid()
    )
  );

alter table travellog_plan_members enable row level security;

create policy "travellog_plan_members_member_read" on travellog_plan_members
  for select using (
    exists (
      select 1 from travellog_plan_members tpm2
      join profiles p on p.id = tpm2."profileId"
      where tpm2."planId" = travellog_plan_members."planId" and p."userId" = auth.uid()
    )
  );

create policy "travellog_plan_members_insert_own" on travellog_plan_members
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = travellog_plan_members."profileId"
        and profiles."userId" = auth.uid()
    )
  );

alter table travellog_plan_invites enable row level security;

create policy "travellog_plan_invites_read_own" on travellog_plan_invites
  for select using (
    exists (select 1 from profiles p where p.id = travellog_plan_invites."inviteeId" and p."userId" = auth.uid())
    or exists (select 1 from profiles p where p.id = travellog_plan_invites."invitedById" and p."userId" = auth.uid())
  );

-- learnlog_skill_sessions / learnlog_skill_milestones: owned via their
-- parent skill's profileId (bespoke join, same shape as program_weeks).
-- Both are written directly from client components (LogSessionDrawer,
-- MilestoneList) with the session client, so this is load-bearing.
do $$
declare
  t text;
begin
  foreach t in array array['learnlog_skill_sessions', 'learnlog_skill_milestones']
  loop
    execute format('alter table %I enable row level security', t);

    execute format($f$
      create policy %I on %I
        for all
        using (
          exists (
            select 1 from learnlog_skills sk
            join profiles p on p.id = sk."profileId"
            where sk.id = %I."skillId" and p."userId" = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from learnlog_skills sk
            join profiles p on p.id = sk."profileId"
            where sk.id = %I."skillId" and p."userId" = auth.uid()
          )
        )
    $f$, t || '_owner_access', t, t, t);
  end loop;
end $$;

-- learnlog_groups / learnlog_group_members / learnlog_group_invites: same
-- posture as households above — all mutations go through
-- app/api/learnlog/groups/* and app/api/learnlog/invites/* using the
-- service-role client. These are defensive read policies only.
alter table learnlog_groups enable row level security;
create policy "learnlog_groups_member_read" on learnlog_groups
  for select using (
    exists (
      select 1 from learnlog_group_members lgm
      join profiles p on p.id = lgm."profileId"
      where lgm."groupId" = learnlog_groups.id and p."userId" = auth.uid()
    )
  );

alter table learnlog_group_members enable row level security;
create policy "learnlog_group_members_member_read" on learnlog_group_members
  for select using (
    exists (
      select 1 from learnlog_group_members lgm2
      join profiles p on p.id = lgm2."profileId"
      where lgm2."groupId" = learnlog_group_members."groupId" and p."userId" = auth.uid()
    )
  );

alter table learnlog_group_invites enable row level security;
create policy "learnlog_group_invites_read_own" on learnlog_group_invites
  for select using (
    exists (select 1 from profiles p where p.id = learnlog_group_invites."inviteeId" and p."userId" = auth.uid())
    or exists (select 1 from profiles p where p.id = learnlog_group_invites."invitedById" and p."userId" = auth.uid())
  );
