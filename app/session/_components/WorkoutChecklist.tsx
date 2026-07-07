'use client';

import React from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

// Exercise data by workout type - this provides a checklist of activities
const activitiesByWorkoutType: Record<string, string[]> = {
  Push: [
    'Warm up with 5 minutes of light cardio',
    'Complete 3-4 exercises for chest (bench press, push-ups, dips, etc.)',
    'Complete 2-3 exercises for shoulders (overhead press, lateral raises)',
    'Complete 2 exercises for triceps (pushdowns, overhead extensions)',
    'Stretch chest, shoulders and triceps post-workout',
    'Aim for 3-4 sets per exercise, 8-12 reps per set'
  ],
  Pull: [
    'Warm up with 5 minutes of light cardio',
    'Complete 3-4 back exercises (rows, pull-ups, lat pulldowns)',
    'Complete 2-3 exercises for biceps (curls, hammer curls)',
    'Include 1-2 exercises for forearms if time permits',
    'Stretch back and arms post-workout',
    'Aim for 3-4 sets per exercise, 8-12 reps per set'
  ],
  Legs: [
    'Warm up with 5 minutes of light cardio',
    'Complete 2-3 compound leg exercises (squats, deadlifts, leg press)',
    'Include 2 exercises for quads (leg extensions, lunges)',
    'Include 2 exercises for hamstrings (leg curls, Romanian deadlifts)',
    'Don\'t forget 1-2 calf exercises',
    'Stretch all leg muscles thoroughly post-workout',
    'Aim for 3-4 sets per exercise, 8-15 reps per set'
  ],
  'Full Body': [
    'Warm up with 5-10 minutes of cardio',
    'Perform 1-2 exercises for each major muscle group',
    'Include compound exercises (squats, deadlifts, bench press)',
    'Balance upper and lower body work',
    'Keep rest periods shorter (30-60 seconds)',
    'Stretch all major muscle groups post-workout',
    'Aim for 2-3 sets per exercise, 10-15 reps per set'
  ],
  Cardio: [
    'Start with a 5-minute warm-up',
    'Choose from: running, cycling, rowing, or elliptical',
    'Include 20-30 minutes of steady-state cardio',
    'OR perform 15-20 minutes of high-intensity interval training (HIIT)',
    'Include a 5-minute cool-down period',
    'Stay hydrated throughout your session'
  ],
  Rest: [
    'Focus on proper recovery',
    'Perform light stretching or yoga',
    'Stay hydrated and eat nutritious meals',
    'Get adequate sleep (7-9 hours)',
    'Consider foam rolling for muscle recovery',
    'Take time to rest mentally as well as physically'
  ]
};

type WorkoutChecklistProps = {
  workoutType: string;
};

export function WorkoutChecklist({ workoutType }: WorkoutChecklistProps) {
  const activities = activitiesByWorkoutType[workoutType] || [];

  return (
    <Card className="shadow-md">
      <CardContent className="pt-6">
        <CardTitle className="text-xl mb-4">Today&apos;s {workoutType} Checklist</CardTitle>
        <ul className="space-y-3">
          {activities.map((activity, index) => (
            <li key={index} className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>{activity}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}