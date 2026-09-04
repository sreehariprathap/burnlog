'use client';

// Was a Server Component (async page, server-side auth check + Supabase
// fetch) before /moneylog became a single tabbed page — now client-fetched
// via the same registered queries recurringItemsQuery/allFinanceTransactionsQuery
// already use elsewhere (Plan, MoneyLogBottomNav's preload), matching every
// other tab's data-loading pattern. The page-level auth redirect it used to
// do itself is redundant with the app-wide auth guard everything else here
// already relies on.
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { recurringItemsQuery, allFinanceTransactionsQuery } from '@/lib/moneylog/queries';
import FinanceInsightsClient from './FinanceInsightsClient';

export function InsightsContent() {
  const { profile } = useCurrentProfile();
  const { data: recurringItems, isLoading: recurringLoading } = useSWR(
    profile ? recurringItemsQuery(profile.id).key : null,
    profile ? recurringItemsQuery(profile.id).fetcher : null
  );
  const { data: transactions, isLoading: transactionsLoading } = useSWR(
    profile ? allFinanceTransactionsQuery(profile.id).key : null,
    profile ? allFinanceTransactionsQuery(profile.id).fetcher : null
  );
  const loading = recurringLoading || transactionsLoading;

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Insights" />
      <main className="flex-1 overflow-auto px-4 pb-24">
        {loading ? (
          <div className="flex flex-col gap-4 pt-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <FinanceInsightsClient recurringItems={recurringItems ?? []} transactions={transactions ?? []} />
        )}
      </main>
    </div>
  );
}
