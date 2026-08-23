// app/(lifelog)/lifelog/insights/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import FinanceInsightsClient from './_components/FinanceInsightsClient';

export default async function LifeLogInsightsPage() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return redirect('/login');
  }

  const { data: profile } = await supabase.from('profiles').select('id').eq('userId', session.user.id).single();

  if (!profile) {
    return redirect('/signup/profile');
  }

  const profileId = profile.id;

  const [{ data: recurringItems = [] }, { data: transactions = [] }] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase.from('finance_transactions').select('*').eq('profileId', profileId).order('date', { ascending: true }),
  ]);

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Insights" />
      <main className="flex-1 overflow-auto px-4 py-6 pb-24">
        <FinanceInsightsClient recurringItems={recurringItems || []} transactions={transactions || []} />
      </main>
      <LifeLogBottomNav />
    </div>
  );
}
