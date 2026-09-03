# TravelLog Weekly Trip Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a week, an AI cron job generates 5-8 persisted trip suggestions per opted-in profile from their travel history and upcoming free time/holidays, notifies them, and a new "This week's picks" card stack on `/travellog/suggestions` lets them browse (never dismiss) the batch.

**Architecture:** One new Prisma model (`TravelSuggestion`) plus one new `Profile` column (`weeklyTripSuggestionsEnabled`). A new prompt/validation module (`lib/travellog/weeklySuggestions.ts`) mirrors the existing on-demand `lib/travellog/suggestions.ts`. A new Vercel Cron route loops opted-in profiles, replaces each profile's suggestion batch, and pushes a notification via the existing `sendPushToUser`. A new `WeeklyTripStack` component adapts the index-based stacked-card mechanics of smoothui's `ScrollableCardStack` (swipe/scroll/keys move an index — nothing is ever removed) with a new trip-card face, wired into the existing suggestions page above the untouched on-demand section.

**Tech Stack:** Next.js App Router, Prisma + Supabase, OpenRouter (via the existing `lib/ai` helpers), Vercel Cron, `motion` (the `motion/react` import, already a dependency), `date-fns`.

**Spec:** `docs/superpowers/specs/2026-09-02-travellog-weekly-suggestions-design.md`

## Global Constraints

- No automated test suite in this repo — verify each task via `npx tsc --noEmit`, `npm run lint`, and manual checks as specified per task.
- The weekly batch never factors in affordability/budget — inputs are travel history, free-time windows, and holidays only.
- Cards in the stack are never individually dismissed or removed — the only opt-out is the config toggle.
- No destination photos — cards use a gradient + `MapPin` icon treatment, not a fetched image.
- The existing on-demand suggestions flow (`app/api/ai/travellog/suggestions/route.ts`, `lib/travellog/suggestions.ts`, the existing `Card` list UI) is not modified.

---

### Task 1: Schema — `TravelSuggestion` model + `weeklyTripSuggestionsEnabled` column

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: table `travellog_weekly_suggestions` (Prisma model `TravelSuggestion`) with columns `id, profileId, destination, country, startDate, endDate, windowLabel, reason, weekOf, createdAt`; `Profile.weeklyTripSuggestionsEnabled: boolean` (default `true`).

- [ ] **Step 1: Add the `weeklyTripSuggestionsEnabled` column to `model Profile`**

Add this line next to the existing `country String?` field (same identity-config cluster):

```prisma
  weeklyTripSuggestionsEnabled Boolean   @default(true)
```

- [ ] **Step 2: Add the `TravelSuggestion` model**

Add near the existing `TravelVisit`/`TravelPlan` models:

```prisma
model TravelSuggestion {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId   String   @db.Uuid
  destination String
  country     String
  startDate   DateTime @db.Date
  endDate     DateTime @db.Date
  windowLabel String
  reason      String
  weekOf      DateTime @db.Date
  createdAt   DateTime @default(now())

  @@index([profileId, weekOf])
  @@map("travellog_weekly_suggestions")
}
```

- [ ] **Step 3: Add the back-relation to `model Profile`**

In `model Profile`'s relation block (where `IntelSuggestion IntelSuggestion[]` etc. live), add:

```prisma
  TravelSuggestion TravelSuggestion[]
```

- [ ] **Step 4: Push schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: both commands exit 0; Prisma reports the new table and column applied.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add prisma/schema.prisma
git commit -m "feat(travellog): add TravelSuggestion model and weekly-suggestions toggle"
```

---

### Task 2: Prompt + validation module

**Files:**
- Create: `lib/travellog/weeklySuggestions.ts`

**Interfaces:**
- Consumes: `FreeWindow` from `lib/travellog/freeTime.ts` (`{ startDate: string; endDate: string; dayCount: number }`), `Holiday` from `lib/travellog/holidays.ts` (`{ date: string; name: string }`).
- Produces: `WeeklySuggestionsRequest`, `WeeklyTripSuggestion`, `WeeklySuggestionsResponse` types; `buildWeeklySuggestionsSystemPrompt(): string`; `buildWeeklySuggestionsUserPrompt(req: WeeklySuggestionsRequest): string`; `validateWeeklySuggestionsResponse(raw: unknown, freeWindows: FreeWindowInput[]): WeeklySuggestionsResponse` — all consumed by Task 3's cron route.

- [ ] **Step 1: Write the module**

```ts
// lib/travellog/weeklySuggestions.ts
export interface FreeWindowInput {
  startDate: string;
  endDate: string;
  dayCount: number;
}

