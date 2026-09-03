'use client';
// Note: this page is a Client Component ("use client"), so a `metadata` export
// isn't possible here — it would need a server wrapper to set the page title.

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StaminaTracker } from './_components/StaminaTracker';
import { FoodIntakeTracker } from './_components/FoodIntakeTracker';
import { CalorieTracker } from './_components/CalorieTracker';
import { WeightTracker } from './_components/WeightTracker';
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalsList } from './_components/GoalsList';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { Target, Scale, Flame, Utensils, HeartPulse, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export type Goal = {
  id: string;
  goalType: string;
  targetValue: number;
  createdAt: string;
};

const supabase = createClient();

const goalTabs: TabItem[] = [
  { id: 'goals', icon: Target, label: 'Goals', color: 'var(--chart-1)' },
  { id: 'weight', icon: Scale, label: 'Weight', color: 'var(--chart-2)' },
  { id: 'calories', icon: Flame, label: 'Calories', color: 'var(--chart-3)' },
  { id: 'food', icon: Utensils, label: 'Food', color: 'var(--chart-4)' },
  { id: 'stamina', icon: HeartPulse, label: 'Stamina', color: 'var(--chart-5)' },
];


export default function GoalsPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id ?? null));
  }, []);

  const { data: goals = [], isLoading: loading, mutate: mutateGoals } = useSWR<Goal[]>(
    userId ? ['burnlog-goals', userId] : null,
    async () => {
      // First get the profile ID
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', userId!)
        .single();
      if (!profileData) {
        console.error('Profile not found');
        return [];
      }

      // Then get the goals for this profile
      const { data, error } = await supabase
        .from('fitness_goals')
        .select('*')
        .eq('profileId', profileData.id);
      if (error) throw error;
      return (data as Goal[]) ?? [];
    },
    {
      onError: (error) => {
        toast({
          title: 'Failed to load goals',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    }
  );

  const handleRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await mutateGoals();
    } finally {
      setRefreshing(false);
    }
  };

  const handleGoalAdded = (newGoal: Goal) => {
    mutateGoals([...goals, newGoal], { revalidate: false });
  };

  return (
    <div className="pb-16">
      <TopBar
        title="Fitness Goals"
        actions={
          <button
            onClick={handleRefresh}
            aria-label="Refresh goals"
            disabled={refreshing || !userId}
            className="disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      {!loading && (
        <div className="sticky top-14 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur">
          <SmoothTabs items={goalTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} showLabels />
        </div>
      )}
      <div className='px-4 py-2 flex flex-col gap-2'>

      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : (
        <MotionCarousel
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          slides={[
            <div key="goals-list" className="space-y-4">
              {goals.length > 0 ? (
                <GoalsList goals={goals} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Goals Set</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-1 text-center py-4">
                    <Target className="w-8 h-8 text-primary" aria-hidden="true" />
                    <p className="text-muted-foreground">
                      You haven&apos;t set any fitness goals yet. Start by adding your first goal below.
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{goals.length > 0 ? 'Add Another Goal' : 'Add Your First Goal'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AddGoalForm onGoalAdded={handleGoalAdded} userId={userId!} />
                </CardContent>
              </Card>
            </div>,
            <WeightTracker key="weight" userId={userId!} />,
            <CalorieTracker key="calorie" userId={userId!} />,
            <FoodIntakeTracker key="food" userId={userId!} />,
            <StaminaTracker key="stamina" userId={userId!} />,
          ]}
        />
      )}

      </div>
      <BottomNav />
    </div>
  );
}