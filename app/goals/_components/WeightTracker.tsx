'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type WeightEntry = {
  id: string;
  date: string;
  weight: number;
  notes?: string;
};

type WeightTrackerProps = {
  userId: string;
};

export function WeightTracker({ userId }: WeightTrackerProps) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  useEffect(() => {
    if (userId) {
      fetchWeightEntries();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const fetchWeightEntries = async () => {
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

      // Then get weight entries
      const { data, error } = await supabase
        .from('weight_entries')
        .select('*')
        .eq('profileId', profileData.id)
        .order('date', { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      setEntries(data as WeightEntry[]);
    } catch (error) {
      console.error('Error fetching weight entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!weight || isNaN(Number(weight))) {
        throw new Error('Please enter a valid weight');
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

      // Insert new weight entry
      const { data, error } = await supabase
        .from('weight_entries')
        .insert([
          {
            profileId: profileData.id,
            weight: Number(weight),
            notes: notes || null,
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      if (data) {
        // Refresh the list
        fetchWeightEntries();
        // Reset form
        setWeight('');
        setNotes('');
      }
    } catch (err) {
      console.error('Error adding weight entry:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate simple stats
  const getStats = () => {
    if (entries.length === 0) return null;
    
    const latest = entries[0].weight;
    
    if (entries.length === 1) {
      return { latest, change: 0 };
    }
    
    const oldest = entries[entries.length - 1].weight;
    const change = +(latest - oldest).toFixed(1);
    
    return { latest, change };
  };

  const stats = getStats();

  // Simple sparkline chart
  const renderSparkline = () => {
    if (entries.length < 2) return null;
    
    // Get last 7 entries for the chart
    const chartData = [...entries].reverse().slice(0, 7);
    
    // Find min and max for scale
    const weights = chartData.map(e => e.weight);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const range = max - min || 1; // Avoid division by zero
    
    return (
      <div className="h-16 flex items-end space-x-1 mt-4">
        {chartData.map((entry) => {
          const height = ((entry.weight - min) / range) * 100;
          return (
            <div 
              key={entry.id} 
              className="bg-blue-500 w-4 rounded-t"
              style={{ height: `${Math.max(10, height)}%` }}
              title={`${new Date(entry.date).toLocaleDateString()}: ${entry.weight}kg`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weight Tracker</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            {stats && (
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Current</p>
                  <p className="text-2xl font-bold">{stats.latest} kg</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Change</p>
                  <p className={`text-xl font-bold ${stats.change < 0 ? 'text-green-500' : stats.change > 0 ? 'text-red-500' : ''}`}>
                    {stats.change > 0 ? '+' : ''}{stats.change} kg
                  </p>
                </div>
              </div>
            )}
            
            {renderSparkline()}

            <form onSubmit={handleSubmit} className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label htmlFor="weight">Record Weight (kg)</Label>
                <div className="flex space-x-2">
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    placeholder="Your weight"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    required
                    className="flex-1"
                  />
                  <Button type="submit" disabled={submitting || !weight}>
                    Save
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  placeholder="Any notes about this measurement"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </form>

            {entries.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Recent Entries</h3>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {entries.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex justify-between text-sm border-b pb-1">
                      <span>{new Date(entry.date).toLocaleDateString()}</span>
                      <span className="font-medium">{entry.weight} kg</span>
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