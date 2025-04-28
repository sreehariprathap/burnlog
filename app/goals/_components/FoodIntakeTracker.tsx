'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type FoodIntakeEntry = {
  id: string;
  date: string;
  mealType: string;
  foodName: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

type FoodIntakeTrackerProps = {
  userId: string;
};

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function FoodIntakeTracker({ userId }: FoodIntakeTrackerProps) {
  const [entries, setEntries] = useState<FoodIntakeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mealType, setMealType] = useState('breakfast');
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  useEffect(() => {
    if (userId) {
      fetchFoodEntries();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const fetchFoodEntries = async () => {
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

      // Then get food intake entries
      const { data, error } = await supabase
        .from('food_intakes')
        .select('*')
        .eq('profileId', profileData.id)
        .order('date', { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      setEntries(data as FoodIntakeEntry[]);
    } catch (error) {
      console.error('Error fetching food entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!foodName) {
        throw new Error('Please enter a food name');
      }
      
      if (!calories || isNaN(Number(calories))) {
        throw new Error('Please enter valid calories');
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

      // Insert new food entry
      const { data, error } = await supabase
        .from('food_intakes')
        .insert([
          {
            profileId: profileData.id,
            mealType,
            foodName,
            calories: Number(calories),
            protein: protein ? Number(protein) : null,
            carbs: carbs ? Number(carbs) : null,
            fat: fat ? Number(fat) : null,
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      if (data) {
        // Refresh the list
        fetchFoodEntries();
        // Reset form
        setFoodName('');
        setCalories('');
        setProtein('');
        setCarbs('');
        setFat('');
      }
    } catch (err) {
      console.error('Error adding food entry:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate stats for today
  const getTodayStats = () => {
    if (entries.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    
    const today = new Date().toISOString().split('T')[0];
    
    const todayEntries = entries.filter(entry => 
      new Date(entry.date).toISOString().split('T')[0] === today
    );
    
    if (todayEntries.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    
    return {
      calories: todayEntries.reduce((sum, entry) => sum + entry.calories, 0),
      protein: todayEntries.reduce((sum, entry) => sum + (entry.protein || 0), 0),
      carbs: todayEntries.reduce((sum, entry) => sum + (entry.carbs || 0), 0),
      fat: todayEntries.reduce((sum, entry) => sum + (entry.fat || 0), 0),
    };
  };

  const todayStats = getTodayStats();

  // Pie chart for macros (protein/carbs/fat)
  const renderMacroPieChart = () => {
    if (todayStats.protein === 0 && todayStats.carbs === 0 && todayStats.fat === 0) {
      return null;
    }
    
    const total = todayStats.protein + todayStats.carbs + todayStats.fat;
    if (total === 0) return null;
    
    const proteinPercent = Math.round((todayStats.protein / total) * 100);
    const carbsPercent = Math.round((todayStats.carbs / total) * 100);
    const fatPercent = Math.round((todayStats.fat / total) * 100);
    
    // Create a simple CSS-based pie chart
    return (
      <div className="flex items-center justify-center mt-4 mb-2">
        <div className="relative h-32 w-32 rounded-full overflow-hidden">
          <div 
            className="absolute bg-amber-500" 
            style={{
              top: 0, left: 0, height: '100%', width: '100%', 
              clipPath: `polygon(50% 50%, 50% 0, ${50 + 50 * Math.cos(2 * Math.PI * proteinPercent / 100)}% ${50 - 50 * Math.sin(2 * Math.PI * proteinPercent / 100)}%, 50% 50%)`
            }}
          />
          <div 
            className="absolute bg-green-500" 
            style={{
              top: 0, left: 0, height: '100%', width: '100%', 
              clipPath: `polygon(50% 50%, ${50 + 50 * Math.cos(2 * Math.PI * proteinPercent / 100)}% ${50 - 50 * Math.sin(2 * Math.PI * proteinPercent / 100)}%, ${50 + 50 * Math.cos(2 * Math.PI * (proteinPercent + carbsPercent) / 100)}% ${50 - 50 * Math.sin(2 * Math.PI * (proteinPercent + carbsPercent) / 100)}%, 50% 50%)`
            }}
          />
          <div 
            className="absolute bg-red-500" 
            style={{
              top: 0, left: 0, height: '100%', width: '100%', 
              clipPath: `polygon(50% 50%, ${50 + 50 * Math.cos(2 * Math.PI * (proteinPercent + carbsPercent) / 100)}% ${50 - 50 * Math.sin(2 * Math.PI * (proteinPercent + carbsPercent) / 100)}%, 100% 50%, 50% 100%, 0 50%, 50% 0)`
            }}
          />
        </div>
        <div className="ml-4">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 mr-1"></div> 
            <span className="text-xs">Protein: {proteinPercent}%</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 mr-1"></div> 
            <span className="text-xs">Carbs: {carbsPercent}%</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-red-500 mr-1"></div> 
            <span className="text-xs">Fat: {fatPercent}%</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Food Intake Tracker</CardTitle>
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
                <p className="text-sm text-muted-foreground">Today&apos;s Calories</p>
                <p className="text-2xl font-bold">{todayStats.calories} kcal</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Macros (g)</p>
                <p className="text-sm">
                  <span className="font-semibold text-blue-500">P: {todayStats.protein}</span> / 
                  <span className="font-semibold text-green-500"> C: {todayStats.carbs}</span> / 
                  <span className="font-semibold text-red-500"> F: {todayStats.fat}</span>
                </p>
              </div>
            </div>
            
            {renderMacroPieChart()}

            <form onSubmit={handleSubmit} className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="mealType">Meal</Label>
                  <select
                    id="mealType"
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    {MEAL_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="calories">Calories</Label>
                  <Input
                    id="calories"
                    type="number"
                    placeholder="Calories"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="foodName">Food Name</Label>
                <Input
                  id="foodName"
                  placeholder="What did you eat?"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  required
                />
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="protein">Protein (g)</Label>
                  <Input
                    id="protein"
                    type="number"
                    step="0.1"
                    placeholder="Protein"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="carbs">Carbs (g)</Label>
                  <Input
                    id="carbs"
                    type="number"
                    step="0.1"
                    placeholder="Carbs"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="fat">Fat (g)</Label>
                  <Input
                    id="fat"
                    type="number"
                    step="0.1"
                    placeholder="Fat"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Saving...' : 'Log Food'}
              </Button>
            </form>

            {entries.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Recent Meals</h3>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {entries.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex justify-between text-sm border-b pb-1">
                      <span>
                        {new Date(entry.date).toLocaleDateString()} - {entry.mealType}: {entry.foodName}
                      </span>
                      <span className="font-medium">
                        {entry.calories} kcal
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