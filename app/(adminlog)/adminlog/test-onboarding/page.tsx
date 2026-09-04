'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { TEST_MODE_ACTIVE_KEY, STASHED_SESSION_KEY } from '@/components/adminlog/TestModeBanner';
import { TEST_ONBOARDING_TABLES } from '@/lib/adminlog/testOnboarding';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

type TestOnboardingData = {
  profile: Record<string, unknown> | null;
  tables: Record<string, unknown[]>;
};

const TABLE_LABELS: Record<string, string> = Object.fromEntries(
  TEST_ONBOARDING_TABLES.map(({ table, label }) => [table, label])
);

async function fetchTestOnboarding(): Promise<TestOnboardingData> {
  const res = await fetch('/api/adminlog/test-onboarding');
  if (!res.ok) throw new Error('Failed to load test onboarding data');
  return res.json();
}

function buildSummary(data: TestOnboardingData): string[] {
  const lines: string[] = [];
  const p = data.profile;
  if (p) {
    lines.push(`Profile: ${p.firstName ?? '?'} ${p.lastName ?? '?'}, apps enabled: ${(p.enabledApps as string[] | undefined)?.join(', ') || 'none'}.`);
    if (p.aiEnabled) lines.push('BurnLog: AI enabled.');
  }
  if (data.tables.workout_plans?.length) lines.push(`BurnLog: ${data.tables.workout_plans.length}-day workout plan generated.`);
  if (data.tables.recurring_items?.length) lines.push(`MoneyLog: ${data.tables.recurring_items.length} recurring items.`);
  if (data.tables.task_goals?.length) lines.push(`TaskLog: ${data.tables.task_goals.length} goal(s), ${data.tables.tasklog_tasks?.length ?? 0} task(s).`);
  if (data.tables.household_chores?.length) lines.push(`HomeLog: ${data.tables.household_chores.length} chore(s).`);
  if (data.tables.learnlog_skills?.length || data.tables.learnlog_career_goals?.length || data.tables.learnlog_library_items?.length) {
    lines.push(`LearnLog: ${data.tables.learnlog_skills?.length ?? 0} skill(s), ${data.tables.learnlog_career_goals?.length ?? 0} career goal(s), ${data.tables.learnlog_library_items?.length ?? 0} library item(s).`);
  }
  return lines;
}

export default function TestOnboardingPage() {
  const { profile, loading } = useRequireAdmin();
  const { data, mutate, isLoading } = useSWR('adminlog-test-onboarding', fetchTestOnboarding);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleEnterTestMode() {
    setStarting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No current session');

      const res = await fetch('/api/adminlog/test-onboarding/start', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start test session');
      const { tokenHash } = await res.json();

      sessionStorage.setItem(
        STASHED_SESSION_KEY,
        JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
      );

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      if (verifyError) throw verifyError;

      sessionStorage.setItem(TEST_MODE_ACTIVE_KEY, '1');
      // Hard navigation, not router.push: TestModeBanner is mounted once at
      // the root layout and only reads sessionStorage on mount, and every
      // SWR cache (e.g. the admin's own profile) needs to start clean under
      // the swapped identity rather than carry over stale client state.
      window.location.href = '/signup/profile';
    } catch (err) {
      console.error('Enter Test Mode failed:', err);
      setStarting(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch('/api/adminlog/test-onboarding', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to reset test profile');
      await mutate();
    } finally {
      setResetting(false);
    }
  }

  if (loading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  const hasTestProfile = !!data?.profile;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Run the real onboarding flow as a dedicated test account — your own profile is never touched.
      </p>

      <div className="flex gap-2">
        <Button onClick={handleEnterTestMode} disabled={starting}>
          {starting ? 'Starting…' : 'Enter Test Mode'}
        </Button>
        {hasTestProfile && (
          <Button variant="destructive" onClick={handleReset} disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset test profile'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="animate-spin h-5 w-5" />
      ) : !hasTestProfile ? (
        <p className="text-sm text-muted-foreground">No test profile yet — click &quot;Enter Test Mode&quot; to start one.</p>
      ) : (
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="raw">Raw data</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="space-y-2 pt-2">
            {buildSummary(data).map((line, i) => (
              <p key={i} className="text-sm">{line}</p>
            ))}
          </TabsContent>
          <TabsContent value="raw" className="space-y-3 pt-2">
            {Object.entries(data.tables)
              .filter(([, rows]) => rows.length > 0)
              .map(([table, rows]) => (
                <Card key={table}>
                  <CardHeader>
                    <CardTitle className="text-sm">{TABLE_LABELS[table] ?? table}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-2 text-xs">
                      {JSON.stringify(rows, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
