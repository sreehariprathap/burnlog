// app/(learnlog)/learnlog/library/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plus, Star } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { createTaskLogTask, logToMoneyLog } from '@/lib/learnlog/crossApp';
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
  const { data: items, isLoading, mutate } = useSWR(
    profile ? ['learnlog-library', profile.id] : null,
    () => fetchLibraryItems(profile!.id)
  );

  const loading = isLoading;

  async function handleAddToTaskLog(item: LibraryItemRow) {
    if (!profile) return;
    try {
      await createTaskLogTask(profile.id, `Read/study: ${item.title}`, 'life', item.title);
      toast({ description: 'Added to TaskLog.' });
    } catch (err) {
      toast({ title: 'Could not add to TaskLog', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  }

  async function handleLogToMoneyLog(item: LibraryItemRow) {
    if (!profile || item.cost == null) return;
    try {
      await logToMoneyLog(profile.id, item.title, item.cost);
      toast({ description: 'Logged to MoneyLog.' });
    } catch (err) {
      toast({ title: 'Could not log to MoneyLog', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Library" />
      <div className="p-4 flex flex-col gap-4">
        <Button onClick={() => setDrawerOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add book or course
        </Button>

        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        )}

        {!loading && (items ?? []).length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              Nothing tracked yet. Add a book or course to get started.
            </CardContent>
          </Card>
        )}

        {(items ?? []).map((item) => (
          <Card key={item.id}>
            <CardContent className="pt-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="font-medium">{item.title}</p>
                <Badge variant="secondary">{item.type === 'BOOK' ? 'Book' : 'Course'}</Badge>
              </div>
              {item.authorOrProvider && (
                <p className="text-xs text-muted-foreground">{item.authorOrProvider}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{STATUS_LABEL[item.status]}</Badge>
                {item.status === 'IN_PROGRESS' && (
                  <span className="text-xs text-muted-foreground">{item.progressPercent}%</span>
                )}
                {item.rating != null && (
                  <span className="flex items-center text-xs text-muted-foreground">
                    <Star className="h-3 w-3 mr-0.5 fill-current" /> {item.rating}/5
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => handleAddToTaskLog(item)}>Add to TaskLog</Button>
                {item.cost != null && (
                  <Button size="sm" variant="outline" onClick={() => handleLogToMoneyLog(item)}>Log to MoneyLog (${item.cost})</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {profile && (
        <LibraryItemDrawer
          profileId={profile.id}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSaved={() => mutate()}
        />
      )}
      <LearnLogBottomNav />
    </div>
  );
}
