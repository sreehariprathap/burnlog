'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Scale } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

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
  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchWeightEntries();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setError(null);
    setSubmitting(true);

    try {
      if (!weight || isNaN(Number(weight))) {
        throw new Error('Please enter a valid weight');
      }

      const weightValue = Number(weight);

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
            weight: weightValue,
            notes: notes || null,
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      // Update the profile with the latest weight value
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ weight: weightValue })
        .eq('id', profileData.id);
        
      if (updateError) {
        console.error('Error updating profile weight:', updateError);
        // Continue with the function even if profile update fails
      }

      if (data) {
        // Refresh the list
        fetchWeightEntries();
        toast({ title: 'Weight logged', description: `${weightValue} kg recorded.` });
        // Reset form
        setWeight('');
        setNotes('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to log weight';
      console.error('Error adding weight entry:', err);
      setError(message);
      toast({ title: 'Failed to log weight', description: message, variant: 'destructive' });
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
              className="bg-amber-500 w-4 rounded-t"
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
                    inputMode="decimal"
                    step="0.1"
                    placeholder="Your weight"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    required
                    className="flex-1"
                  />
                  <Button type="submit" disabled={submitting || !weight}>
                    {submitting ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  autoComplete="off"
                  placeholder="Any notes about this measurement"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>

            {entries.length > 0 ? (
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
            ) : (
              <div className="mt-4 flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
                <Scale className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-semibold">No weigh-ins yet</p>
                <p className="text-xs text-muted-foreground">Record your weight above to start tracking your progress.</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}