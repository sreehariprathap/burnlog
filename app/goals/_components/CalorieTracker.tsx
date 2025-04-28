'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type CalorieBurnEntry = {
  id: string;
  date: string;
  activityType: string;
  duration: number;
  caloriesBurned: number;
};

type CalorieTrackerProps = {
  userId: string;
};

const ACTIVITY_TYPES = [
  { value: 'running', label: 'Running' },
  { value: 'walking', label: 'Walking' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'weightlifting', label: 'Weightlifting' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'other', label: 'Other' }
];

export function CalorieTracker({ userId }: CalorieTrackerProps) {
  const [entries, setEntries] = useState<CalorieBurnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityType, setActivityType] = useState('running');
  const [duration, setDuration] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  useEffect(() => {
    if (userId) {
      fetchCalorieEntries();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchCalorieEntries = async () => {
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

      // Then get calorie entries
      const { data, error } = await supabase
        .from('calorie_burns')
        .select('*')
        .eq('profileId', profileData.id)
        .order('date', { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      setEntries(data as CalorieBurnEntry[]);
    } catch (error) {
      console.error('Error fetching calorie entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!duration || isNaN(Number(duration))) {
        throw new Error('Please enter a valid duration');
      }
      
      if (!caloriesBurned || isNaN(Number(caloriesBurned))) {
        throw new Error('Please enter a valid calorie amount');
      }

      // Get profile ID
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', userId)
        .single();

      if (!profileData) {
        throw new Error('Profile not found');
      }

      // Insert new calorie burn entry
      const { data, error } = await supabase
        .from('calorie_burns')
        .insert([
          {
            profileId: profileData.id,
            activityType,
            duration: Number(duration),
            caloriesBurned: Number(caloriesBurned),
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      if (data) {
        // Refresh the list
        fetchCalorieEntries();
        // Reset form
        setDuration('');
        setCaloriesBurned('');
      }
    } catch (err) {
      console.error('Error adding calorie entry:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate simple stats
  const getTotalCalories = () => {
    if (entries.length === 0) return 0;
    return entries.reduce((sum, entry) => sum + entry.caloriesBurned, 0);
  };
  
  const getTotalDuration = () => {
    if (entries.length === 0) return 0;
    return entries.reduce((sum, entry) => sum + entry.duration, 0);
  };

  // Simple bar chart for the last 7 days
  const renderBarChart = () => {
    if (entries.length < 2) return null;
    
    // Group by date and sum calories
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 6);
    
    // Create array of last 7 days
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.unshift(date.toISOString().split('T')[0]);
    }
    
    // Sum calories by day
    const dailyCalories: Record<string, number> = {};
    days.forEach(day => dailyCalories[day] = 0);
    
    entries.forEach(entry => {
      const day = new Date(entry.date).toISOString().split('T')[0];
      if (dailyCalories[day] !== undefined) {
        dailyCalories[day] += entry.caloriesBurned;
      }
    });
    
    // Find max for scale
    const calorieValues = Object.values(dailyCalories);
    const max = Math.max(...calorieValues) || 1;
    
    return (
      <div className="h-32 flex items-end space-x-1 mt-4">
        {Object.entries(dailyCalories).map(([day, calories]) => {
          const height = (calories / max) * 100;
          const displayDay = new Date(day).toLocaleDateString(undefined, { weekday: 'short' });
          
          return (
            <div key={day} className="flex flex-col items-center flex-1">
              <div 
                className="bg-orange-500 w-full rounded-t"
                style={{ height: `${Math.max(5, height)}%` }}
                title={`${calories} calories`}
              />
              <span className="text-xs mt-1">{displayDay}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calorie Tracker</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Calories Burned</p>
                <p className="text-2xl font-bold">{getTotalCalories()} kcal</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Duration</p>
                <p className="text-xl font-bold">{getTotalDuration()} mins</p>
              </div>
            </div>
            
            {renderBarChart()}

            <form onSubmit={handleSubmit} className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label htmlFor="activityType">Activity Type</Label>
                <select
                  id="activityType"
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  {ACTIVITY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="duration">Duration (mins)</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="Minutes"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="calories">Calories</Label>
                  <Input
                    id="calories"
                    type="number"
                    placeholder="Calories burned"
                    value={caloriesBurned}
                    onChange={(e) => setCaloriesBurned(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Saving...' : 'Log Activity'}
              </Button>
            </form>

            {entries.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Recent Activities</h3>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {entries.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex justify-between text-sm border-b pb-1">
                      <span>
                        {new Date(entry.date).toLocaleDateString()} - {entry.activityType}
                      </span>
                      <span className="font-medium">
                        {entry.caloriesBurned} kcal ({entry.duration} min)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}