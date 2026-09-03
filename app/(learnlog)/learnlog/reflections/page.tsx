// app/(learnlog)/learnlog/reflections/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { reflectionsQuery } from '@/lib/learnlog/queries';
import { ReflectionDrawer } from './_components/ReflectionDrawer';

export default function LearnLogReflectionsPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: reflections, isLoading, mutate } = useSWR(
    profile ? reflectionsQuery(profile.id).key : null,
    profile ? reflectionsQuery(profile.id).fetcher : null
  );

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Reflections" />
      <div className="p-4 flex flex-col gap-4">
        <Button onClick={() => setDrawerOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> New reflection
        </Button>

        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        )}

        {!isLoading && (reflections ?? []).length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No reflections yet. Write your first one.
            </CardContent>
          </Card>
        )}

        {(reflections ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 flex flex-col gap-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-muted-foreground line-clamp-3">{r.body}</p>
              {r.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {r.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {profile && (
        <ReflectionDrawer
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
