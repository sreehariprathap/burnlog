// app/(moneylog)/moneylog/plan/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringItemForm } from '@/components/moneylog/RecurringItemForm';
import { RecurringItemsList } from './_components/RecurringItemsList';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';
import { useToast } from '@/components/ui/use-toast';

export interface PlanRecurringItem extends RecurringItemDraft {
  id: string;
}

// Client Component — cannot export `metadata`; page title is set via TopBar below.
export default function PlanPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [items, setItems] = useState<PlanRecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchItems = useCallback(
    async (id: string) => {
      setLoading(true);
      const { data, error } = await supabase
        .from('recurring_items')
        .select('*')
        .eq('profileId', id)
        .eq('isActive', true)
        .order('createdAt', { ascending: false });
      if (error) {
        toast({ title: 'Failed to load recurring items', description: error.message, variant: 'destructive' });
      }
      setItems((data as PlanRecurringItem[]) || []);
      setLoading(false);
    },
    [supabase, toast]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);
      fetchItems(profile.id);
    })();
  }, [supabase, fetchItems]);

  async function handleAdd(draft: RecurringItemDraft) {
    if (!profileId) return;
    const { data, error } = await supabase
      .from('recurring_items')
      .insert([{ ...draft, profileId }])
      .select()
      .single();
    if (error) {
      toast({ title: 'Failed to add item', description: error.message, variant: 'destructive' });
      return;
    }
    setItems((prev) => [data as PlanRecurringItem, ...prev]);
    setShowForm(false);
    toast({ title: 'Recurring item added' });
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('recurring_items').update({ isActive: false }).eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete item', description: error.message, variant: 'destructive' });
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
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
      <MoneyLogBottomNav />
    </div>
  );
}
