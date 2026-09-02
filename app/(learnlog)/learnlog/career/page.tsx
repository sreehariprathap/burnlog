// app/(learnlog)/learnlog/career/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import type { CareerRoleRow, CareerCertificationRow, CareerGoalRow } from '@/lib/learnlog/types';
import { RoleDrawer } from './_components/RoleDrawer';
import { CertDrawer } from './_components/CertDrawer';
import { GoalDrawer } from './_components/GoalDrawer';

async function fetchRoles(profileId: string): Promise<CareerRoleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_roles').select('*').eq('profileId', profileId).order('startDate', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerRoleRow[];
}

async function fetchCerts(profileId: string): Promise<CareerCertificationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_certifications').select('*').eq('profileId', profileId).order('earnedAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerCertificationRow[];
}

async function fetchGoals(profileId: string): Promise<CareerGoalRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_goals').select('*').eq('profileId', profileId).order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerGoalRow[];
}

export default function LearnLogCareerPage() {
  const { profile } = useCurrentProfile();
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [certDrawerOpen, setCertDrawerOpen] = useState(false);
  const [goalDrawerOpen, setGoalDrawerOpen] = useState(false);

  const { data: roles, mutate: mutateRoles } = useSWR(profile ? ['learnlog-roles', profile.id] : null, () => fetchRoles(profile!.id));
  const { data: certs, mutate: mutateCerts } = useSWR(profile ? ['learnlog-certs', profile.id] : null, () => fetchCerts(profile!.id));
  const { data: goals, mutate: mutateGoals } = useSWR(profile ? ['learnlog-goals', profile.id] : null, () => fetchGoals(profile!.id));

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
                  <p className="text-xs text-muted-foreground">{r.company} · {r.startDate}{r.endDate ? ` – ${r.endDate}` : ' – present'}</p>
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
                  <p className="text-xs text-muted-foreground">Earned {c.earnedAt}{c.expiresAt ? ` · expires ${c.expiresAt}` : ''}</p>
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
                  {g.targetDate && <p className="text-xs text-muted-foreground">Target: {g.targetDate}</p>}
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
        </>
      )}
      <LearnLogBottomNav />
    </div>
  );
}
