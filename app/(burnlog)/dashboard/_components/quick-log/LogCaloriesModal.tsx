'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { FoodScanner } from '@/app/(burnlog)/goals/_components/FoodScanner';

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
  const [tab, setTab] = useState<'manual' | 'describe' | 'photo'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [mealType, setMealType] = useState('lunch');
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [itemsNote, setItemsNote] = useState('');
  const [foodDescription, setFoodDescription] = useState('');
  const [estimating, setEstimating] = useState(false);
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
    setItemsNote('');
    if (result.mealType) setMealType(result.mealType);
    setShowScanner(false);
    setTab('manual');
  };

  const handleDescribeEstimate = async () => {
    setError(null);
    if (!foodDescription.trim()) {
      setError('Describe what you ate first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-food-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: foodDescription.trim(), mealType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to estimate calories. Enter manually.');
        return;
      }
      setFoodName(data.foodName);
      setCalories(String(data.calories));
      setProtein(String(data.protein));
      setCarbs(String(data.carbs));
      setFat(String(data.fat));
      const items = data.items as { name: string; calories: number }[] | undefined;
      setItemsNote(items?.length ? items.map((i) => `${i.name} (${i.calories} kcal)`).join(', ') : '');
      setTab('manual');
    } catch {
      setError('Network error. Enter calories manually.');
    } finally {
      setEstimating(false);
    }
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
          notes: itemsNote || null,
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
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Calories</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'describe' | 'photo')}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="describe">Describe (AI)</TabsTrigger>
              <TabsTrigger value="photo">Photo (AI)</TabsTrigger>
            </TabsList>
            <TabsContent value="describe" className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label htmlFor="foodDescription">What did you eat?</Label>
                <textarea
                  id="foodDescription"
                  value={foodDescription}
                  onChange={(e) => setFoodDescription(e.target.value)}
                  className="w-full p-2 border rounded-md h-20 text-sm"
                  placeholder="e.g. coffee, 2 pancakes, a banana"
                />
              </div>
              <Button className="w-full" onClick={handleDescribeEstimate} disabled={estimating}>
                {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Estimate with AI'}
              </Button>
              <p className="text-xs text-muted-foreground">
                List multiple items separated by commas or &quot;+&quot; — AI estimates calories and macros for each, then you can review and save below.
              </p>
            </TabsContent>
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
              {itemsNote && <p className="text-xs text-muted-foreground">Items: {itemsNote}</p>}
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
