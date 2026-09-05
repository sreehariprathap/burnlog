// app/insights/page.tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import InsightsClient from './_components/InsightsClient';
import { RefreshInsightsButton } from './_components/RefreshInsightsButton';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'Insights - burnlog',
};

export default async function InsightsPage() {
  const supabase = await createClient();

  // 1) Get the current user. getUser() validates against Supabase's auth
  // server instead of trusting locally-decoded cookie state — getSession()
  // raced with middleware's token refresh and intermittently logged
  // authenticated users out of this page in prod.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not logged in → send to login
    return redirect('/login');
  }

  // 2) Resolve the profile ID for this user (child tables reference
  // profiles.id, not the auth user id directly)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('userId', user.id)
    .single();

  if (!profile) {
    return redirect('/signup/profile');
  }

  const profileId = profile.id;

  // 3) Fetch all datasets in parallel
  const [
    { data: weightEntries = [] },
    { data: weightGoal = null },
    { data: calorieBurns = [] },
    { data: foodIntakes = [] },
    { data: staminaSessions = [] },
  ] = await Promise.all([
    supabase
      .from('weight_entries')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('fitness_goals')
      .select('*')
      .eq('profileId', profileId)
      .eq('goalType', 'weight_loss')
      .order('createdAt', { ascending: false })
      .single(),
    supabase
      .from('calorie_burns')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('food_intakes')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('stamina_sessions')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
  ]);

  // 4) Render
  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Insights" actions={<RefreshInsightsButton />} />
      <main className="flex-1 overflow-auto px-4 pb-16">
        <Suspense fallback={null}>
          <InsightsClient
            weightEntries={weightEntries || []}
            weightGoal={weightGoal }
            calorieBurns={calorieBurns || []}
            foodIntakes={foodIntakes || []}
            staminaSessions={staminaSessions || []}
          />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}
