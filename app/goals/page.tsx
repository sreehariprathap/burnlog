'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StaminaTracker } from './_components/StaminaTracker';
import { FoodIntakeTracker } from './_components/FoodIntakeTracker';
import { CalorieTracker } from './_components/CalorieTracker';
import { WeightTracker } from './_components/WeightTracker';
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalsList } from './_components/GoalsList';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';

export type Goal = {
  id: string;
  goalType: string;
  targetValue: number;
  createdAt: string;
};

const supabase = createClientComponentClient();


export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUserId(data.user.id);
        fetchGoals(data.user.id);
      } else {
        setLoading(false);
      }
    };
    getUser();
  }, []);

  const fetchGoals = async (userId: string) => {
    setLoading(true);
    try {
      // First get the profile ID
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', userId)
        .single();

      if (!profileData) {
        console.error('Profile not found');
        setLoading(false);
        return;
      }

      // Then get the goals for this profile
      const { data, error } = await supabase
        .from('fitness_goals')
        .select('*')
        .eq('profileId', profileData.id);

      if (error) {
        throw error;
      }

      if (data) {
        setGoals(data as Goal[]);
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoalAdded = (newGoal: Goal) => {
    setGoals((currentGoals) => [...currentGoals, newGoal]);
  };

  return (
    <div className="container mx-auto ">
      <TopBar title="Fitness Goals" />
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
      ) : goals.length > 0 ? (
        <GoalsList goals={goals} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Goals Set</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You haven&apos;t set any fitness goals yet. Start by adding your first goal.
            </p>
            <AddGoalForm onGoalAdded={handleGoalAdded} userId={userId!}  />
          </CardContent>
        </Card>
      )}

      {goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Add Another Goal</CardTitle>
          </CardHeader>
          <CardContent>
            <AddGoalForm onGoalAdded={handleGoalAdded}  userId={userId!}/>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <WeightTracker userId={userId!} />
        <CalorieTracker userId={userId!} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FoodIntakeTracker userId={userId!} />
        <StaminaTracker userId={userId!} />
      </div>
              
      </div>
      <BottomNav />
    </div>
  );
}