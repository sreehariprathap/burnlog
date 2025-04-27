// app/sessions/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { TopBar } from '@/components/TopBar';
import { PlanCard, PlanDay } from './_components/PlanCard';
import { SessionLogger } from './_components/SessionLogger';
import { DayNavigator } from './_components/DayNavigator';
import { AddWorkoutModal } from './_components/AddWorkoutModal';
import { BottomNav } from '@/components/BottomNav';


export default function SessionsPage() {
  const supabase = createClientComponentClient();

  // which day of week (0=Sun…6=Sat)
  const [day, setDay] = useState<number>(new Date().getDay());
  const [plan, setPlan] = useState<PlanDay | null>(null);
  const [logging, setLogging] = useState<boolean>(false);

  // modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // fetch the PlanDay for the selected day
  const fetchPlan = useCallback(async () => {
    // assume you have a 'workout_plans' table with columns:
    //   profile_id, day_index, body_part
    const { data, error } = await supabase
      .from('workout_plans')
      .select('day_index, body_part')
      .eq('day_index', day)
      .single();

    if (error) {
      console.error('Error loading plan:', error);
      setPlan(null);
    } else if (data) {
      setPlan({
        dayIndex: data.day_index,
        bodyPart: data.body_part
      });
    } else {
      setPlan(null);
    }
  }, [day, supabase]);

  // initial & day‐change load
  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // handler when AddWorkoutModal saves a new plan
  const handleSaved = async (newPlan: PlanDay) => {
    // upsert into workout_plans
    const { error } = await supabase
      .from('workout_plans')
      .upsert({
        day_index: newPlan.dayIndex,
        body_part: newPlan.bodyPart
        // plus your profile_id if needed
      },
      { onConflict: 'day_index' }
      );
    if (error) {
      console.error('Error saving plan:', error);
    } else {
      fetchPlan();
    }
  };

  // when logging, show logger UI
  if (logging && plan) {
    return <SessionLogger plan={plan} onEnd={() => setLogging(false)} />;
  }

  return (
    <div className="pb-16">
      <TopBar title="Sessions" />

      <DayNavigator value={day} onChange={setDay} />

      <div className="p-4 space-y-4">
        <PlanCard
          plan={plan}
          onStart={() => setLogging(true)}
          onAdd={() => setShowAddModal(true)}
        />
      </div>

      <AddWorkoutModal
        open={showAddModal}
        initialDay={day}
        onOpenChange={setShowAddModal}
        onSaved={p => {
          setShowAddModal(false);
          handleSaved(p);
        }}
      />
      <BottomNav/>
    </div>
  );
}
