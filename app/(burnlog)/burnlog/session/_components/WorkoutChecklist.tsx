'use client';

import React from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

// Checklist hints shown on the plan card before starting a session
const activitiesByWorkoutType: Record<string, string[]> = {
  Push: [
    'Warm up with 5 minutes of light cardio',
    'Complete 3-4 exercises for chest (bench press, push-ups, dips)',
    'Complete 2-3 exercises for shoulders (overhead press, lateral raises)',
    'Complete 2 exercises for triceps (pushdowns, overhead extensions)',
    'Stretch chest, shoulders and triceps post-workout',
    'Aim for 3-4 sets per exercise, 8-12 reps per set',
  ],
  Pull: [
    'Warm up with 5 minutes of light cardio',
    'Complete 3-4 back exercises (rows, pull-ups, lat pulldowns)',
    'Complete 2-3 exercises for biceps (curls, hammer curls)',
    'Include 1-2 exercises for forearms if time permits',
    'Stretch back and arms post-workout',
    'Aim for 3-4 sets per exercise, 8-12 reps per set',
  ],
  Legs: [
    'Warm up with 5 minutes of light cardio',
    'Complete 2-3 compound leg exercises (squats, lunges, deadlifts)',
    'Include 2 exercises for quads and 2 for hamstrings',
    "Don't forget 1-2 calf exercises",
    'Stretch all leg muscles thoroughly post-workout',
    'Aim for 3-4 sets per exercise, 8-15 reps per set',
  ],
  'Full Body': [
    'Warm up with 5-10 minutes of cardio',
    'Perform 1-2 exercises for each major muscle group',
    'Include compound exercises — squat, hinge, push, pull',
    'Keep rest periods shorter (30-60 seconds)',
    'Stretch all major muscle groups post-workout',
    'Aim for 2-3 sets per exercise, 10-15 reps per set',
  ],
  Bodyweight: [
    'No equipment needed — find any clear floor space',
    'Start with a 3-5 min dynamic warm-up (arm circles, leg swings)',
    'Cover Upper Body, Core, Lower Body, and Cardio categories',
    'Aim for 3 exercises per category, 3 sets each',
    'Rest 30-45 seconds between sets',
    'Cool down with light stretching',
  ],
  Cardio: [
    'Start with a 5-minute warm-up',
    'Choose from: running, cycling, rowing, or elliptical',
    'Include 20-30 minutes of steady-state cardio',
    'OR perform 15-20 minutes of HIIT intervals',
    'Include a 5-minute cool-down period',
    'Stay hydrated throughout your session',
  ],
  'Outdoor Cardio': [
    'Check the weather and wear appropriate gear',
    'Start with a 5 min brisk walk or light jog to warm up',
    'Pick your activity: run, cycle, park HIIT, or hike',
    'Try to include a change of pace — intervals or hills',
    'Cool down with an easy pace for the last 5 minutes',
    'Log your distance and time when you finish',
  ],
  'Active Commute': [
    'Your commute counts as your workout today — great choice!',
    'Aim for a brisk pace (walking) or moderate effort (cycling)',
    'Track your distance and time in the logger when done',
    'Stay hydrated on the way',
    'Lock your bike safely or finish the day with a cool-down stretch',
  ],
  Rest: [
    'Focus on proper recovery',
    'Perform light stretching or yoga',
    'Stay hydrated and eat nutritious meals',
    'Get adequate sleep (7-9 hours)',
    'Consider foam rolling for muscle recovery',
    'Take time to rest mentally as well as physically',
  ],
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