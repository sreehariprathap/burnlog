// app/sessions/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { TopBar } from '@/components/TopBar';
import { SessionLogger } from './_components/SessionLogger';
import { DayNavigator } from './_components/DayNavigator';
import { PlanCard, PlanDay } from './_components/PlanCard';
import { AddWorkoutModal } from './_components/AddWorkoutModal';
import { WorkoutHistory } from './_components/WorkoutHistory';
import { WorkoutChecklist } from './_components/WorkoutChecklist';
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

export default function SessionsPage() {
  const supabase = createClientComponentClient();
  const [day, setDay] = useState<number>(new Date().getDay());
  const [plan, setPlan] = useState<PlanDay | null>(null);
  const [logging, setLogging] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleAnswers | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<boolean>(true);
  const [view, setView] = useState<'day' | 'month'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [dateSession, setDateSession] = useState<{ completed: boolean; duration?: number; notes?: string } | null>(null);

  // 1️⃣ Get current user
  useEffect(() => {
    const fetchUserAndProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        
        // Fetch the profile ID associated with this user
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, lifestyle, currentStreak')
          .eq('userId', user.id)
          .single();

        if (profileData) {
          setProfileId(profileData.id);
          setCurrentStreak(profileData.currentStreak ?? 0);
          if (profileData.lifestyle) {
            setLifestyle(profileData.lifestyle as LifestyleAnswers);
          }
        }
      }
    };
    
    fetchUserAndProfile();
  }, [supabase]);
  
  // 2️⃣ Fetch plan for a given weekday & user
  const fetchPlan = useCallback(async () => {
    if (!profileId) {
      setPlan(null);
      setLoadingPlan(false);
      return;
    }

    setLoadingPlan(true);
    const { data } = await supabase
      .from('workout_plans')
      .select('dayOfWeek, bodyPart, repeatWeekly')
      .eq('profileId', profileId)
      .eq('dayOfWeek', day)
      .single();

    if (data) {
      setPlan({
        dayIndex: data.dayOfWeek,
        bodyPart: data.bodyPart,
        repeatWeekly: data.repeatWeekly
      });
    } else {
      setPlan(null);
    }
    setTimeout(() => {
      setLoadingPlan(false);
    }, 1000);
  }, [day, profileId, supabase]);

  // 3️⃣ Reload whenever the profile or day changes
  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // 3️⃣-B Fetch the logged session for the selected date (non-today dates only)
  useEffect(() => {
    const today = new Date();
    if (isSameLocalDay(selectedDate, today) || !profileId) {
      setDateSession(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('sessions')
        .select('sessionData')
        .eq('profileId', profileId)
        .eq('date', toLocalDateString(selectedDate))
        .maybeSingle();

      if (!cancelled) {
        setDateSession(data ? (data.sessionData as { completed: boolean; duration?: number; notes?: string }) : null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, selectedDate]);

  // 4️⃣ Upsert a new plan
  const handleSaved = async (newPlan: PlanDay & { repeatWeekly: boolean }) => {
    if (!profileId) return;
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
    if (error) console.error('Plan save failed:', error);
    else fetchPlan();
  };

  // 5️⃣ Session logger
  if (logging && plan) {
    return <SessionLogger plan={plan} lifestyle={lifestyle} onEnd={() => setLogging(false)} />;
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
        <PlanViewToggle view={view} onChange={setView} />
      </div>

      {view === 'month' ? (
        profileId && (
          <PlanMonthCalendar
            profileId={profileId}
            currentStreak={currentStreak}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setDay(date.getDay());
              setView('day');
            }}
          />
        )
      ) : (
        <>
      <div className="flex w-full gap-2 items-center px-4 py-2">
        <DayNavigator
          value={day}
          onChange={(newDay) => {
            setDay(newDay);
            setSelectedDate(nearestPastOrTodayWeekday(newDay));
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
            />

            {/* Show workout checklist when a plan exists but not yet started */}
            {plan && (
              <div className="mt-6">
                <WorkoutChecklist workoutType={plan.bodyPart} />
              </div>
            )}
          </>
        ) : (
          <PlanDaySummary
            date={selectedDate}
            scheduledBodyPart={plan?.bodyPart ?? null}
            session={dateSession}
          />
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
