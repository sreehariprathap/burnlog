'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FoodScanner } from '@/app/goals/_components/FoodScanner';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

type LogCaloriesModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogCaloriesModal({ profileId, onClose, onSaved }: LogCaloriesModalProps) {
  const supabase = createClientComponentClient();
  const [tab, setTab] = useState<'manual' | 'photo'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [mealType, setMealType] = useState('lunch');
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleScanResult = (result: {
    foodName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealType: string;
  }) => {
    setFoodName(result.foodName);
    setCalories(String(result.calories));
    setProtein(String(result.protein));
    setCarbs(String(result.carbs));
    setFat(String(result.fat));
    if (result.mealType) setMealType(result.mealType);
    setShowScanner(false);
    setTab('manual');
  };

  const handleSave = async () => {
    setError(null);
    if (!foodName.trim()) {
      setError('Please enter a food name');
      return;
    }
    if (!calories || isNaN(Number(calories))) {
      setError('Please enter valid calories');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('food_intakes').insert([
        {
          profileId,
          mealType,
          foodName,
          calories: Number(calories),
          protein: protein ? Number(protein) : null,
          carbs: carbs ? Number(carbs) : null,
          fat: fat ? Number(fat) : null,
        },
      ]);

      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  if (showScanner) {
    return <FoodScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Calories</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'photo')}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="photo">Photo (AI)</TabsTrigger>
            </TabsList>
            <TabsContent value="photo" className="pt-3">
              <Button className="w-full" onClick={() => setShowScanner(true)}>
                📸 Scan Food Photo
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Take or upload a photo — AI estimates calories and macros, then you can review and save below.
              </p>
            </TabsContent>
            <TabsContent value="manual" className="space-y-3 pt-3">
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
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="calories">Calories</Label>
                  <Input id="calories" type="number" placeholder="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="foodName">Food Name</Label>
                <Input id="foodName" placeholder="What did you eat?" value={foodName} onChange={(e) => setFoodName(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="protein">Protein (g)</Label>
                  <Input id="protein" type="number" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="carbs">Carbs (g)</Label>
                  <Input id="carbs" type="number" step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fat">Fat (g)</Label>
                  <Input id="fat" type="number" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
