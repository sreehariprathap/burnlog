// app/sessions/page.tsx
// NOTE: this is a Client Component ('use client'), so `export const metadata` can't live here —
// it would need a Server Component wrapper (e.g. a server layout.tsx) to set the page <title>.
'use client';
import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { workoutPlanQuery, dateSessionQuery } from '@/lib/burnlog/queries';

import { TopBar } from '@/components/TopBar';
import { SessionLogger } from './_components/SessionLogger';
import { WeekdayTabs } from '@/components/kokonutui/weekday-tabs';
import { PlanCard, PlanDay } from './_components/PlanCard';
import { AddWorkoutModal } from './_components/AddWorkoutModal';
import { WorkoutHistory } from './_components/WorkoutHistory';
import { WorkoutChecklist } from './_components/WorkoutChecklist';
import { MealChecklist } from './_components/MealChecklist';
import { BottomNav } from '@/components/BottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart } from 'lucide-react';
import type { LifestyleAnswers } from '@/lib/ai/types';
import { PlanViewToggle } from '@/components/kokonutui/plan-view-toggle';
import { nearestPastOrTodayWeekday, isSameLocalDay, toLocalDateString } from '@/lib/date';
import { PlanMonthCalendar } from './_components/PlanMonthCalendar';
import { PlanDaySummary } from './_components/PlanDaySummary';
import { WaterIntakeTracker } from '@/components/kokonutui/water-intake-tracker';
import { DailyRingsWidget } from '@/app/(burnlog)/burnlog/dashboard/_components/DailyRingsWidget';
import { ProgramView } from './_components/ProgramView';

export default function SessionsPage() {
  return (
    <Suspense fallback={null}>
      <SessionsPageContent />
    </Suspense>
  );
}

function SessionsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // day/view/selectedDate mirror the URL (?day=&view=&date=) so refresh and
  // the browser back/forward buttons preserve the selection instead of
  // always resetting to "today".
  const dayParam = Number(searchParams.get('day'));
  const viewParam = searchParams.get('view');
  const dateParam = searchParams.get('date');

  const [day, setDay] = useState<number>(
    Number.isInteger(dayParam) && dayParam >= 0 && dayParam <= 6 ? dayParam : new Date().getDay()
  );
  const [logging, setLogging] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [view, setView] = useState<'day' | 'month' | 'program'>(
    viewParam === 'month' || viewParam === 'program' ? viewParam : 'day'
  );
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (dateParam) {
      const parsed = new Date(`${dateParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const [ringsRefreshKey, setRingsRefreshKey] = useState(0);

  // Updates whichever of day/view/selectedDate changed, both in state and
  // in the URL, in a single navigation — the callers below often change more
  // than one of these together (e.g. picking a date also changes the day
  // and switches back to the day view).
  const goTo = (overrides: Partial<{ day: number; view: 'day' | 'month' | 'program'; selectedDate: Date }>) => {
    const nextDay = overrides.day ?? day;
    const nextView = overrides.view ?? view;
    const nextSelectedDate = overrides.selectedDate ?? selectedDate;

    setDay(nextDay);
    setView(nextView);
    setSelectedDate(nextSelectedDate);

    const params = new URLSearchParams(searchParams.toString());
    params.set('day', String(nextDay));
    params.set('view', nextView);
    params.set('date', toLocalDateString(nextSelectedDate));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // 1️⃣ Profile + lifestyle/water settings — shared cache across every app page
  const { profile: profileData, loading: profileLoading } = useCurrentProfile();
  const profileId: string | null = profileData?.id ?? null;
  const lifestyle = (profileData?.lifestyle as LifestyleAnswers | null) ?? null;
  const currentStreak = (profileData?.currentStreak as number | undefined) ?? 0;
  const waterUnit = (profileData?.waterUnit as 'glasses' | 'liters' | undefined) ?? 'glasses';
  const glassSizeMl = (profileData?.glassSizeMl as number | undefined) ?? 250;
  const waterGoalMl = (profileData?.waterGoalMl as number | undefined) ?? 2000;

  // 2️⃣ Plan for the selected weekday, cached per (profile, day) — same key
  // the BottomNav preloader warms via workoutPlanQuery, see Task 8
  const { data: planData, isLoading: loadingPlanFetch, mutate: mutatePlan } = useSWR<PlanDay | null>(
    profileId ? workoutPlanQuery(profileId, day).key : null,
    profileId ? workoutPlanQuery(profileId, day).fetcher : null
  );
  const plan = planData ?? null;
  const loadingPlan = profileLoading || loadingPlanFetch;

  // 2️⃣-B The logged session for the selected date (non-today dates only)
  const today = new Date();
  const wantsDateSession = !!profileId && !isSameLocalDay(selectedDate, today);
  const { data: dateSessionData } = useSWR(
    wantsDateSession ? dateSessionQuery(profileId!, toLocalDateString(selectedDate)).key : null,
    wantsDateSession ? dateSessionQuery(profileId!, toLocalDateString(selectedDate)).fetcher : null
  );
  const dateSession = wantsDateSession ? (dateSessionData ?? null) : null;

  // 3️⃣ Upsert a new plan
  const handleSaved = async (newPlan: PlanDay & { repeatWeekly: boolean }) => {
    if (!profileId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('workout_plans')
      .upsert(
        {
          profileId: profileId,
          dayOfWeek: newPlan.dayIndex,
          bodyPart: newPlan.bodyPart,
          repeatWeekly: newPlan.repeatWeekly
        },
        { onConflict: 'profileId,dayOfWeek' }
      );
    if (error) {
      console.error('Plan save failed:', error);
      throw error;
    }
    mutatePlan();
  };

  // 5️⃣ Session logger
  if (logging && plan) {
    return (
      <SessionLogger
        plan={plan}
        profileId={profileId}
        lifestyle={lifestyle}
        onEnd={() => {
          setLogging(false);
          setRingsRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  // 5️⃣-B Workout history view
  if (showHistory) {
    return <WorkoutHistory onClose={() => setShowHistory(false)} />;
  }

  // 6️⃣ Main UI
  return (
    <div className="pb-16">
      <TopBar title="Plan"  actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1"
          >
            <BarChart className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </Button>
        }/>
      <div className="sticky top-14 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <PlanViewToggle view={view} onChange={(newView) => goTo({ view: newView })} />
      </div>

      {view === 'program' ? (
        profileId && <ProgramView profileId={profileId} />
      ) : view === 'month' ? (
        profileId && (
          <PlanMonthCalendar
            profileId={profileId}
            currentStreak={currentStreak}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              goTo({ selectedDate: date, day: date.getDay(), view: 'day' });
            }}
          />
        )
      ) : (
        <>
      <div className="flex w-full gap-2 items-center px-4 py-2">
        <WeekdayTabs
          value={day}
          onChange={(newDay) => {
            goTo({ day: newDay, selectedDate: nearestPastOrTodayWeekday(newDay) });
          }}
        />
      </div>

      <div className="p-4 space-y-4">
        {loadingPlan ? (
          // Skeleton placeholder while loading
          <Card className='p-3'>
            <Skeleton className="h-[25px] w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </Card>
        ) : isSameLocalDay(selectedDate, new Date()) ? (
          <>
            <PlanCard
              plan={plan}
              onStart={() => setLogging(true)}
              onAdd={() => setShowAddModal(true)}
              onPlanWizard={() => router.push('/burnlog/ai-setup?returnTo=/burnlog/session')}
            />

            {/* Show workout checklist when a plan exists but not yet started */}
            {plan && (
              <div className="mt-6">
                <WorkoutChecklist workoutType={plan.bodyPart} />
              </div>
            )}

            {profileId && (
              <div className="mt-6">
                <MealChecklist profileId={profileId} dayOfWeek={day} selectedDate={selectedDate} />
              </div>
            )}

            {profileId && <DailyRingsWidget profileId={profileId} refreshKey={ringsRefreshKey} />}

            {profileId && (
              <WaterIntakeTracker
                profileId={profileId}
                waterUnit={waterUnit}
                glassSizeMl={glassSizeMl}
                waterGoalMl={waterGoalMl}
              />
            )}
          </>
        ) : (
          <>
            <PlanDaySummary
              date={selectedDate}
              scheduledBodyPart={plan?.bodyPart ?? null}
              session={dateSession}
            />
            {profileId && (
              <div className="mt-6">
                <MealChecklist profileId={profileId} dayOfWeek={day} selectedDate={selectedDate} />
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}

      <AddWorkoutModal
        open={showAddModal}
        initialDay={day}
        onOpenChange={setShowAddModal}
        onSaved={handleSaved}
      />
      <BottomNav />
    </div>
  );
}