export interface HolidayInput {
  date: string;
  name: string;
}

export interface WeeklySuggestionsRequest {
  visitedPlaces: string[];
  freeWindows: FreeWindowInput[];
  holidays: HolidayInput[];
  country: string;
}

export interface WeeklyTripSuggestion {
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  windowLabel: string;
  reason: string;
}

export interface WeeklySuggestionsResponse {
  suggestions: WeeklyTripSuggestion[];
}

export function buildWeeklySuggestionsSystemPrompt(): string {
  return 'You are a travel advisor who spots good opportunities for short trips. Given a traveller\'s past destinations, their actual free-time windows, and upcoming public holidays, you suggest specific, realistic trips timed to those windows. You respond with valid JSON only — no markdown, no prose, no code fences.';
}

export function buildWeeklySuggestionsUserPrompt(req: WeeklySuggestionsRequest): string {
  const windowsList = req.freeWindows
    .map((w) => `- ${w.startDate} to ${w.endDate} (${w.dayCount} days)`)
    .join('\n');
  const holidaysList = req.holidays.length > 0
    ? req.holidays.map((h) => `- ${h.date}: ${h.name}`).join('\n')
    : 'None in this period.';
  const visitedList = req.visitedPlaces.length > 0
    ? req.visitedPlaces.join(', ')
    : 'None recorded yet.';

  return `Suggest 5 to 8 trip ideas for a traveller based in ${req.country}.

Available free-time windows (the ONLY dates you may use):
${windowsList}

Upcoming public holidays in ${req.country}:
${holidaysList}

Places this traveller has already visited: ${visitedList}

Requirements:
- Each suggestion's startDate and endDate MUST fall entirely within one of the listed free-time windows (do not invent dates outside them).
- Prefer destinations the traveller has NOT already visited, unless a long weekend or holiday genuinely makes revisiting one a standout idea.
- Prefer windows that align with or extend a public holiday where one falls nearby.
- windowLabel is a short human-friendly label for the window used, e.g. "Long weekend · Nov 14-16" or "3-day window · Dec 5-7" — mention the holiday name if the window includes one.
- reason is one sentence explaining why this trip fits (the window, a nearby holiday, or novelty vs. their travel history).
- destination should be a real, specific place (city + country or region), not vague.

Respond with ONLY valid JSON matching this schema exactly:
{
  "suggestions": [
    {
      "destination": "Place name, Country",
      "country": "Country",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "windowLabel": "Short label for the window",
      "reason": "One sentence explaining the fit."
    }
  ]
}`;
}

function isWithinAnyWindow(start: string, end: string, windows: FreeWindowInput[]): boolean {
  return windows.some((w) => start >= w.startDate && end <= w.endDate);
}

function isWeeklyTripSuggestion(v: unknown): v is WeeklyTripSuggestion {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  const hasCore =
    typeof s.destination === 'string' &&
    typeof s.country === 'string' &&
    typeof s.startDate === 'string' &&
    typeof s.endDate === 'string' &&
    typeof s.reason === 'string';
  if (!hasCore) return false;
  return true;
}

function normalizeWindowLabel(s: Record<string, unknown>): string {
  return typeof s.windowLabel === 'string' && s.windowLabel.trim().length > 0
    ? s.windowLabel
    : `${s.startDate} – ${s.endDate}`;
}

/**
 * Drops any individual suggestion that is malformed or whose dates fall
 * outside the supplied free windows, rather than failing the whole batch —
 * losing a few of 5-8 suggestions is fine; losing the entire weekly batch
 * is not.
 */
