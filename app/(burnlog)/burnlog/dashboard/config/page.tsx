/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, GlassWater, Flame, Utensils } from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppConfigShell } from '@/components/AppConfigShell';
import { BottomNav } from '@/components/BottomNav';
import { useToast } from '@/components/ui/use-toast';
import { MEAL_PREP_REMINDER_TITLE } from '@/lib/ai/types';
import { getAge } from '@/lib/age';

export default function BurnLogConfigPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id,dateOfBirth,weight,height,activityLevel,aiEnabled,currentStreak,longestStreak,xp,level,waterUnit,glassSizeMl,waterGoalMl,mealPrepDayOfWeek,mealPrepTime,mealPrepTimezone')
        .eq('userId', session.user.id)
        .single();
      setProfile(data ?? null);
      setLoading(false);
    })();
  }, [supabase, router]);

  const handleHealthMetricChange = async (field: 'height' | 'weight', value: number) => {
    if (!profile) return;
    const min = field === 'height' ? 50 : 20;
    const max = field === 'height' ? 250 : 400;
    const safeValue = Math.min(max, Math.max(min, value));
    const { error } = await supabase.from('profiles').update({ [field]: safeValue }).eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, [field]: safeValue }));
    } else {
      toast({ title: 'Could not save health metric', description: error.message, variant: 'destructive' });
    }
  };

  const handleDateOfBirthChange = async (value: string) => {
    if (!profile || !value) return;
    const { error } = await supabase.from('profiles').update({ dateOfBirth: value }).eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, dateOfBirth: value }));
    } else {
      toast({ title: 'Could not save date of birth', description: error.message, variant: 'destructive' });
    }
  };

  const handleWaterSettingChange = async (field: 'waterUnit' | 'glassSizeMl' | 'waterGoalMl', value: string | number) => {
    if (!profile) return;
    const safeValue =
      field === 'glassSizeMl' ? Math.max(50, Number(value)) :
      field === 'waterGoalMl' ? Math.max(250, Number(value)) :
      value;
    const { error } = await supabase.from('profiles').update({ [field]: safeValue }).eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, [field]: safeValue }));
    } else {
      toast({ title: 'Could not save water setting', description: error.message, variant: 'destructive' });
    }
  };

  const handleMealPrepChange = async (dayOfWeek: number, time: string) => {
    if (!profile) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ mealPrepDayOfWeek: dayOfWeek, mealPrepTime: time, mealPrepTimezone: timezone })
        .eq('id', profile.id);
      if (profileError) throw profileError;

      await supabase.from('scheduled_reminders').delete().eq('profileId', profile.id).eq('title', MEAL_PREP_REMINDER_TITLE);
      const { error: reminderError } = await supabase.from('scheduled_reminders').insert({
        profileId: profile.id,
        title: MEAL_PREP_REMINDER_TITLE,
        message: "It's your meal-prep day — open the Meal Planner to plan this week.",
        url: '/burnlog/meal-planner',
        dayOfWeek,
        timeOfDay: time,
        timezone,
      });
      if (reminderError) throw reminderError;

      setProfile((prev: any) => ({ ...prev, mealPrepDayOfWeek: dayOfWeek, mealPrepTime: time, mealPrepTimezone: timezone }));
      toast({ description: 'Meal-prep reminder saved' });
    } catch (e: any) {
      toast({ title: 'Could not save meal-prep reminder', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  if (loading || !profile) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  const hasHealthMetrics = profile.weight != null && profile.height != null;
  const bmi = hasHealthMetrics
    ? +(profile.weight / ((profile.height / 100) * (profile.height / 100))).toFixed(1)
    : null;
  const bmiCategory = bmi == null ? null : bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const bmr = hasHealthMetrics
    ? Math.round(10 * profile.weight + 6.25 * profile.height - 5 * getAge(profile.dateOfBirth) + 5)
    : null;

  return (
    <AppConfigShell
      appName="BurnLog"
      onboardingHref="/burnlog/ai-setup?returnTo=/burnlog/dashboard/config"
      exportData={() => ({
        activityLevel: profile.activityLevel,
        aiEnabled: profile.aiEnabled,
        waterUnit: profile.waterUnit,
        glassSizeMl: profile.glassSizeMl,
        waterGoalMl: profile.waterGoalMl,
        mealPrepDayOfWeek: profile.mealPrepDayOfWeek,
        mealPrepTime: profile.mealPrepTime,
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        xp: profile.xp,
        level: profile.level,
      })}
      bottomNav={<BottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>Health Metrics</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="dob" className="text-xs font-normal text-muted-foreground">Date of birth</Label>
              <input
                id="dob" type="date" defaultValue={profile.dateOfBirth?.slice(0, 10)}
                onBlur={(e) => handleDateOfBirthChange(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1 text-right mt-1"
              />
            </div>
            <div>
              <Label htmlFor="height" className="text-xs font-normal text-muted-foreground">Height (cm)</Label>
              <input
                id="height" type="number" min={50} max={250} defaultValue={profile.height ?? ''}
                onBlur={(e) => handleHealthMetricChange('height', Number(e.target.value))}
                className="w-full rounded-md border bg-background px-2 py-1 text-right mt-1"
              />
            </div>
            <div>
              <Label htmlFor="weight" className="text-xs font-normal text-muted-foreground">Weight (kg)</Label>
              <input
                id="weight" type="number" min={20} max={400} defaultValue={profile.weight ?? ''}
                onBlur={(e) => handleHealthMetricChange('weight', Number(e.target.value))}
                className="w-full rounded-md border bg-background px-2 py-1 text-right mt-1"
              />
            </div>
          </div>
          {hasHealthMetrics ? (
            <Accordion type="single" collapsible>
              <AccordionItem value="bmi">
                <AccordionTrigger>BMI: {bmi} ({bmiCategory})</AccordionTrigger>
                <AccordionContent>
                  <p>Your BMI category is <strong>{bmiCategory}</strong>.</p>
                  <div className="h-2 bg-gray-200 rounded-full mt-2">
                    <div className="h-2 bg-info rounded-full" style={{ width: `${(bmi! / 40) * 100}%` }} />
                  </div>
                  <p className="text-sm mt-1">Underweight &lt;18.5 | Normal 18.5–24.9 | Overweight 25–29.9 | Obese 30+</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="bmr">
                <AccordionTrigger>BMR: {bmr} kcal/day</AccordionTrigger>
                <AccordionContent>
                  <p>Your Basal Metabolic Rate: <strong>{bmr}</strong> kcal/day.</p>
                  <div className="h-2 bg-gray-200 rounded-full mt-2">
                    <div className="h-2 bg-success rounded-full" style={{ width: `${Math.min(bmr! / 3000, 1) * 100}%` }} />
                  </div>
                  <p className="text-sm mt-1">Avg male 1600–2400 | Avg female 1400–2000 kcal/day</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            <p className="text-sm text-muted-foreground">
              Fill in your height and weight above to see your BMI and BMR.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-primary" />
            Level {profile.level}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{profile.xp} xp</span>
              <span>{100 - (profile.xp % 100)} xp to next level</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full">
              <div className="h-2 bg-primary rounded-full" style={{ width: `${profile.xp % 100}%` }} />
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span>Current streak: <strong>{profile.currentStreak}</strong> day{profile.currentStreak === 1 ? '' : 's'}</span>
            <span>Longest: <strong>{profile.longestStreak}</strong> day{profile.longestStreak === 1 ? '' : 's'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GlassWater className="w-5 h-5 text-primary" />
            Water Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="waterUnit" className="font-medium">Unit</Label>
            <Select value={profile.waterUnit} onValueChange={(value) => handleWaterSettingChange('waterUnit', value)}>
              <SelectTrigger id="waterUnit" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="glasses">Glasses</SelectItem>
                <SelectItem value="liters">Liters</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="glassSizeMl" className="font-medium">Glass size (ml)</Label>
            <input
              id="glassSizeMl" type="number" min={50} max={1000} defaultValue={profile.glassSizeMl}
              onBlur={(e) => handleWaterSettingChange('glassSizeMl', Number(e.target.value))}
              className="w-24 rounded-md border bg-background px-2 py-1 text-right"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="waterGoalMl" className="font-medium">Daily goal (ml)</Label>
            <input
              id="waterGoalMl" type="number" min={500} max={10000} step={250} defaultValue={profile.waterGoalMl}
              onBlur={(e) => handleWaterSettingChange('waterGoalMl', Number(e.target.value))}
              className="w-24 rounded-md border bg-background px-2 py-1 text-right"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Utensils className="w-5 h-5" />Meal Planner</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium flex items-center gap-2"><Utensils className="w-4 h-4" />Meal-prep day</p>
            <div className="grid grid-cols-2 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, value) => (
                <button
                  key={label} type="button"
                  onClick={() => handleMealPrepChange(value, profile.mealPrepTime ?? '10:00')}
                  className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
                    profile.mealPrepDayOfWeek === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              type="time" defaultValue={profile.mealPrepTime ?? '10:00'}
              onBlur={(e) => handleMealPrepChange(profile.mealPrepDayOfWeek ?? 0, e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
