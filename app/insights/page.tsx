// app/insights/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import InsightsClient from './_components/InsightsClient';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';

export default async function InsightsPage() {
  const supabase = createServerComponentClient({ cookies });

  // 1) Get the current session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Not logged in → send to login
    return redirect('/auth/login');
  }

  const userId = session.user.id;

  // 2) Fetch all datasets in parallel
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
      .eq('profileId', userId)
      .order('date', { ascending: true }),
    supabase
      .from('fitness_goals')
      .select('*')
      .eq('profileId', userId)
      .eq('goalType', 'WEIGHT_LOSS')
      .order('createdAt', { ascending: false })
      .single(),
    supabase
      .from('calorie_burns')
      .select('*')
      .eq('profileId', userId)
      .order('date', { ascending: true }),
    supabase
      .from('food_intakes')
      .select('*')
      .eq('profileId', userId)
      .order('date', { ascending: true }),
    supabase
      .from('stamina_sessions')
      .select('*')
      .eq('profileId', userId)
      .order('date', { ascending: true }),
  ]);

  // 3) Render
  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Insights" />
      <main className="flex-1 overflow-auto px-4 py-6 pb-16">
        <InsightsClient
          weightEntries={weightEntries || []}
          weightGoal={weightGoal }
          calorieBurns={calorieBurns || []}
          foodIntakes={foodIntakes || []}
          staminaSessions={staminaSessions || []}
        />
      </main>
      <BottomNav />
    </div>
  );
}
