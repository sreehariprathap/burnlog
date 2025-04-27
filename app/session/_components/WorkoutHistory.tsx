// app/session/_components/WorkoutHistory.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, BarChart, CheckCircle, FileText } from 'lucide-react';

type WorkoutHistoryProps = {
  onClose: () => void;
};

type WorkoutStats = {
  total: number;
  completed: number;
  streak: number;
  averageDuration: number;
  mostFrequent: string;
};

type ExampleWorkout = {
  title: string;
  bodyPart: string;
  description: string;
  exercises: {
    name: string;
    sets: number;
    reps: string;
  }[];
};

const exampleWorkouts: Record<string, ExampleWorkout[]> = {
  'Push': [
    {
      title: 'Upper Body Push',
      bodyPart: 'Push',
      description: 'Focus on chest, shoulders and triceps',
      exercises: [
        { name: 'Bench Press', sets: 4, reps: '8-10' },
        { name: 'Overhead Press', sets: 3, reps: '8-12' },
        { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12' },
        { name: 'Tricep Pushdowns', sets: 3, reps: '12-15' },
        { name: 'Lateral Raises', sets: 3, reps: '12-15' }
      ]
    },
    {
      title: 'Chest Focus Day',
      bodyPart: 'Push',
      description: 'Heavy emphasis on chest development',
      exercises: [
        { name: 'Barbell Bench Press', sets: 5, reps: '5-8' },
        { name: 'Incline Bench Press', sets: 4, reps: '8-10' },
        { name: 'Chest Flyes', sets: 3, reps: '12-15' },
        { name: 'Push-ups', sets: 3, reps: 'To failure' },
        { name: 'Tricep Dips', sets: 3, reps: '10-12' }
      ]
    }
  ],
  'Pull': [
    {
      title: 'Back and Biceps',
      bodyPart: 'Pull',
      description: 'Complete back development with bicep focus',
      exercises: [
        { name: 'Pull-ups', sets: 4, reps: '6-10' },
        { name: 'Bent Over Rows', sets: 4, reps: '8-12' },
        { name: 'Lat Pulldowns', sets: 3, reps: '10-12' },
        { name: 'Face Pulls', sets: 3, reps: '15-20' },
        { name: 'Barbell Curls', sets: 3, reps: '10-12' }
      ]
    },
    {
      title: 'Deadlift Day',
      bodyPart: 'Pull',
      description: 'Heavy deadlifts with supporting back exercises',
      exercises: [
        { name: 'Deadlifts', sets: 5, reps: '3-5' },
        { name: 'Single-arm Dumbbell Rows', sets: 3, reps: '8-10 each side' },
        { name: 'Cable Rows', sets: 3, reps: '10-12' },
        { name: 'Hammer Curls', sets: 3, reps: '12-15' },
        { name: 'Shrugs', sets: 3, reps: '12-15' }
      ]
    }
  ],
  'Legs': [
    {
      title: 'Quad Focused Leg Day',
      bodyPart: 'Legs',
      description: 'Emphasizing quadriceps development',
      exercises: [
        { name: 'Barbell Squats', sets: 5, reps: '5-8' },
        { name: 'Leg Press', sets: 4, reps: '10-12' },
        { name: 'Leg Extensions', sets: 3, reps: '12-15' },
        { name: 'Walking Lunges', sets: 3, reps: '10 each leg' },
        { name: 'Standing Calf Raises', sets: 4, reps: '15-20' }
      ]
    },
    {
      title: 'Hamstring and Glute Focus',
      bodyPart: 'Legs',
      description: 'Targeting posterior chain development',
      exercises: [
        { name: 'Romanian Deadlifts', sets: 4, reps: '8-10' },
        { name: 'Hip Thrusts', sets: 4, reps: '10-12' },
        { name: 'Leg Curls', sets: 3, reps: '12-15' },
        { name: 'Bulgarian Split Squats', sets: 3, reps: '10 each leg' },
        { name: 'Seated Calf Raises', sets: 3, reps: '15-20' }
      ]
    }
  ],
  'Full Body': [
    {
      title: 'Complete Full Body Workout',
      bodyPart: 'Full Body',
      description: 'Hit every major muscle group efficiently',
      exercises: [
        { name: 'Barbell Squats', sets: 3, reps: '8-10' },
        { name: 'Pull-ups', sets: 3, reps: '6-10' },
        { name: 'Bench Press', sets: 3, reps: '8-10' },
        { name: 'Romanian Deadlifts', sets: 3, reps: '10-12' },
        { name: 'Overhead Press', sets: 2, reps: '10-12' },
        { name: 'Dumbbell Curls', sets: 2, reps: '12-15' }
      ]
    },
    {
      title: 'Functional Full Body Circuit',
      bodyPart: 'Full Body',
      description: 'Circuit-style training for strength and conditioning',
      exercises: [
        { name: 'Goblet Squats', sets: 3, reps: '12-15' },
        { name: 'Dumbbell Rows', sets: 3, reps: '12 each side' },
        { name: 'Push-ups', sets: 3, reps: '10-15' },
        { name: 'Dumbbell Lunges', sets: 3, reps: '10 each leg' },
        { name: 'Mountain Climbers', sets: 3, reps: '30 seconds' }
      ]
    }
  ],
  'Cardio': [
    {
      title: 'HIIT Cardio Workout',
      bodyPart: 'Cardio',
      description: 'High intensity interval training for maximum calorie burn',
      exercises: [
        { name: 'Sprint Intervals', sets: 10, reps: '30s sprint, 60s walk' },
        { name: 'Burpees', sets: 3, reps: '10-15' },
        { name: 'Jump Squats', sets: 3, reps: '15-20' },
        { name: 'Mountain Climbers', sets: 3, reps: '30 seconds' },
        { name: 'Jump Rope', sets: 3, reps: '60 seconds' }
      ]
    },
    {
      title: 'Steady State Cardio',
      bodyPart: 'Cardio',
      description: 'Endurance-focused cardio session',
      exercises: [
        { name: 'Treadmill Run', sets: 1, reps: '30 minutes (moderate pace)' },
        { name: 'Cycling', sets: 1, reps: '20 minutes (moderate resistance)' },
        { name: 'Stair Climber', sets: 1, reps: '10 minutes' },
        { name: 'Rowing Machine', sets: 1, reps: '10 minutes' }
      ]
    }
  ],
  'Rest': [
    {
      title: 'Active Recovery',
      bodyPart: 'Rest',
      description: 'Light activities to promote recovery',
      exercises: [
        { name: 'Walking', sets: 1, reps: '20-30 minutes' },
        { name: 'Light Stretching', sets: 1, reps: '10-15 minutes' },
        { name: 'Foam Rolling', sets: 1, reps: '10 minutes' },
        { name: 'Yoga', sets: 1, reps: '15-20 minutes' }
      ]
    },
    {
      title: 'Complete Rest Day',
      bodyPart: 'Rest',
      description: 'Focus on nutrition and sleep',
      exercises: [
        { name: 'Hydration', sets: 1, reps: 'Drink plenty of water' },
        { name: 'Nutrition', sets: 1, reps: 'Focus on protein and recovery foods' },
        { name: 'Sleep', sets: 1, reps: 'Aim for 7-9 hours' },
        { name: 'Meditation', sets: 1, reps: '10 minutes' }
      ]
    }
  ]
};

export function WorkoutHistory({ onClose }: WorkoutHistoryProps) {
  const supabase = createClientComponentClient();
  const [activeTab, setActiveTab] = useState('stats');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<WorkoutStats>({
    total: 0,
    completed: 0,
    streak: 0,
    averageDuration: 0,
    mostFrequent: ''
  });
  const [selectedBodyPart, setSelectedBodyPart] = useState('Push');
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);

  useEffect(() => {
    async function fetchWorkoutData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get sessions data
        const { data: sessions } = await supabase
          .from('sessions')
          .select('*')
          .eq('profileId', user.id)
          .order('date', { ascending: false })
          .limit(10);

        if (sessions && sessions.length > 0) {
          // Calculate stats
          const completed = sessions.filter(s => s.sessionData.completed).length;
          
          // Calculate average duration
          const durations = sessions
            .filter(s => s.sessionData.duration)
            .map(s => s.sessionData.duration);
          
          const avgDuration = durations.length > 0 
            ? durations.reduce((sum, val) => sum + val, 0) / durations.length 
            : 0;
          
          // Find most frequent body part
          const bodyParts = sessions
            .filter(s => s.sessionData.bodyPart)
            .map(s => s.sessionData.bodyPart);
          
          const frequency: Record<string, number> = {};
          let maxFreq = 0;
          let mostFrequent = '';
          
          bodyParts.forEach(part => {
            frequency[part] = (frequency[part] || 0) + 1;
            if (frequency[part] > maxFreq) {
              maxFreq = frequency[part];
              mostFrequent = part;
            }
          });
          
          // Calculate streak (consecutive days with workouts)
          let streak = 0;
          const dates = [...new Set(sessions
            .filter(s => s.sessionData.completed)
            .map(s => s.date))].sort();
          
          if (dates.length > 0) {
            streak = 1;
            for (let i = 1; i < dates.length; i++) {
              const prevDate = new Date(dates[i-1]);
              const currDate = new Date(dates[i]);
              const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays === 1) {
                streak++;
              } else {
                break;
              }
            }
          }
          
          setStats({
            total: sessions.length,
            completed,
            streak,
            averageDuration: Math.round(avgDuration),
            mostFrequent: mostFrequent || 'N/A'
          });
          
          setRecentWorkouts(sessions);
        }
      } catch (error) {
        console.error('Error fetching workout data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchWorkoutData();
  }, [supabase]);

  const renderStats = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total Workouts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">
              {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
            </div>
            <p className="text-sm text-muted-foreground">Completion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{stats.streak}</div>
            <p className="text-sm text-muted-foreground">Current Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{stats.averageDuration}</div>
            <p className="text-sm text-muted-foreground">Avg. Minutes</p>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="pt-6 text-center">
            <div className="text-xl font-bold">{stats.mostFrequent}</div>
            <p className="text-sm text-muted-foreground">Most Frequent Workout</p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderRecentWorkouts = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }

    if (recentWorkouts.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No workout history yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {recentWorkouts.slice(0, 5).map((workout, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{workout.sessionData.bodyPart}</div>
                  <div className="text-sm text-muted-foreground">{new Date(workout.date).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center">
                  {workout.sessionData.completed ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <div className="text-sm text-yellow-500">Incomplete</div>
                  )}
                </div>
              </div>
              {workout.sessionData.duration && (
                <div className="text-sm mt-2">
                  Duration: {workout.sessionData.duration} minutes
                </div>
              )}
              {workout.sessionData.notes && (
                <div className="text-sm mt-2 italic">
                  "{workout.sessionData.notes.substring(0, 60)}
                  {workout.sessionData.notes.length > 60 ? '...' : ''}"
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderExampleWorkouts = () => {
    const workouts = exampleWorkouts[selectedBodyPart] || [];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(exampleWorkouts).map(bodyPart => (
            <Button
              key={bodyPart}
              variant={selectedBodyPart === bodyPart ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedBodyPart(bodyPart)}
            >
              {bodyPart}
            </Button>
          ))}
        </div>

        {workouts.map((workout, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle>{workout.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{workout.description}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {workout.exercises.map((exercise, j) => (
                  <div key={j} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <div className="font-medium">{exercise.name}</div>
                    </div>
                    <div className="text-sm">
                      {exercise.sets} × {exercise.reps}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Workout Tracker</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stats" className="flex items-center gap-2">
            <BarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Statistics</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="examples" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Example Workouts</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="stats" className="mt-4 space-y-4">
          {renderStats()}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <h3 className="text-lg font-medium mb-4">Recent Workouts</h3>
          {renderRecentWorkouts()}
        </TabsContent>
        <TabsContent value="examples" className="mt-4">
          <h3 className="text-lg font-medium mb-4">Example Workouts</h3>
          {renderExampleWorkouts()}
        </TabsContent>
      </Tabs>
    </div>
  );
}