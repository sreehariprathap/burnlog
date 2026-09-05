'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
import type { CareerGoalRow } from '@/lib/learnlog/types';
import { rolesQuery, certsQuery, goalsQuery } from '@/lib/learnlog/queries';
import { RoleDrawer } from './RoleDrawer';
import { CertDrawer } from './CertDrawer';
import { GoalDrawer } from './GoalDrawer';

const careerDateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function formatCareerDate(date: string): string {
  return careerDateFormatter.format(new Date(date));
}

export function CareerContent() {
  const { profile } = useCurrentProfile();
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [certDrawerOpen, setCertDrawerOpen] = useState(false);
  const [goalDrawerOpen, setGoalDrawerOpen] = useState(false);
  const [shareGoal, setShareGoal] = useState<CareerGoalRow | null>(null);

  const { data: roles, mutate: mutateRoles } = useSWR(
    profile ? rolesQuery(profile.id).key : null,
    profile ? rolesQuery(profile.id).fetcher : null
  );
  const { data: certs, mutate: mutateCerts } = useSWR(
    profile ? certsQuery(profile.id).key : null,
    profile ? certsQuery(profile.id).fetcher : null
  );
  const { data: goals, mutate: mutateGoals } = useSWR(
    profile ? goalsQuery(profile.id).key : null,
    profile ? goalsQuery(profile.id).fetcher : null
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Career" />
      <div className="p-4">
        <Tabs defaultValue="roles">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="certs">Certs</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="flex flex-col gap-3 mt-4">
            <Button onClick={() => setRoleDrawerOpen(true)} className="w-full"><Plus className="h-4 w-4 mr-2" /> Add role</Button>
            {(roles ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center">No roles logged yet.</p>}
            {(roles ?? []).map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{r.title}</p>
                    {!r.endDate && <Badge>Current</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{r.company} · {formatCareerDate(r.startDate)}{r.endDate ? ` – ${formatCareerDate(r.endDate)}` : ' – present'}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="certs" className="flex flex-col gap-3 mt-4">
            <Button onClick={() => setCertDrawerOpen(true)} className="w-full"><Plus className="h-4 w-4 mr-2" /> Add certification</Button>
            {(certs ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center">No certifications logged yet.</p>}
            {(certs ?? []).map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{c.name}</p>
                    {c.expiresAt && c.expiresAt < today && <Badge variant="destructive">Expired</Badge>}
                  </div>
                  {c.issuer && <p className="text-xs text-muted-foreground">{c.issuer}</p>}
                  <p className="text-xs text-muted-foreground">Earned {formatCareerDate(c.earnedAt)}{c.expiresAt ? ` · expires ${formatCareerDate(c.expiresAt)}` : ''}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="goals" className="flex flex-col gap-3 mt-4">
            <Button onClick={() => setGoalDrawerOpen(true)} className="w-full"><Plus className="h-4 w-4 mr-2" /> Add goal</Button>
            {(goals ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center">No career goals yet.</p>}
            {(goals ?? []).map((g) => (
              <Card key={g.id}>
                <CardContent className="pt-4">
                  <p className="font-medium">{g.title}</p>
                  {g.targetDate && <p className="text-xs text-muted-foreground">Target: {formatCareerDate(g.targetDate)}</p>}
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setShareGoal(g)}>
                    <Share2 className="h-3 w-3 mr-1" />Share
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {profile && (
        <>
          <RoleDrawer profileId={profile.id} open={roleDrawerOpen} onOpenChange={setRoleDrawerOpen} onSaved={() => mutateRoles()} />
          <CertDrawer profileId={profile.id} open={certDrawerOpen} onOpenChange={setCertDrawerOpen} onSaved={() => mutateCerts()} />
          <GoalDrawer profileId={profile.id} open={goalDrawerOpen} onOpenChange={setGoalDrawerOpen} onSaved={() => mutateGoals()} />
          <Dialog open={!!shareGoal} onOpenChange={(open) => !open && setShareGoal(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>{shareGoal?.title}</DialogTitle></DialogHeader>
              {shareGoal && <ShareGroupPanel entityType="career_goal" entityId={shareGoal.id} entityName={shareGoal.title} />}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