export function validateWeeklySuggestionsResponse(raw: unknown, freeWindows: FreeWindowInput[]): WeeklySuggestionsResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.suggestions) || r.suggestions.length === 0) {
    throw new Error('AI response is missing a "suggestions" array');
  }

  const valid = r.suggestions
    .filter(isWeeklyTripSuggestion)
    .filter((s) => isWithinAnyWindow(s.startDate, s.endDate, freeWindows))
    .map((s) => ({ ...s, windowLabel: normalizeWindowLabel(s as unknown as Record<string, unknown>) }))
    .slice(0, 8);

  if (valid.length === 0) {
    throw new Error('AI response contained no suggestions within the supplied free-time windows');
  }

  return { suggestions: valid };
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/travellog/weeklySuggestions.ts
git commit -m "feat(travellog): add weekly trip suggestions prompt + validation"
```

---

### Task 3: Cron route + AI model slot + Vercel Cron config

**Files:**
- Modify: `lib/ai/modelConfig.ts`
- Create: `app/api/cron/travellog-weekly-suggestions/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `buildWeeklySuggestionsSystemPrompt`, `buildWeeklySuggestionsUserPrompt`, `validateWeeklySuggestionsResponse`, `WeeklySuggestionsRequest` from Task 2's `lib/travellog/weeklySuggestions.ts`; `computeFreeWindows` from `lib/travellog/freeTime.ts`; `fetchUpcomingHolidays` from `lib/travellog/holidays.ts`; `runAiJob`, `getModel`, `createServiceRoleClient`, `sendPushToUser` (existing helpers, signatures unchanged).
- Produces: `GET /api/cron/travellog-weekly-suggestions`, rows in `travellog_weekly_suggestions`, a `Notification` per profile with a batch.

- [ ] **Step 1: Register the AI model slot**

In `lib/ai/modelConfig.ts`, add one entry to the `AI_FEATURES` array (next to the existing `travellog-suggestions` entry):

```ts
  { slot: 'travellog-weekly-suggestions', label: 'Weekly Trip Suggestions', description: 'Generate the weekly trip-suggestion batch from travel history and free time.', app: 'travellog', kind: 'text' },
```

- [ ] **Step 2: Write the cron route**

```ts
// app/api/cron/travellog-weekly-suggestions/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob } from '@/lib/ai/jobs';
import { sendPushToUser } from '@/lib/pushNotification/server';
import { computeFreeWindows } from '@/lib/travellog/freeTime';
import { fetchUpcomingHolidays } from '@/lib/travellog/holidays';
import {
  buildWeeklySuggestionsSystemPrompt,
  buildWeeklySuggestionsUserPrompt,
  validateWeeklySuggestionsResponse,
  type WeeklySuggestionsRequest,
} from '@/lib/travellog/weeklySuggestions';

const HORIZON_DAYS = 90;

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const model = await getModel(supabase, 'travellog-weekly-suggestions');
  const today = new Date();
  const weekOf = mondayOf(today);
  const horizonEnd = new Date(today);
  horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS);
  const fromKey = today.toISOString().slice(0, 10);
  const toKey = horizonEnd.toISOString().slice(0, 10);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, userId, country')
    .eq('weeklyTripSuggestionsEnabled', true)
    .not('country', 'is', null);
  if (profilesError) {
    console.error('travellog-weekly-suggestions: failed to load profiles', profilesError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let profilesProcessed = 0;
  let suggestionsWritten = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of profiles ?? []) {
    profilesProcessed += 1;
    try {
      const [visitsRes, blocksRes, tasksRes, holidays] = await Promise.all([
        supabase
          .from('travellog_visits')
          .select('placeName, country')
          .eq('profileId', profile.id)
          .order('arrivalDate', { ascending: false })
          .limit(20),
        supabase.from('myday_blocks').select('date').eq('profileId', profile.id).gte('date', fromKey).lte('date', toKey),
        supabase.from('tasklog_tasks').select('dueDate, completedAt').eq('profileId', profile.id).gte('dueDate', fromKey).lte('dueDate', toKey),
        fetchUpcomingHolidays(profile.country as string, today, HORIZON_DAYS),
      ]);

      const freeWindows = computeFreeWindows(
        (blocksRes.data as { date: string }[]) || [],
        (tasksRes.data as { dueDate: string | null; completedAt: string | null }[]) || [],
        today,
        HORIZON_DAYS
      );

      if (freeWindows.length === 0) {
        skipped += 1;
        continue;
      }

      const visitedPlaces = ((visitsRes.data as { placeName: string; country: string }[]) || []).map(
        (v) => `${v.placeName}, ${v.country}`
      );

      const req: WeeklySuggestionsRequest = {
        visitedPlaces,
        freeWindows,
        holidays,
        country: profile.country as string,
      };

      const { suggestions } = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'travellog-weekly-suggestions', app: 'travellog', model },
        req,
        async () => {
          const completion = await client.chat.completions.create({
            model,
            temperature: 0.7,
            messages: [
              { role: 'system', content: buildWeeklySuggestionsSystemPrompt() },
              { role: 'user', content: buildWeeklySuggestionsUserPrompt(req) },
            ],
            response_format: { type: 'json_object' },
          });

          const content = completion.choices[0]?.message?.content;
          if (!content) throw new Error('AI returned no response');

          const parsed = JSON.parse(content);
          return validateWeeklySuggestionsResponse(parsed, freeWindows);
        }
      );

      await supabase.from('travellog_weekly_suggestions').delete().eq('profileId', profile.id);

      const { error: insertError } = await supabase.from('travellog_weekly_suggestions').insert(
        suggestions.map((s) => ({
          profileId: profile.id,
          destination: s.destination,
          country: s.country,
          startDate: s.startDate,
          endDate: s.endDate,
          windowLabel: s.windowLabel,
          reason: s.reason,
          weekOf,
        }))
      );
      if (insertError) throw insertError;
      suggestionsWritten += suggestions.length;

      await sendPushToUser(supabase, profile.userId as string, {
        title: 'New trip ideas for this week',
        message: `${suggestions.length} new places to consider for your next trip.`,
        url: '/travellog/suggestions',
      });
    } catch (err) {
      console.error(`travellog-weekly-suggestions: failed for profile ${profile.id}:`, err);
      errors += 1;
    }
  }

  return NextResponse.json({ profilesProcessed, suggestionsWritten, skipped, errors });
}
```

