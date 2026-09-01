# Identity Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profile (identity) lives only in Logbook; every sub-app's nav gets a Config (gear) tab leading to that app's own settings, with shared Reonboard + Export-JSON actions.

**Architecture:** Pure frontend restructuring of `app/profile/page.tsx` and 5 near-duplicate `XxxProfileMenu` nav components. A new shared `ConfigMenu` (dropdown, gear icon) replaces per-app profile menus in every sub-app's bottom nav. A new shared `AppConfigShell` wraps each app's settings page, adding a Reonboard button (only when the app has an onboarding route) and an Export-as-JSON button (client-side `Blob` download, no new API). BurnLog's app-specific settings (health metrics, XP/streak, AI insights, water, meal-prep) move from `/profile` into a new `/dashboard/config` page; SocialLog's existing settings card moves into `/sociallog/config`. MoneyLog/TaskLog/HomeLog/ShoppingLog get config-page shells (no bespoke settings exist yet).

**Tech Stack:** Next.js App Router (client components, `'use client'`), Supabase JS client (`createClientComponentClient`), shadcn/ui components (Card, Drawer, Switch, Select, Accordion, DropdownMenu), lucide-react icons, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-identity-consolidation-design.md`

## Global Constraints

- No route rename for `/profile` — it keeps its current URL.
- No database schema/migration changes in this plan — reuse existing `profiles` table columns and existing API routes as-is.
- No new backend API routes — Export-as-JSON is client-side serialization of already-loaded state.
- Each sub-app's existing Supabase queries / `apiFetch` calls must be moved verbatim (same table, same columns, same error handling) — only their host component changes.
- Config routes per app, exactly: BurnLog `/dashboard/config`, MoneyLog `/moneylog/config`, TaskLog `/tasklog/config`, HomeLog `/homelog/config`, SocialLog `/sociallog/config`, ShoppingLog `/shoppinglog/config`.
- Reonboard button appears only for BurnLog (→ `/ai-setup?returnTo=/dashboard/config`) and MoneyLog (→ `/moneylog/onboarding`); omitted entirely (not disabled) for TaskLog/HomeLog/SocialLog/ShoppingLog.

---

### Task 1: `ConfigMenu` shared nav component

**Files:**
- Create: `components/ConfigMenu.tsx`
- Reference (pattern source, do not modify yet): `components/MoneyLogProfileMenu.tsx`

**Interfaces:**
- Produces: `ConfigMenu({ href, isActive, navId }: { href: string; isActive: boolean; navId: string })` — a dropdown-trigger button (gear icon, "Config" label) that opens a dropdown with a "Config" item (navigates to `href`) and a "Log Out" item (calls `supabase.auth.signOut()` then `router.push('/login')`). `navId` is used as the Framer Motion `layoutId` for the active-pill animation (must be unique per nav bar, e.g. `"moneylog-bottom-nav-active"`) so it doesn't collide with the other tab pills already using that same id in each nav bar.

- [ ] **Step 1: Write `ConfigMenu.tsx`**

```tsx
// components/ConfigMenu.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { motion } from 'motion/react';
import { Settings, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type ConfigMenuProps = {
  href: string;
  isActive: boolean;
  navId: string;
};

export function ConfigMenu({ href, isActive, navId }: ConfigMenuProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {isActive && (
            <motion.span
              layoutId={navId}
              className="absolute inset-0 rounded-full bg-primary/10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Settings className="relative z-10 mb-0.5 h-5 w-5" />
          <span className="relative z-10">Config</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center">
        <DropdownMenuItem onClick={() => router.push(href)}>
          <Settings className="size-4" />
          Config
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors referencing `components/ConfigMenu.tsx` (this file has no consumers yet, so it must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add components/ConfigMenu.tsx
git commit -m "feat: add shared ConfigMenu nav component"
```

---

### Task 2: `AppConfigShell` shared page wrapper

**Files:**
- Create: `components/AppConfigShell.tsx`

**Interfaces:**
- Consumes: `TopBar` from `@/components/TopBar` (props: `{ title: string }`, already exists).
- Produces: `AppConfigShell({ appName, onboardingHref, exportData, children, bottomNav }: AppConfigShellProps)` where:
  ```ts
  type AppConfigShellProps = {
    appName: string;
    onboardingHref?: string;
    exportData: () => Record<string, unknown>;
    children: React.ReactNode;
    bottomNav: React.ReactNode;
  };
  ```
  Renders a `TopBar title={`${appName} Config`}`, then `children` inside a `container mx-auto p-4 pb-24` wrapper, then a fixed action row with "Reonboard" (only if `onboardingHref` is set, uses `next/link` to navigate) and "Export config as JSON" buttons, then `bottomNav`.

- [ ] **Step 1: Write `AppConfigShell.tsx`**

```tsx
// components/AppConfigShell.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TopBar } from '@/components/TopBar';
import { Download, RotateCcw } from 'lucide-react';

type AppConfigShellProps = {
  appName: string;
  onboardingHref?: string;
  exportData: () => Record<string, unknown>;
  children: React.ReactNode;
  bottomNav: React.ReactNode;
};

export function AppConfigShell({
  appName,
  onboardingHref,
  exportData,
  children,
  bottomNav,
}: AppConfigShellProps) {
  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName.toLowerCase()}-config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={`${appName} Config`} />
      <main className="flex-1 container mx-auto p-4 pb-24 space-y-6">
        {children}
        <div className="flex flex-col gap-3 pt-4 border-t">
          {onboardingHref && (
            <Button variant="outline" asChild>
              <Link href={onboardingHref}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reonboard into {appName}
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export config as JSON
          </Button>
        </div>
      </main>
      {bottomNav}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors referencing `components/AppConfigShell.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/AppConfigShell.tsx
git commit -m "feat: add shared AppConfigShell page wrapper"
```

---

### Task 3: BurnLog config page + nav swap

**Files:**
- Create: `app/(burnlog)/dashboard/config/page.tsx`
- Modify: `app/profile/page.tsx` (remove BurnLog-specific sections + their state/handlers)
- Modify: `components/BottomNav.tsx` (swap `ProfileMenu` → `ConfigMenu`)
- Delete: none (BurnLog reuses shared `ProfileMenu` which Logbook still needs — do not delete `components/ProfileMenu.tsx`)

**Interfaces:**
- Consumes: `ConfigMenu` from Task 1, `AppConfigShell` from Task 2, `OnboardingPageTogglesModal`/`AiModelSettingsModal` stay imported by `app/profile/page.tsx` only (they move to Logbook's admin section in Task 8, not here).
- Produces: `/dashboard/config` route rendering BurnLog's Health Metrics, Level/XP/streak, AI Insights toggle, Water Tracking, and Meal Planner cards — same markup/handlers as the current `activeApp === 'burnlog'` blocks in `app/profile/page.tsx`, fetching the same `profiles` columns.

- [ ] **Step 1: Create `app/(burnlog)/dashboard/config/page.tsx`**

Move the BurnLog-specific state, effects, and handlers out of `app/profile/page.tsx` verbatim: `profile` fetch (same `.select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level,waterUnit,glassSizeMl,waterGoalMl,mealPrepDayOfWeek,mealPrepTime,mealPrepTimezone')` — drop `avatarUrl` and `username`, those stay identity-only in `/profile`), `handleDisableAi`, `handleWaterSettingChange`, `handleMealPrepChange`, and the four Card blocks (Health Metrics, Level, AI Insights, Water Tracking, Meal Planner). Wrap them in `AppConfigShell`:

```tsx
// app/(burnlog)/dashboard/config/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, GlassWater, Flame } from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppConfigShell } from '@/components/AppConfigShell';
import { BottomNav } from '@/components/BottomNav';
import { useToast } from '@/components/ui/use-toast';

export default function BurnLogConfigPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { toast } = useToast();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disablingAi, setDisablingAi] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id,age,weight,height,activityLevel,aiEnabled,currentStreak,longestStreak,xp,level,waterUnit,glassSizeMl,waterGoalMl,mealPrepDayOfWeek,mealPrepTime,mealPrepTimezone')
        .eq('userId', session.user.id)
        .single();
      setProfile(data ?? null);
      setLoading(false);
    })();
  }, [supabase, router]);

  const handleDisableAi = async () => {
    setDisablingAi(true);
    const { error } = await supabase.from('profiles').update({ aiEnabled: false }).eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, aiEnabled: false }));
      toast({ description: 'AI insights disabled' });
    } else {
      toast({ title: 'Could not disable AI insights', description: error.message, variant: 'destructive' });
    }
    setDisablingAi(false);
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

      const { MEAL_PREP_REMINDER_TITLE } = await import('@/lib/ai/types');
      await supabase.from('scheduled_reminders').delete().eq('profileId', profile.id).eq('title', MEAL_PREP_REMINDER_TITLE);
      const { error: reminderError } = await supabase.from('scheduled_reminders').insert({
        profileId: profile.id,
        title: MEAL_PREP_REMINDER_TITLE,
        message: "It's your meal-prep day — open the Meal Planner to plan this week.",
        url: '/meal-planner',
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

  const bmi = +(profile.weight / ((profile.height / 100) * (profile.height / 100))).toFixed(1);
  const bmiCategory = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const bmr = Math.round(10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5);

  return (
    <AppConfigShell
      appName="BurnLog"
      onboardingHref="/ai-setup?returnTo=/dashboard/config"
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
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="bmi">
              <AccordionTrigger>BMI: {bmi} ({bmiCategory})</AccordionTrigger>
              <AccordionContent>
                <p>Your BMI category is <strong>{bmiCategory}</strong>.</p>
                <div className="h-2 bg-gray-200 rounded-full mt-2">
                  <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${(bmi / 40) * 100}%` }} />
                </div>
                <p className="text-sm mt-1">Underweight &lt;18.5 | Normal 18.5–24.9 | Overweight 25–29.9 | Obese 30+</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="bmr">
              <AccordionTrigger>BMR: {bmr} kcal/day</AccordionTrigger>
              <AccordionContent>
                <p>Your Basal Metabolic Rate: <strong>{bmr}</strong> kcal/day.</p>
                <div className="h-2 bg-gray-200 rounded-full mt-2">
                  <div className="h-2 bg-green-500 rounded-full" style={{ width: `${Math.min(bmr / 3000, 1) * 100}%` }} />
                </div>
                <p className="text-sm mt-1">Avg male 1600–2400 | Avg female 1400–2000 kcal/day</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
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
              <div className="h-2 bg-orange-500 rounded-full" style={{ width: `${profile.xp % 100}%` }} />
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
            <Sparkles className="w-5 h-5 text-amber-500" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {profile.aiEnabled
              ? 'AI-powered suggestions are enabled for your account.'
              : 'Enable AI to get a personalized workout plan based on your lifestyle.'}
          </p>
          {profile.aiEnabled ? (
            <Button variant="outline" onClick={handleDisableAi} disabled={disablingAi}>
              {disablingAi ? 'Disabling...' : 'Disable AI Insights'}
            </Button>
          ) : (
            <Button onClick={() => router.push('/ai-setup?returnTo=/dashboard/config')}>
              Enable AI Insights
            </Button>
          )}
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
        <CardHeader><CardTitle className="flex items-center gap-2">🍽️ Meal Planner</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">🍽️ Meal-prep day</p>
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
```

- [ ] **Step 2: Swap `ProfileMenu` for `ConfigMenu` in `components/BottomNav.tsx`**

Replace line 15 import and line 57 usage:

```tsx
import { ConfigMenu } from '@/components/ConfigMenu';
```

```tsx
      <ConfigMenu href="/dashboard/config" isActive={isProfileActive} navId="bottom-nav-active" />
```

(Rename the local variable `isProfileActive` to `isConfigActive` and update its check to `pathname === '/dashboard/config' || pathname.startsWith('/dashboard/config/')` for correctness — do this rename in this same step.)

- [ ] **Step 3: Remove BurnLog-specific sections from `app/profile/page.tsx`**

Delete the four `{activeApp === 'burnlog' && (...)}` blocks for Health Metrics, Level, AI Insights, Water Tracking, and Meal Planner (lines ~411–456 and ~459–608 in the original file), and their associated state (`disablingAi`, water/meal-prep handlers) and unused imports (`Flame`, `GlassWater`, `Accordion*`, `Select*` if no longer used elsewhere on the page, `Sparkles` if AI Insights card is fully removed, `MEAL_PREP_REMINDER_TITLE`). Leave the admin-gated blocks (Test Push, Onboarding Page Toggles, AI Model Settings) in place for now — Task 8 relocates those.

- [ ] **Step 4: Verify — run dev server and click through manually**

Run: `npm run dev` (background), then in a browser: log in, visit `/dashboard`, click the new gear/Config tab → should land on `/dashboard/config` showing Health Metrics/Level/AI Insights/Water/Meal Planner cards with the same values previously seen on `/profile`. Toggle a water setting and confirm it persists on reload. Click "Reonboard into BurnLog" → lands on `/ai-setup`. Click "Export config as JSON" → a `burnlog-config.json` file downloads with the expected fields.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors (pre-existing warnings in `app/(burnlog)/goals/page.tsx` and `IdeaBreakdownReviewSheet.tsx` are fine, unrelated).

- [ ] **Step 6: Commit**

```bash
git add app/(burnlog)/dashboard/config/page.tsx app/profile/page.tsx components/BottomNav.tsx
git commit -m "feat(burnlog): move app-specific settings to /dashboard/config"
```

---

### Task 4: MoneyLog config page + nav swap

**Files:**
- Create: `app/(moneylog)/moneylog/config/page.tsx`
- Modify: `components/MoneyLogBottomNav.tsx`
- Delete: `components/MoneyLogProfileMenu.tsx`

**Interfaces:**
- Consumes: `ConfigMenu` (Task 1), `AppConfigShell` (Task 2).
- Produces: `/moneylog/config` route — shell only, no bespoke settings today, with Reonboard wired to `/moneylog/onboarding` and Export returning `{}` (nothing to export yet — documented as a placeholder object, not a stub feature).

- [ ] **Step 1: Create `app/(moneylog)/moneylog/config/page.tsx`**

```tsx
// app/(moneylog)/moneylog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';

export default function MoneyLogConfigPage() {
  return (
    <AppConfigShell
      appName="MoneyLog"
      onboardingHref="/moneylog/onboarding"
      exportData={() => ({})}
      bottomNav={<MoneyLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>MoneyLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No MoneyLog-specific settings yet. Use Reonboard to redo your budget setup.
          </p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
```

- [ ] **Step 2: Delete `components/MoneyLogProfileMenu.tsx`**

Run: `git rm components/MoneyLogProfileMenu.tsx`

- [ ] **Step 3: Swap `MoneyLogProfileMenu` for `ConfigMenu` in `components/MoneyLogBottomNav.tsx`**

Replace line 9 import and line 47 usage:

```tsx
import { ConfigMenu } from '@/components/ConfigMenu';
```

```tsx
      <ConfigMenu href="/moneylog/config" isActive={isProfileActive} navId="moneylog-bottom-nav-active" />
```

Rename `isProfileActive` → `isConfigActive`, update its check to `pathname === '/moneylog/config' || pathname.startsWith('/moneylog/config/')`.

- [ ] **Step 4: Verify — manual click-through**

Run: `npm run dev`, visit `/moneylog`, click Config tab → lands on `/moneylog/config`. Click "Reonboard into MoneyLog" → lands on `/moneylog/onboarding`. Click "Export config as JSON" → downloads `moneylog-config.json` containing `{}`.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors, and no remaining references to `MoneyLogProfileMenu` anywhere (`grep -rn "MoneyLogProfileMenu" --include="*.tsx" .` returns nothing).

- [ ] **Step 6: Commit**

```bash
git add app/\(moneylog\)/moneylog/config/page.tsx components/MoneyLogBottomNav.tsx
git commit -m "feat(moneylog): add /moneylog/config, replace profile menu with ConfigMenu"
```

---

### Task 5: TaskLog config page + nav swap

**Files:**
- Create: `app/(tasklog)/tasklog/config/page.tsx`
- Modify: `components/TaskLogBottomNav.tsx`
- Delete: `components/TaskLogProfileMenu.tsx`

**Interfaces:**
- Consumes: `ConfigMenu` (Task 1), `AppConfigShell` (Task 2).
- Produces: `/tasklog/config` — shell only, no `onboardingHref` (TaskLog has no onboarding flow), `exportData` returns `{}`.

- [ ] **Step 1: Create `app/(tasklog)/tasklog/config/page.tsx`**

```tsx
// app/(tasklog)/tasklog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';

export default function TaskLogConfigPage() {
  return (
    <AppConfigShell
      appName="TaskLog"
      exportData={() => ({})}
      bottomNav={<TaskLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>TaskLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No TaskLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
```

- [ ] **Step 2: Delete `components/TaskLogProfileMenu.tsx`**

Run: `git rm components/TaskLogProfileMenu.tsx`

- [ ] **Step 3: Swap in `components/TaskLogBottomNav.tsx`**

Replace line 10 import and line 56 usage:

```tsx
import { ConfigMenu } from '@/components/ConfigMenu';
```

```tsx
      <ConfigMenu href="/tasklog/config" isActive={isProfileActive} navId="tasklog-bottom-nav-active" />
```

Rename `isProfileActive` → `isConfigActive`, update its check to `pathname === '/tasklog/config' || pathname.startsWith('/tasklog/config/')`.

- [ ] **Step 4: Verify — manual click-through**

Run: `npm run dev`, visit `/tasklog`, click Config tab → lands on `/tasklog/config`, no Reonboard button shown, Export downloads `tasklog-config.json` containing `{}`.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors; `grep -rn "TaskLogProfileMenu" --include="*.tsx" .` returns nothing.

- [ ] **Step 6: Commit**

```bash
git add app/\(tasklog\)/tasklog/config/page.tsx components/TaskLogBottomNav.tsx
git commit -m "feat(tasklog): add /tasklog/config, replace profile menu with ConfigMenu"
```

---

### Task 6: HomeLog config page + nav swap

**Files:**
- Create: `app/(homelog)/homelog/config/page.tsx`
- Modify: `components/HomeLogBottomNav.tsx`
- Delete: `components/HomeLogProfileMenu.tsx`

**Interfaces:**
- Consumes: `ConfigMenu` (Task 1), `AppConfigShell` (Task 2).
- Produces: `/homelog/config` — shell only, no `onboardingHref`, `exportData` returns `{}`.

- [ ] **Step 1: Create `app/(homelog)/homelog/config/page.tsx`**

```tsx
// app/(homelog)/homelog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';

export default function HomeLogConfigPage() {
  return (
    <AppConfigShell
      appName="HomeLog"
      exportData={() => ({})}
      bottomNav={<HomeLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>HomeLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No HomeLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
```

- [ ] **Step 2: Delete `components/HomeLogProfileMenu.tsx`**

Run: `git rm components/HomeLogProfileMenu.tsx`

- [ ] **Step 3: Swap in `components/HomeLogBottomNav.tsx`**

Replace line 9 import and line 47 usage:

```tsx
import { ConfigMenu } from '@/components/ConfigMenu';
```

```tsx
      <ConfigMenu href="/homelog/config" isActive={isProfileActive} navId="homelog-bottom-nav-active" />
```

Rename `isProfileActive` → `isConfigActive`, update its check to `pathname === '/homelog/config' || pathname.startsWith('/homelog/config/')`.

- [ ] **Step 4: Verify — manual click-through**

Run: `npm run dev`, visit `/homelog`, click Config tab → lands on `/homelog/config`, no Reonboard button, Export downloads `homelog-config.json` containing `{}`.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors; `grep -rn "HomeLogProfileMenu" --include="*.tsx" .` returns nothing.

- [ ] **Step 6: Commit**

```bash
git add app/\(homelog\)/homelog/config/page.tsx components/HomeLogBottomNav.tsx
git commit -m "feat(homelog): add /homelog/config, replace profile menu with ConfigMenu"
```

---

### Task 7: SocialLog config page + nav swap

**Files:**
- Create: `app/(sociallog)/sociallog/config/page.tsx`
- Move: `app/profile/_components/SocialLogSettingsCard.tsx` → `app/(sociallog)/sociallog/config/_components/SocialLogSettingsCard.tsx`
- Modify: `app/profile/page.tsx` (remove `SocialLogSettingsCard` import/usage)
- Modify: `components/SocialLogBottomNav.tsx`
- Delete: `components/SocialLogProfileMenu.tsx`

**Interfaces:**
- Consumes: `ConfigMenu` (Task 1), `AppConfigShell` (Task 2), moved `SocialLogSettingsCard` (unchanged component, same `/api/sociallog/profile-settings` GET/PATCH calls).
- Produces: `/sociallog/config` rendering `SocialLogSettingsCard`, with `exportData` returning the same shape as the API's settings object (`bio`, `isPrivate`, `whoCanMessage`, `showCrossAppActivity`) — since `SocialLogSettingsCard` owns its own fetch, lift that fetch into the page so both the card and `exportData` share the loaded state (pass `settings` down as a controlled prop, or simplest: keep the card self-contained and have `exportData` do its own `GET /api/sociallog/profile-settings` synchronously-resolved via a ref updated on load — see Step 1 for the exact approach chosen).

- [ ] **Step 1: Move `SocialLogSettingsCard.tsx` and create the config page**

Move the file:

```bash
mkdir -p "app/(sociallog)/sociallog/config/_components"
git mv app/profile/_components/SocialLogSettingsCard.tsx "app/(sociallog)/sociallog/config/_components/SocialLogSettingsCard.tsx"
```

To let `AppConfigShell`'s `exportData` read the card's loaded settings without duplicating the fetch, add a `onSettingsLoaded?: (settings: Settings) => void` prop to `SocialLogSettingsCard` (called once inside its existing load effect, right after `setSettings(data)`) and to its `patch` success branch (so exports stay fresh after edits). Then:

```tsx
// app/(sociallog)/sociallog/config/page.tsx
'use client';

import { useState } from 'react';
import { AppConfigShell } from '@/components/AppConfigShell';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { SocialLogSettingsCard } from './_components/SocialLogSettingsCard';

export default function SocialLogConfigPage() {
  const [exportSnapshot, setExportSnapshot] = useState<Record<string, unknown>>({});

  return (
    <AppConfigShell
      appName="SocialLog"
      exportData={() => exportSnapshot}
      bottomNav={<SocialLogBottomNav />}
    >
      <SocialLogSettingsCard onSettingsLoaded={setExportSnapshot} />
    </AppConfigShell>
  );
}
```

Add the prop to `SocialLogSettingsCard`:

```tsx
type SocialLogSettingsCardProps = {
  onSettingsLoaded?: (settings: Settings) => void;
};

export function SocialLogSettingsCard({ onSettingsLoaded }: SocialLogSettingsCardProps) {
```

In the load effect, after `setSettings(data)`:

```tsx
        setSettings(data);
        setBioInput(data.bio ?? '');
        onSettingsLoaded?.(data);
```

In `patch`'s success branch, after `setSettings(data)`:

```tsx
    if (res.ok) {
      const data: Settings = await res.json();
      setSettings(data);
      onSettingsLoaded?.(data);
    }
```

- [ ] **Step 2: Remove `SocialLogSettingsCard` from `app/profile/page.tsx`**

Delete the import (`import { SocialLogSettingsCard } from './_components/SocialLogSettingsCard';`) and the `{activeApp === 'sociallog' && (...)}` block that renders it.

- [ ] **Step 3: Delete `components/SocialLogProfileMenu.tsx`**

Run: `git rm components/SocialLogProfileMenu.tsx`

- [ ] **Step 4: Swap in `components/SocialLogBottomNav.tsx`**

Replace line 9 import and line 46 usage:

```tsx
import { ConfigMenu } from '@/components/ConfigMenu';
```

```tsx
      <ConfigMenu href="/sociallog/config" isActive={isProfileActive} navId="sociallog-bottom-nav-active" />
```

Rename `isProfileActive` → `isConfigActive`, update its check to `pathname === '/sociallog/config' || pathname.startsWith('/sociallog/config/')`.

- [ ] **Step 5: Verify — manual click-through**

Run: `npm run dev`, visit `/sociallog`, click Config tab → lands on `/sociallog/config` showing the same Bio/Private/Who-can-message/Cross-app-activity card that used to show on `/profile`. Edit the bio, confirm it saves (same PATCH call). Click Export → downloads `sociallog-config.json` with the current settings values (not `{}`).

- [ ] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors; `grep -rn "SocialLogProfileMenu" --include="*.tsx" .` and `grep -rn "profile/_components/SocialLogSettingsCard" --include="*.tsx" .` both return nothing.

- [ ] **Step 7: Commit**

```bash
git add -A -- "app/(sociallog)/sociallog/config" app/profile/page.tsx components/SocialLogBottomNav.tsx
git commit -m "feat(sociallog): move settings to /sociallog/config, replace profile menu with ConfigMenu"
```

---

### Task 8: ShoppingLog config page + nav swap, and final Logbook Profile cleanup

**Files:**
- Create: `app/(shoppinglog)/shoppinglog/config/page.tsx`
- Modify: `components/ShoppingLogBottomNav.tsx`
- Delete: `components/ShoppingLogProfileMenu.tsx`
- Modify: `app/profile/page.tsx` (final identity-only pass — confirm no app-specific content remains, admin tools stay)

**Interfaces:**
- Consumes: `ConfigMenu` (Task 1), `AppConfigShell` (Task 2).
- Produces: `/shoppinglog/config` — shell only, no `onboardingHref`, `exportData` returns `{}`. `app/profile/page.tsx` ends this task containing only: avatar/name/username card, email, App (default-app selector) card, admin-only Test Push / Onboarding Page Toggles / AI Model Settings cards, and Logout — no `activeApp === 'burnlog'` or `activeApp === 'sociallog'` branches remain.

- [ ] **Step 1: Create `app/(shoppinglog)/shoppinglog/config/page.tsx`**

```tsx
// app/(shoppinglog)/shoppinglog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';

export default function ShoppingLogConfigPage() {
  return (
    <AppConfigShell
      appName="ShoppingLog"
      exportData={() => ({})}
      bottomNav={<ShoppingLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>ShoppingLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No ShoppingLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
```

- [ ] **Step 2: Delete `components/ShoppingLogProfileMenu.tsx`**

Run: `git rm components/ShoppingLogProfileMenu.tsx`

- [ ] **Step 3: Swap in `components/ShoppingLogBottomNav.tsx`**

Replace line 9 import and line 46 usage:

```tsx
import { ConfigMenu } from '@/components/ConfigMenu';
```

```tsx
      <ConfigMenu href="/shoppinglog/config" isActive={isProfileActive} navId="shoppinglog-bottom-nav-active" />
```

Rename `isProfileActive` → `isConfigActive`, update its check to `pathname === '/shoppinglog/config' || pathname.startsWith('/shoppinglog/config/')`.

- [ ] **Step 4: Final pass on `app/profile/page.tsx`**

Read the full file. Confirm it contains no remaining `activeApp === 'burnlog'` or `activeApp === 'sociallog'` conditional blocks (Tasks 3 and 7 should have removed all of them). Confirm the `MoneyLogBottomNav`/`SocialLogBottomNav` conditional footer rendering (the `activeApp === 'moneylog' ? ... : activeApp === 'sociallog' ? ... : <BottomNav />` block near the end) still makes sense — since `/profile` is now only reachable from Logbook, simplify that footer to always render Logbook's own bottom nav. Check what Logbook's bottom nav component is (`components/LogbookBottomNav.tsx`, confirmed in the design's routing section) and use `<LogbookBottomNav />` unconditionally in place of that ternary.

- [ ] **Step 5: Verify — manual click-through of the whole flow**

Run: `npm run dev`. Visit `/logbook`, click Profile tab → `/profile` shows only avatar/name/username/email/App-selector/admin tools/logout, with `LogbookBottomNav` at the bottom. Visit each of the 6 sub-apps in turn, confirm their nav shows a gear "Config" tab (not "Profile"), and each Config page loads correctly (repeat the per-app checks from Tasks 3–7 as a final regression pass).

- [ ] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors. Confirm no dangling references anywhere: `grep -rln "ProfileMenu" --include="*.tsx" components app | grep -v "components/ProfileMenu.tsx\|components/ConfigMenu.tsx\|components/LogbookBottomNav.tsx\|components/BottomNav.tsx"` should return nothing (only `ProfileMenu.tsx` itself and its two remaining consumers, `LogbookBottomNav.tsx` and `BottomNav.tsx`, should mention it — `BottomNav.tsx` was already switched to `ConfigMenu` in Task 3, so this grep should come back empty).

- [ ] **Step 7: Commit**

```bash
git add -A -- "app/(shoppinglog)/shoppinglog/config" components/ShoppingLogBottomNav.tsx app/profile/page.tsx
git commit -m "feat(shoppinglog): add /shoppinglog/config; finish stripping app/profile/page.tsx to identity-only"
```

---

## Post-plan note

This plan completes sub-project 1 (Identity Consolidation) of the
3-part "Logbook as platform hub" initiative described in the spec.
Sub-project 2 (app-selection + AI-assisted onboarding from Logbook)
and sub-project 3 (shared cross-app feature layer) each need their own
brainstorming → spec → plan cycle before implementation.
