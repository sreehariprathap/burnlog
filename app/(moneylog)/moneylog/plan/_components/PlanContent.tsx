'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringItemForm } from '@/components/moneylog/RecurringItemForm';
import { RecurringItemsList } from './RecurringItemsList';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { recurringItemsQuery } from '@/lib/moneylog/queries';
import { useToast } from '@/components/ui/use-toast';

export interface PlanRecurringItem extends RecurringItemDraft {
  id: string;
}

export function PlanContent() {
  const { toast } = useToast();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const profileId = profile?.id ?? null;
  const [showForm, setShowForm] = useState(false);

  const { data: items = [], isLoading: itemsLoading, mutate: mutateItems } = useSWR<PlanRecurringItem[]>(
    profile ? recurringItemsQuery(profile.id).key : null,
    profile ? recurringItemsQuery(profile.id).fetcher : null,
    {
      onError: (error) => {
        toast({ title: 'Failed to load recurring items', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      },
    }
  );
  const loading = profileLoading || itemsLoading;

  async function handleAdd(draft: RecurringItemDraft) {
    if (!profileId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('recurring_items')
      .insert([{ ...draft, profileId }])
      .select()
      .single();
    if (error) {
      toast({ title: 'Failed to add item', description: error.message, variant: 'destructive' });
      return;
    }
    mutateItems([data as PlanRecurringItem, ...items], { revalidate: false });
    setShowForm(false);
    toast({ title: 'Recurring item added' });
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('recurring_items').update({ isActive: false }).eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete item', description: error.message, variant: 'destructive' });
      return;
    }
    mutateItems(items.filter((item) => item.id !== id), { revalidate: false });
    toast({ title: 'Recurring item deleted' });
  }

  return (
    <div className="pb-24">
      <TopBar title="Plan" />
      <div className="px-4 py-4 flex flex-col gap-4">
        <Link href="/moneylog/onboarding" className="text-sm text-primary underline-offset-4 hover:underline">
          Run setup wizard
        </Link>

        {loading ? <Skeleton className="h-40 w-full" /> : <RecurringItemsList items={items} onDelete={handleDelete} />}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>Add recurring item</CardTitle>
            </CardHeader>
            <CardContent>
              <RecurringItemForm onSubmit={handleAdd} />
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowForm(true)}>Add recurring item</Button>
        )}
      </div>
    </div>
  );
}
