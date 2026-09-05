'use client';
// Note: this page is a Client Component ("use client"), so a `metadata` export
// isn't possible here — it would need a server wrapper to set the page title.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { fitnessGoalsQuery, workoutDistributionQuery, type FitnessGoal } from '@/lib/burnlog/queries';
import { CalendarRange, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StaggerGrid, StaggerItem } from '@/components/ui/stagger-grid';
import { SuccessPulse } from '@/components/ui/success-pulse';
import { SetGoalsPrompt } from './_components/SetGoalsPrompt';
import { Skeleton } from '@/components/ui/skeleton';
import { BMIWidget } from './_components/BMIWidget';
import { GoalProgressWidget } from './_components/GoalProgressWidget';
import { ShortcutWidget } from './_components/ShortcutWidget';
import { MealPrepBanner } from './_components/MealPrepBanner';
import { DailyRingsWidget } from './_components/DailyRingsWidget';
import { WaterIntakeTracker } from '@/components/kokonutui/water-intake-tracker';
import { ConsistencyTracker } from './_components/ConsistencyTracker';
import { QuickLogFab } from './_components/QuickLogFab';

const WorkoutPieChart = dynamic(
  () => import('./_components/WorkoutPieChart').then((mod) => mod.WorkoutPieChart),
  { ssr: false, loading: () => <Skeleton className="h-[250px] w-full" /> }
);

export default function DashboardPage() {
  const { profile: userProfile, loading: profileLoading } = useCurrentProfile();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: goals, isLoading: goalsLoading, mutate: mutateGoals } = useSWR<FitnessGoal[]>(
    userProfile ? fitnessGoalsQuery(userProfile.id).key : null,
    userProfile ? fitnessGoalsQuery(userProfile.id).fetcher : null
  );
  const { data: workoutDistribution, mutate: mutateWorkoutDistribution } = useSWR(
    userProfile ? workoutDistributionQuery(userProfile.id).key : null,
    userProfile ? workoutDistributionQuery(userProfile.id).fetcher : null
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([mutateGoals(), mutateWorkoutDistribution()]);
      setRefreshKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const loading = profileLoading || goalsLoading;

  // Get first weight goal for BMI widget (if exists)
  const weightGoal = (goals ?? []).find(g => g.goalType === 'weight_loss' || g.goalType === 'weight_gain');

  return (
    <div className="pb-16">
      <TopBar
        title="Dashboard"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              aria-label="Refresh dashboard"
              disabled={refreshing}
              className="disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />
      <main className="p-4 mt-4 space-y-6">
        {/* Consistency Tracker */}
        {userProfile && (
          <ConsistencyTracker
            profileId={userProfile.id}
            currentStreak={userProfile.currentStreak as number}
            xp={userProfile.xp as number}
            level={userProfile.level as number}
            lastConsistencyBonusWeek={userProfile.lastConsistencyBonusWeek as string | null}
            refreshKey={refreshKey}
          />
        )}

        {/* Meal Prep Banner */}
        {userProfile && (
          <MealPrepBanner
            mealPrepDayOfWeek={(userProfile.mealPrepDayOfWeek as number | null | undefined) ?? null}
            lastMealPlanGeneratedAt={(userProfile.lastMealPlanGeneratedAt as string | null | undefined) ?? null}
          />
        )}

        {/* Always-available entry point into the meal planner wizard */}
        <div className="flex justify-end">
          <Link
            href="/burnlog/meal-planner"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <CalendarRange className="w-3.5 h-3.5" />
            Plan meals
          </Link>
        </div>

        {/* Daily Rings */}
        {userProfile && (
          <DailyRingsWidget profileId={userProfile.id} refreshKey={refreshKey} />
        )}

        {/* Water Intake */}
        {userProfile && (
          <WaterIntakeTracker
            profileId={userProfile.id}
            waterUnit={userProfile.waterUnit as 'glasses' | 'liters'}
            glassSizeMl={userProfile.glassSizeMl as number}
            waterGoalMl={userProfile.waterGoalMl as number}
          />
        )}

        {/* New Insight Widgets */}
        <div className="flex flex-col gap-4">
          <BMIWidget
            height={(userProfile?.height as number | undefined) || 175}
            weight={(userProfile?.weight as number | undefined) || 70}
          />

          <GoalProgressWidget
            loading={loading}
            goal={weightGoal ? {
              id: weightGoal.id,
              goalType: weightGoal.goalType,
              targetValue: Number(weightGoal.targetValue),
              currentValue: (userProfile?.weight as number | undefined) || 75,
              unit: 'kg'
            } : undefined}
          />

          <ShortcutWidget />

          <WorkoutPieChart data={workoutDistribution ?? []} />
        </div>
        
        {/* Goals List */}
        {loading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-1/3" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ) : !goals || goals.length === 0 ? (
          <SetGoalsPrompt />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Goals</CardTitle>
            </CardHeader>
            <CardContent>
              <StaggerGrid className="space-y-2">
                {goals.map((goal) => (
                  <StaggerItem key={goal.id} className="flex justify-between pb-2 border-b">
                    <span className="font-medium">
                      {goal.goalType.split('_').map(word =>
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(' ')}
                    </span>
                    <span>{goal.targetValue}</span>
                  </StaggerItem>
                ))}
              </StaggerGrid>
            </CardContent>
          </Card>
        )}
      </main>
      {userProfile && (
        <QuickLogFab
          profileId={userProfile.id}
          onLogged={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <SuccessPulse trigger={refreshKey} />
      <BottomNav />
    </div>
  );
}
