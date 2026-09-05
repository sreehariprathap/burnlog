'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemedButton } from '@/components/ui/themed-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

const FoodScanner = dynamic(
  () => import('@/app/(burnlog)/burnlog/goals/_components/FoodScanner').then((mod) => mod.FoodScanner),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Loader2 className="size-6 animate-spin text-white" />
      </div>
    ),
  }
);

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

type FoodFavorite = {
  id: string;
  name: string;
  mealType: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  useCount: number;
};

export function LogCaloriesModal({ profileId, onClose, onSaved }: LogCaloriesModalProps) {
  const supabase = createClient();
  const { toast } = useToast();
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
  const [favorites, setFavorites] = useState<FoodFavorite[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('food_favorites')
        .select('id,name,mealType,calories,protein,carbs,fat,useCount')
        .eq('profileId', profileId)
        .order('useCount', { ascending: false })
        .order('lastUsedAt', { ascending: false })
        .limit(8);
      setFavorites(data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const handleUseFavorite = (favorite: FoodFavorite) => {
    setFoodName(favorite.name);
    setCalories(String(favorite.calories));
    setProtein(favorite.protein != null ? String(favorite.protein) : '');
    setCarbs(favorite.carbs != null ? String(favorite.carbs) : '');
    setFat(favorite.fat != null ? String(favorite.fat) : '');
    setItemsNote('');
    if (favorite.mealType) setMealType(favorite.mealType);
    setTab('manual');
  };

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

      const trimmedName = foodName.trim();
      const { data: existingFavorite } = await supabase
        .from('food_favorites')
        .select('id,useCount')
        .eq('profileId', profileId)
        .eq('name', trimmedName)
        .maybeSingle();
      const favoritePayload = {
        mealType,
        calories: Number(calories),
        protein: protein ? Number(protein) : null,
        carbs: carbs ? Number(carbs) : null,
        fat: fat ? Number(fat) : null,
        lastUsedAt: new Date().toISOString(),
      };
      if (existingFavorite) {
        await supabase
          .from('food_favorites')
          .update({ ...favoritePayload, useCount: existingFavorite.useCount + 1 })
          .eq('id', existingFavorite.id);
      } else {
        await supabase.from('food_favorites').insert([{ profileId, name: trimmedName, ...favoritePayload }]);
      }

      toast({ title: 'Calories logged', description: `${foodName} — ${calories} kcal saved.` });
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save entry';
      setError(message);
      toast({ title: 'Failed to save entry', description: message, variant: 'destructive' });
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
          {favorites.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Quick add</Label>
              <div className="flex flex-wrap gap-2">
                {favorites.map((favorite) => (
                  <button
                    key={favorite.id}
                    type="button"
                    onClick={() => handleUseFavorite(favorite)}
                    className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
                  >
                    {favorite.name} · {favorite.calories} kcal
                  </button>
                ))}
              </div>
            </div>
          )}
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
                <Camera className="w-4 h-4 mr-2" />Scan Food Photo
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
                  <Input id="calories" type="number" inputMode="numeric" placeholder="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="foodName">Food Name</Label>
                <Input id="foodName" autoComplete="off" placeholder="What did you eat?" value={foodName} onChange={(e) => setFoodName(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="protein">Protein (g)</Label>
                  <Input id="protein" type="number" inputMode="decimal" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="carbs">Carbs (g)</Label>
                  <Input id="carbs" type="number" inputMode="decimal" step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fat">Fat (g)</Label>
                  <Input id="fat" type="number" inputMode="decimal" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} />
                </div>
              </div>
              {itemsNote && <p className="text-xs text-muted-foreground">Items: {itemsNote}</p>}
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <ThemedButton slot="primary-cta" onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save'}
          </ThemedButton>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
