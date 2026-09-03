// app/(learnlog)/learnlog/library/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plus, Star, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { createTaskLogTask, logToMoneyLog } from '@/lib/learnlog/crossApp';
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
import type { LibraryItemRow } from '@/lib/learnlog/types';
import { libraryItemsQuery } from '@/lib/learnlog/queries';
import { LibraryItemDrawer } from './_components/LibraryItemDrawer';

const STATUS_LABEL: Record<string, string> = {
  WANT: 'Want to read/take',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export default function LearnLogLibraryPage() {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shareItem, setShareItem] = useState<LibraryItemRow | null>(null);
  const { data: items, isLoading, mutate } = useSWR(
    profile ? libraryItemsQuery(profile.id).key : null,
    profile ? libraryItemsQuery(profile.id).fetcher : null
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
                <Button size="sm" variant="outline" onClick={() => setShareItem(item)}><Share2 className="h-3 w-3 mr-1" />Share</Button>
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
      <Dialog open={!!shareItem} onOpenChange={(open) => !open && setShareItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{shareItem?.title}</DialogTitle></DialogHeader>
          {shareItem && <ShareGroupPanel entityType="library_item" entityId={shareItem.id} entityName={shareItem.title} />}
        </DialogContent>
      </Dialog>
      <LearnLogBottomNav />
    </div>
  );
}
