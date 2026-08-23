// components/kokonutui/water-intake-tracker.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { GlassWater, Minus, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toLocalDateString } from '@/lib/date';

type WaterIntakeTrackerProps = {
  profileId: string;
  waterUnit: 'glasses' | 'liters';
  glassSizeMl: number;
  waterGoalMl: number;
};

const MAX_ML = 5000;
const STEP_ML = 250;
const MAX_ICONS = 8;

export function WaterIntakeTracker({ profileId, waterUnit, glassSizeMl, waterGoalMl }: WaterIntakeTrackerProps) {
  const supabase = createClientComponentClient();
  const prefersReducedMotion = useReducedMotion();
  const [amountMl, setAmountMl] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = toLocalDateString(new Date());
      const { data } = await supabase
        .from('water_entries')
        .select('amountMl')
        .eq('profileId', profileId)
        .eq('date', today)
        .maybeSingle();
      if (!cancelled) {
        setAmountMl(data?.amountMl ?? 0);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId]);

  const step = waterUnit === 'glasses' ? glassSizeMl : STEP_ML;

  const persist = async (next: number) => {
    const today = toLocalDateString(new Date());
    setAmountMl(next);
    await supabase
      .from('water_entries')
      .upsert({ profileId, date: today, amountMl: next }, { onConflict: 'profileId,date' });
  };

  const handleChange = (delta: number) => {
    const next = amountMl + delta;
    if (next < 0 || next > MAX_ML) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    persist(next);
  };

  const displayValue =
    waterUnit === 'liters' ? (amountMl / 1000).toFixed(2) : String(Math.round(amountMl / glassSizeMl));
  const unitLabel =
    waterUnit === 'liters' ? 'L' : Math.round(amountMl / glassSizeMl) === 1 ? 'glass' : 'glasses';
  const goalDisplay =
    waterUnit === 'liters' ? (waterGoalMl / 1000).toFixed(1) : String(Math.round(waterGoalMl / glassSizeMl));
  const filledIcons = Math.min(Math.round(amountMl / glassSizeMl), MAX_ICONS);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GlassWater className="size-4 text-primary" />
          Water Intake
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-1">
              {Array.from({ length: MAX_ICONS }).map((_, i) => (
                <GlassWater
                  key={i}
                  className={cn('size-4 transition-colors', i < filledIcons ? 'text-primary' : 'text-muted-foreground/25')}
                />
              ))}
            </div>

            <motion.div
              animate={shake && !prefersReducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-4"
            >
              <button
                type="button"
                onClick={() => handleChange(-step)}
                aria-label="Remove water"
                className="flex size-9 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted"
              >
                <Minus className="size-4" />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={displayValue}
                  initial={prefersReducedMotion ? undefined : { y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={prefersReducedMotion ? undefined : { y: -8, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-20 text-center"
                >
                  <div className="text-2xl font-bold">{displayValue}</div>
                  <div className="text-xs text-muted-foreground">{unitLabel}</div>
                </motion.div>
              </AnimatePresence>

              <button
                type="button"
                onClick={() => handleChange(step)}
                aria-label="Add water"
                className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" />
              </button>
            </motion.div>

            <p className="text-xs text-muted-foreground">
              Goal: {goalDisplay} {waterUnit === 'liters' ? 'L' : 'glasses'}/day
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
