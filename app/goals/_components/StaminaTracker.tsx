'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type StaminaEntry = {
  id: string;
  date: string;
  activityType: string;
  distance?: number;
  duration: number;
  avgHeartRate?: number;
};

type StaminaTrackerProps = {
  userId: string;
};

const ACTIVITY_TYPES = [
  { value: 'running', label: 'Running' },
  { value: 'walking', label: 'Walking' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'rowing', label: 'Rowing' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'other', label: 'Other' }
];

export function StaminaTracker({ userId }: StaminaTrackerProps) {
  const [entries, setEntries] = useState<StaminaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityType, setActivityType] = useState('running');
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [avgHeartRate, setAvgHeartRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  useEffect(() => {
    if (userId) {
      fetchStaminaEntries();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchStaminaEntries = async () => {
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

      // Then get stamina entries
      const { data, error } = await supabase
        .from('stamina_sessions')
        .select('*')
        .eq('profileId', profileData.id)
        .order('date', { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      setEntries(data as StaminaEntry[]);
    } catch (error) {
      console.error('Error fetching stamina entries:', error);
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

      // Get profile ID
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', userId)
        .single();

      if (!profileData) {
        throw new Error('Profile not found');
      }

      // Insert new stamina session
      const { data, error } = await supabase
        .from('stamina_sessions')
        .insert([
          {
            profileId: profileData.id,
            activityType,
            distance: distance ? Number(distance) : null,
            duration: Number(duration),
            avgHeartRate: avgHeartRate ? Number(avgHeartRate) : null,
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      if (data) {
        // Refresh the list
        fetchStaminaEntries();
        // Reset form
        setDistance('');
        setDuration('');
        setAvgHeartRate('');
      }
    } catch (err) {
      console.error('Error adding stamina entry:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate simple stats
  const calculateStats = () => {
    if (entries.length === 0) {
      return {
        totalDistance: 0,
        totalDuration: 0,
        avgPace: 0,
        avgHeartRate: 0,
      };
    }

    const totalDistance = entries.reduce((sum, entry) => sum + (entry.distance || 0), 0);
    const totalDuration = entries.reduce((sum, entry) => sum + entry.duration, 0);
    
    // Average pace in minutes per km
    let avgPace = 0;
    const sessionsWithDistance = entries.filter(e => e.distance && e.distance > 0);
    if (sessionsWithDistance.length > 0) {
      const totalPace = sessionsWithDistance.reduce((sum, entry) => {
        const pace = entry.duration / (entry.distance || 1); // minutes per km
        return sum + pace;
      }, 0);
      avgPace = totalPace / sessionsWithDistance.length;
    }

    // Average heart rate
    let avgHeartRate = 0;
    const sessionsWithHeartRate = entries.filter(e => e.avgHeartRate && e.avgHeartRate > 0);
    if (sessionsWithHeartRate.length > 0) {
      const totalHeartRate = sessionsWithHeartRate.reduce((sum, entry) => sum + (entry.avgHeartRate || 0), 0);
      avgHeartRate = totalHeartRate / sessionsWithHeartRate.length;
    }

    return {
      totalDistance,
      totalDuration,
      avgPace,
      avgHeartRate,
    };
  };

  const stats = calculateStats();

  // Line chart for pace over time
  const renderPaceChart = () => {
    const sessionsWithDistance = entries
      .filter(e => e.distance && e.distance > 0)
      .slice(0, 7)
      .reverse();
      
    if (sessionsWithDistance.length < 2) return null;
    
    const paces = sessionsWithDistance.map(entry => ({
      date: new Date(entry.date).toLocaleDateString(),
      pace: entry.duration / (entry.distance || 1) // minutes per km
    }));
    
    const maxPace = Math.max(...paces.map(p => p.pace));
    const minPace = Math.min(...paces.map(p => p.pace));
    const range = maxPace - minPace || 1; // Avoid division by zero
    
    // Generate points for SVG polyline
    const chartHeight = 100;
    const chartWidth = 100 * (paces.length - 1);
    const points = paces.map((point, index) => {
      const x = (index / (paces.length - 1)) * chartWidth;
      // Invert the y-axis so that lower pace (faster) is higher on chart
      const normalizedPace = (point.pace - minPace) / range;
      const y = chartHeight * (1 - normalizedPace);
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <div className="mt-4 mb-2">
        <p className="text-xs text-muted-foreground mb-1">Pace (min/km) - Lower is better</p>
        <div className="relative h-[100px] w-full">
          <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
            <polyline
              points={points}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
            />
          </svg>
          <div className="absolute top-0 left-0 text-xs text-muted-foreground">
            {Math.round(minPace * 10) / 10} min/km
          </div>
          <div className="absolute bottom-0 left-0 text-xs text-muted-foreground">
            {Math.round(maxPace * 10) / 10} min/km
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stamina Tracker</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Distance</p>
                <p className="text-2xl font-bold">{stats.totalDistance.toFixed(1)} km</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Duration</p>
                <p className="text-2xl font-bold">{stats.totalDuration} min</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Pace</p>
                <p className="text-lg font-medium">
                  {stats.avgPace > 0 ? `${stats.avgPace.toFixed(1)} min/km` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Heart Rate</p>
                <p className="text-lg font-medium">
                  {stats.avgHeartRate > 0 ? `${Math.round(stats.avgHeartRate)} bpm` : 'N/A'}
                </p>
              </div>
            </div>
            
            {renderPaceChart()}

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
              
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="distance">Distance (km)</Label>
                  <Input
                    id="distance"
                    type="number"
                    step="0.1"
                    placeholder="Distance"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="duration">Duration (min)</Label>
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
                  <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
                  <Input
                    id="heartRate"
                    type="number"
                    placeholder="Avg BPM"
                    value={avgHeartRate}
                    onChange={(e) => setAvgHeartRate(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Saving...' : 'Log Stamina Session'}
              </Button>
            </form>

            {entries.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Recent Sessions</h3>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {entries.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex justify-between text-sm border-b pb-1">
                      <span>
                        {new Date(entry.date).toLocaleDateString()} - {entry.activityType}
                      </span>
                      <span className="font-medium">
                        {entry.distance ? `${entry.distance} km, ` : ''}
                        {entry.duration} min
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