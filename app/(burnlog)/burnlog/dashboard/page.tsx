/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
// Note: this page is a Client Component ("use client"), so a `metadata` export
// isn't possible here — it would need a server wrapper to set the page title.

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { Search, CalendarRange, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SetGoalsPrompt } from './_components/SetGoalsPrompt';
import { Skeleton } from '@/components/ui/skeleton';
import { BMIWidget } from './_components/BMIWidget';
import { WorkoutPieChart } from './_components/WorkoutPieChart';
import { GoalProgressWidget } from './_components/GoalProgressWidget';
import { ShortcutWidget } from './_components/ShortcutWidget';
import { MealPrepBanner } from './_components/MealPrepBanner';
import { DailyRingsWidget } from './_components/DailyRingsWidget';
import { WaterIntakeTracker } from '@/components/kokonutui/water-intake-tracker';
import { ConsistencyTracker } from './_components/ConsistencyTracker';
import { CrossAppSnapshot } from '@/components/CrossAppSnapshot';
import { QuickLogFab } from './_components/QuickLogFab';
import { ActionSearchBar } from '@/components/kokonutui/action-search-bar';

interface FitnessGoal {
  id: string;
  goalType: string;
  targetValue: number | string;
}

export default function DashboardPage() {
  const supabase = createClient();
  const { profile: userProfile, loading: profileLoading } = useCurrentProfile() as { profile: any; loading: boolean };
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickLogTrigger, setQuickLogTrigger] = useState<'calories' | 'workout' | 'steps' | 'walk' | null>(null);

  const { data: goals, isLoading: goalsLoading, mutate: mutateGoals } = useSWR(
    userProfile ? ['burnlog-fitness-goals', userProfile.id] : null,
    async () => {
      const { data } = await supabase.from('fitness_goals').select('*').eq('profileId', userProfile.id);
      return (data as FitnessGoal[]) || [];
    }
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await mutateGoals();
      setRefreshKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const loading = profileLoading || goalsLoading;

  useEffect(() => {
    // Set up "Add to Home Screen" prompt listener
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      // Update UI to notify the user they can install the PWA
      setIsInstallable(true);
    });

    // Handle installed event
    window.addEventListener('appinstalled', () => {
      // Log install to analytics
      console.log('PWA was installed');
      setIsInstallable(false);
    });
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, clear it
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  // Get first weight goal for BMI widget (if exists)
  const weightGoal = (goals ?? []).find(g => g.goalType === 'weight_loss' || g.goalType === 'weight_gain');
  
  // Example workout data for pie chart
  const workoutData = [
    { name: 'Push', value: 3, color: 'var(--chart-1)' },
    { name: 'Pull', value: 2, color: 'var(--chart-3)' },
    { name: 'Legs', value: 2, color: 'var(--chart-2)' },
    { name: 'Rest', value: 1, color: 'var(--chart-5)' },
  ];

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
            <button onClick={() => setSearchOpen(true)} aria-label="Search actions">
              <Search className="h-5 w-5" />
            </button>
          </div>
        }
      />
      <main className="p-4 mt-4 space-y-6">
        {/* Install App Prompt */}
        {isInstallable && (
          <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Install burnlog App</h3>
                  <p className="text-sm text-muted-foreground">Add to your home screen for quick access</p>
                </div>
                <button
                  onClick={installApp}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  Install
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Welcome Card */}
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold">
                  Hello, {userProfile?.firstName || 'there'}!
                </h2>
                <p className="text-muted-foreground">
                  Welcome to your fitness dashboard
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cross-App Snapshot */}
        {userProfile && <CrossAppSnapshot currentApp="burnlog" profileId={userProfile.id} />}

        {/* Consistency Tracker */}
        {userProfile && (
          <ConsistencyTracker
            profileId={userProfile.id}
            currentStreak={userProfile.currentStreak}
            xp={userProfile.xp}
            level={userProfile.level}
            lastConsistencyBonusWeek={userProfile.lastConsistencyBonusWeek}
            refreshKey={refreshKey}
          />
        )}

        {/* Meal Prep Banner */}
        {userProfile && (
          <MealPrepBanner
            mealPrepDayOfWeek={userProfile.mealPrepDayOfWeek ?? null}
            lastMealPlanGeneratedAt={userProfile.lastMealPlanGeneratedAt ?? null}
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
            waterUnit={userProfile.waterUnit}
            glassSizeMl={userProfile.glassSizeMl}
            waterGoalMl={userProfile.waterGoalMl}
          />
        )}

        {/* New Insight Widgets in Grid Layout */}
        <div className="grid grid-cols-4 gap-4">
          {/* BMI Widget - 4x1 */}
          <BMIWidget 
            height={userProfile?.height || 175} 
            weight={userProfile?.weight || 70} 
          />
          
          {/* Goal Progress Widget - 4x1 */}
          <GoalProgressWidget 
            loading={loading}
            goal={weightGoal ? {
              id: weightGoal.id,
              goalType: weightGoal.goalType,
              targetValue: Number(weightGoal.targetValue),
              currentValue: userProfile?.weight || 75,
              unit: 'kg'
            } : undefined}
          />
          
          {/* Shortcut Widget - 4x1 */}
          <ShortcutWidget />
          
          {/* Workout Pie Chart - 4x2 */}
          <WorkoutPieChart data={workoutData} />
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
            <CardContent className="space-y-2">
              {goals.map((goal) => (
                <div key={goal.id} className="flex justify-between pb-2 border-b">
                  <span className="font-medium">
                    {goal.goalType.split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </span>
                  <span>{goal.targetValue}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
      {userProfile && (
        <>
          <QuickLogFab
            profileId={userProfile.id}
            onLogged={() => setRefreshKey((k) => k + 1)}
            initialOpen={quickLogTrigger}
          />
          <ActionSearchBar
            open={searchOpen}
            onOpenChange={setSearchOpen}
            isAdmin={!!userProfile?.isAdmin}
            onQuickLog={(key) => {
              setQuickLogTrigger(key);
              setTimeout(() => setQuickLogTrigger(null), 0);
            }}
          />
        </>
      )}
      <BottomNav />
    </div>
  );
}
