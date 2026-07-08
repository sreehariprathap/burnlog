'use client';

import { useState, useRef } from 'react';
import { Camera, Upload, Loader2, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ScanResult = {
  foodName: string;
  servingDescription: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  mealType: string;
};

type FoodScannerProps = {
  onResult: (result: ScanResult) => void;
  onClose: () => void;
};

const MEAL_TYPES = [
  { value: 'breakfast', label: '🌅 Breakfast' },
  { value: 'lunch', label: '☀️ Lunch' },
  { value: 'dinner', label: '🌙 Dinner' },
  { value: 'snack', label: '🍎 Snack' },
];

const CONFIDENCE_COLORS = {
  high: 'text-green-600 dark:text-green-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-red-600 dark:text-red-400',
};

export function FoodScanner({ onResult, onClose }: FoodScannerProps) {
  const [mealType, setMealType] = useState('lunch');
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!preview) return;
    setScanning(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/scan-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: preview, mealType }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to analyse image. Try again.');
        setScanning(false);
        return;
      }

      setResult(data as ScanResult);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleLog = () => {
    if (result) onResult(result);
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">📸 Scan Food</h2>
              <p className="text-xs text-muted-foreground">AI analyses your meal and estimates calories & macros</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Meal type selector */}
          <div className="space-y-1">
            <Label>Meal type</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Image preview or upload buttons */}
          {!preview ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Camera capture — opens camera directly on mobile */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Camera className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Take Photo</span>
              </button>

              {/* Gallery upload */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Upload Photo</span>
              </button>

              {/* Hidden inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Food preview" className="w-full h-48 object-cover rounded-xl" />
              <button
                onClick={reset}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Scan button */}
          {preview && !result && (
            <Button onClick={handleScan} disabled={scanning} className="w-full">
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analysing your meal…
                </>
              ) : (
                '🔍 Analyse Food'
              )}
            </Button>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-semibold">{result.foodName}</span>
              </div>

              {result.servingDescription && (
                <p className="text-xs text-muted-foreground">Serving: {result.servingDescription}</p>
              )}

              {/* Macro grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Calories', value: result.calories, unit: 'kcal', color: 'bg-orange-50 dark:bg-orange-950/30' },
                  { label: 'Protein', value: result.protein, unit: 'g', color: 'bg-blue-50 dark:bg-blue-950/30' },
                  { label: 'Carbs', value: result.carbs, unit: 'g', color: 'bg-green-50 dark:bg-green-950/30' },
                  { label: 'Fat', value: result.fat, unit: 'g', color: 'bg-red-50 dark:bg-red-950/30' },
                ].map((m) => (
                  <div key={m.label} className={`rounded-lg p-2 ${m.color}`}>
                    <p className="text-base font-bold">{m.value}</p>
                    <p className="text-[10px] text-muted-foreground">{m.unit}</p>
                    <p className="text-[10px] font-medium">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Confidence */}
              <p className={`text-xs ${CONFIDENCE_COLORS[result.confidence]}`}>
                Confidence: {result.confidence}
                {result.notes ? ` · ${result.notes}` : ''}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={reset} className="w-full">
                  Re-scan
                </Button>
                <Button onClick={handleLog} className="w-full">
                  Log This Meal ✅
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
