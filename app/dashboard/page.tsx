'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SetGoalsPrompt } from './_components/SetGoalsPrompt';

interface FitnessGoal {
  id: string;
  goalType: string;
  targetValue: number | string;
}

export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [goals, setGoals] = useState<FitnessGoal[]>([]);

  useEffect(() => {
    supabase
      .from('FitnessGoal')
      .select('*')
      .then(({ data }) => setGoals(data ?? []));
  }, [supabase]);

  return (
    <div className="pb-16">
      <TopBar title="Dashboard" />
      <main className="p-4 mt-4">
        {goals.length === 0 ? (
          <SetGoalsPrompt />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {goals.map((goal) => (
                <div key={goal.id} className="flex justify-between">
                  <span>{goal.goalType}</span>
                  <span>{goal.targetValue}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