- [ ] **Step 3: Add the Vercel Cron entry**

In `vercel.json`, add to the `crons` array:

```json
    { "path": "/api/cron/travellog-weekly-suggestions", "schedule": "0 8 * * 1" }
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Manual check (requires `CRON_SECRET` set in your local `.env` and `npm run dev` running): pick a test profile, set its `country` (via `/travellog/config`) and clear a couple of `myday_blocks`/`tasklog_tasks` rows in the next 90 days so a free window exists, then:

```bash
curl -i http://localhost:3000/api/cron/travellog-weekly-suggestions \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `200` with `{"profilesProcessed":N,"suggestionsWritten":M,"skipped":K,"errors":0}`, `M > 0` for the test profile. Query `travellog_weekly_suggestions` for that profile and confirm rows exist; run the `curl` a second time and confirm the row count for that profile doesn't grow (old batch replaced, not appended). Confirm a new row appears in `notifications` for that profile.

```bash
git add lib/ai/modelConfig.ts app/api/cron/travellog-weekly-suggestions/route.ts vercel.json
git commit -m "feat(travellog): weekly trip-suggestions cron job"
```

---

### Task 4: Config page toggle

**Files:**
- Modify: `app/(travellog)/travellog/config/page.tsx`

- [ ] **Step 1: Add the `Switch` import and toggle handler**

Add `Switch` to the existing `components/ui/switch` import block (create the import line if not already present):

```tsx
import { Switch } from '@/components/ui/switch';
```

Add this handler next to `handleCountryChange`:

```tsx
  const handleWeeklyToggle = async (checked: boolean) => {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ weeklyTripSuggestionsEnabled: checked }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save setting', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
    toast({ description: checked ? 'Weekly trip suggestions enabled' : 'Weekly trip suggestions disabled' });
  };
```

- [ ] **Step 2: Add the toggle row to the card**

Inside the existing `<CardContent className="space-y-2">`, after the country `Select`, add:

```tsx
          <div className="flex items-center justify-between pt-4">
            <div>
              <Label htmlFor="weekly-suggestions" className="font-medium">Weekly trip suggestions</Label>
              <p className="text-xs text-muted-foreground">Get a new set of trip ideas every week based on your travel history and free time.</p>
            </div>
            <Switch
              id="weekly-suggestions"
              checked={(profile?.weeklyTripSuggestionsEnabled as boolean) ?? true}
              onCheckedChange={handleWeeklyToggle}
            />
          </div>
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Manual check: `npm run dev`, open `/travellog/config`, confirm the new switch renders and toggling it flips `profiles.weeklyTripSuggestionsEnabled` in the database (check via Supabase Studio or `psql`) and shows the toast.

```bash
git add "app/(travellog)/travellog/config/page.tsx"
git commit -m "feat(travellog): add weekly trip suggestions config toggle"
```

---

### Task 5: `WeeklyTripStack` component

**Files:**
- Create: `components/travellog/WeeklyTripStack.tsx`

**Interfaces:**
- Consumes: `motion`, `useMotionValue`, `useReducedMotion` from `'motion/react'`.
- Produces: `TripCardItem` type `{ id: string; destination: string; country: string; windowLabel: string; reason: string; startDate: string; endDate: string }`; `WeeklyTripStack` component with props `{ items: TripCardItem[]; onSelect: (item: TripCardItem) => void }` — `onSelect` is called with the active card when it's clicked/activated, consumed by Task 6.

- [ ] **Step 1: Write the component**

```tsx
// components/travellog/WeeklyTripStack.tsx
'use client';

import { motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCROLL_TIMEOUT_OFFSET = 100;
const MIN_SCROLL_INTERVAL = 300;
const SCROLL_THRESHOLD = 20;
const TOUCH_SCROLL_THRESHOLD = 60;
const SCALE_FACTOR = 0.08;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1;
const CARD_HEIGHT = 220;
const CARD_PADDING = 60;
const FRAME_OFFSET = -18;
const FRAMES_VISIBLE_LENGTH = 3;
const SNAP_DISTANCE = 50;
const TRANSITION_DURATION = 220;

export interface TripCardItem {
  id: string;
  destination: string;
  country: string;
  windowLabel: string;
  reason: string;
  startDate: string;
  endDate: string;
}

const AURORA_GRADIENTS = [
  'linear-gradient(135deg, #f6a63f, #e8447b)',
  'linear-gradient(135deg, #17b47a, #4a95f0)',
  'linear-gradient(135deg, #4a95f0, #8b5fe8)',
  'linear-gradient(135deg, #e8447b, #8b5fe8)',
  'linear-gradient(135deg, #f6a63f, #17b47a)',
];

export function WeeklyTripStack({
  items,
  onSelect,
}: {
  items: TripCardItem[];
  onSelect: (item: TripCardItem) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);
  const lastScrollTime = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  const maxIndex = items.length - 1;

  const clamp = useCallback((val: number, min: number, max: number) => Math.min(Math.max(val, min), max), []);

  const scrollToCard = useCallback(
    (direction: 1 | -1) => {
      if (isScrolling) return;
      const now = Date.now();
      if (now - lastScrollTime.current < MIN_SCROLL_INTERVAL) return;

      const newIndex = clamp(currentIndex + direction, 0, maxIndex);
      if (newIndex === currentIndex) return;

      lastScrollTime.current = now;
      setIsScrolling(true);
      setCurrentIndex(newIndex);
      scrollY.set(newIndex * SNAP_DISTANCE);
      setTimeout(() => setIsScrolling(false), TRANSITION_DURATION + SCROLL_TIMEOUT_OFFSET);
    },
    [currentIndex, maxIndex, scrollY, isScrolling, clamp]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (isDragging || isScrolling) return;
      if (Math.abs(e.deltaY) < SCROLL_THRESHOLD) return;
      e.preventDefault();
      scrollToCard(e.deltaY > 0 ? 1 : -1);
    },
    [isDragging, isScrolling, scrollToCard]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isScrolling) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToCard(-1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToCard(1);
      }
    },
    [isScrolling, scrollToCard]
  );

  const touchStartY = useRef(0);
  const touchMoved = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchMoved.current = false;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || isScrolling || touchMoved.current) return;
      const deltaY = touchStartY.current - e.touches[0].clientY;
      if (Math.abs(deltaY) > TOUCH_SCROLL_THRESHOLD) {
        scrollToCard(deltaY > 0 ? 1 : -1);
        touchMoved.current = true;
      }
    },
    [isDragging, isScrolling, scrollToCard]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    touchMoved.current = false;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const getCardTransform = useCallback(
    (index: number) => {
      const offsetIndex = index - currentIndex;
      const isBehindCurrent = currentIndex > index;
      const opacity = isBehindCurrent ? 0 : 1;
      const scale = shouldReduceMotion ? 1 : clamp(1 - offsetIndex * SCALE_FACTOR, MIN_SCALE, MAX_SCALE);
      const y = shouldReduceMotion ? 0 : clamp(offsetIndex * FRAME_OFFSET, FRAME_OFFSET * FRAMES_VISIBLE_LENGTH, 0);
      return { opacity, scale, y, zIndex: items.length - index };
    },
    [currentIndex, items.length, clamp, shouldReduceMotion]
  );

  if (items.length === 0) return null;

  return (
    <div
      aria-label="Weekly trip suggestions"
      className="relative mx-auto w-full max-w-sm"
      onKeyDown={handleKeyDown}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      ref={containerRef}
      role="application"
      style={{ minHeight: `${CARD_HEIGHT + CARD_PADDING}px`, touchAction: 'none' }}
      tabIndex={0}
    >
      {items.map((item, i) => {
        const transform = getCardTransform(i);
        const isActive = i === currentIndex;

        return (
          <motion.button
            animate={shouldReduceMotion ? {} : { scale: transform.scale, y: transform.y }}
            aria-hidden={!isActive}
            className="absolute top-0 left-0 w-full overflow-hidden rounded-2xl border bg-card text-left shadow-lg"
            initial={false}
            key={item.id}
            onClick={() => (isActive ? onSelect(item) : scrollToCard(i > currentIndex ? 1 : -1))}
            style={{
              height: `${CARD_HEIGHT}px`,
              opacity: transform.opacity,
              pointerEvents: isActive || i > currentIndex ? 'auto' : 'none',
              zIndex: transform.zIndex,
            }}
            tabIndex={isActive ? 0 : -1}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring' as const, stiffness: 250, damping: 20, mass: 0.5 }
            }
            type="button"
          >
            <div
              className="flex h-16 items-center gap-2 px-4 text-white"
              style={{ background: AURORA_GRADIENTS[i % AURORA_GRADIENTS.length] }}
            >
              <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="truncate text-lg font-semibold">{item.destination}</div>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <span className="w-fit rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {item.windowLabel}
              </span>
              <p className="text-sm text-muted-foreground">{item.reason}</p>
            </div>
          </motion.button>
        );
      })}

      <div
        aria-label="Card navigation"
        className="absolute bottom-2 left-1/2 flex -translate-x-1/2 space-x-2"
        role="tablist"
        style={{ top: `${CARD_HEIGHT + 16}px` }}
      >
        {items.map((item, i) => (
          <button
            aria-label={`Go to card ${i + 1} of ${items.length}`}
            aria-selected={i === currentIndex}
            className={cn(
              'h-2 w-2 rounded-full transition-all',
              i === currentIndex ? 'scale-125 bg-primary' : 'bg-muted-foreground/30'
            )}
            key={item.id}
            onClick={() => scrollToCard(i > currentIndex ? 1 : -1)}
            role="tab"
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

```bash
git add components/travellog/WeeklyTripStack.tsx
git commit -m "feat(travellog): add WeeklyTripStack card-stack component"
```

---

### Task 6: Wire into `/travellog/suggestions`

**Files:**
- Modify: `app/(travellog)/travellog/suggestions/page.tsx`

- [ ] **Step 1: Add imports and state for the weekly batch**

Add to the top imports:

```tsx
import { WeeklyTripStack, type TripCardItem } from '@/components/travellog/WeeklyTripStack';
```

Add state next to the existing `suggestions`/`generating` state:

```tsx
  const [weeklySuggestions, setWeeklySuggestions] = useState<TripCardItem[]>([]);
```

- [ ] **Step 2: Fetch the weekly batch in its own effect**

Add a new `useEffect`, independent of the existing signals-computing effect:

```tsx
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('travellog_weekly_suggestions')
        .select('id, destination, country, startDate, endDate, windowLabel, reason')
        .eq('profileId', profile.id)
        .order('createdAt', { ascending: true });

      if (!cancelled) {
        setWeeklySuggestions((data as TripCardItem[]) || []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, supabase]);
```

- [ ] **Step 3: Add a handler that reuses the existing plan-deep-link logic**

Add next to `handlePlanTrip`:

```tsx
  function handlePlanWeeklyTrip(item: TripCardItem) {
    const params = new URLSearchParams({
      destination: item.destination,
      startDate: item.startDate,
      endDate: item.endDate,
    });
    router.push(`/travellog/plan?${params.toString()}`);
  }
```

- [ ] **Step 4: Render the section above the existing on-demand content**

Inside the `<div className="p-4 flex flex-col gap-4">`, immediately before the existing `{!profileLoading && !profile?.country ? (` block, add:

```tsx
        {weeklySuggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">This week&apos;s picks</h2>
            <WeeklyTripStack items={weeklySuggestions} onSelect={handlePlanWeeklyTrip} />
          </div>
        )}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Manual check: with rows present in `travellog_weekly_suggestions` for the logged-in profile (from Task 3's cron test), load `/travellog/suggestions` in the browser and confirm:
- The "This week's picks" section renders above the existing "Refresh suggestions" section.
- Scrolling/dragging/arrow keys on the stack moves through cards one at a time; no card disappears when moved past.
- Clicking the active (front) card navigates to `/travellog/plan` with `destination`/`startDate`/`endDate` query params, and the intake form is prefilled with them.
- With zero rows in `travellog_weekly_suggestions` for the profile, the section doesn't render at all (no empty-state card).

```bash
git add "app/(travellog)/travellog/suggestions/page.tsx"
git commit -m "feat(travellog): show weekly trip suggestions on the suggestions page"
```
