# IceMyVacation AI Trip Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TravelLog's `/travellog/plan` tab: an AI-generated day-by-day trip itinerary (ported from `~/Documents/Projects/IceMyVacation`, using this codebase's OpenRouter infrastructure instead of DeepSeek), reviewed by the user, and on accept: saved as a `TravelPlan`, auto-logged as a `TravelVisit` on the Map, and turned into TaskLog tasks (logistics + one per day).

**Architecture:** Two new Prisma models/columns (`TravelPlan`, `Task.travelPlanId`) applied directly to the live Supabase project. Itinerary generation is a new `app/api/ai/travellog/itinerary/route.ts` following this codebase's existing AI-route convention exactly (OpenRouter client, `getModel`, `formatAiError`) — prompt logic ported from `itinerary.py`. A thin `app/api/ai/travellog/currency/route.ts` proxies `frankfurter.app` for live conversion. The "accept" step is a client-side function (`lib/travellog/acceptPlan.ts`) that does direct Supabase inserts, matching every other write path in this codebase (e.g. `lib/tasklog/completeTask.ts`) — no new API route for it. The `/travellog/plan` page becomes a three-state flow: intake form → loading → itinerary review, replacing the placeholder from the TravelLog foundation plan.

**Tech Stack:** Next.js API routes (server-side OpenRouter calls), `@supabase/ssr` browser client for all data writes, Prisma (schema-as-documentation), no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-icemyvacation-planner-design.md`

## Global Constraints

- No test framework exists in this repo — verification is `npx tsc --noEmit` + `npm run lint` clean, plus manual browser checks (same bar as every prior plan in this repo).
- AI calls go through OpenRouter (`lib/ai/openrouter.ts`'s client pattern, `getModel(supabase, 'text')`, `formatAiError`) — never DeepSeek, never a hardcoded model string.
- Itinerary JSON field names are camelCase (`estimatedCost`, `budgetBreakdown`, `totalEstimatedCost`, `transportNote`), not the source project's snake_case.
- `TravelVisit.country` is required and non-nullable; the accept handler stores the free-text `destination` value in it verbatim (no geocoding split) — see spec's "Country field" section.
- Every write (TravelPlan, TravelVisit, tasklog_tasks) happens via direct client-side Supabase calls, matching this codebase's established pattern — not through a custom API route.
- Full spec: `docs/superpowers/specs/2026-09-01-icemyvacation-planner-design.md`

---

### Task 1: Database — `TravelPlan` table, `Task.travelPlanId`, Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `travellog_plans` table (columns: `id`, `profileId`, `destination`, `hotel`, `startDate`, `endDate`, `numPeople`, `transportMode`, `budget`, `budgetCurrency`, `itinerary`, `status`, `acceptedAt`, `createdAt`); `tasklog_tasks.travelPlanId` (nullable FK). Task 8's `acceptPlan.ts` and every UI task depend on these exact column names.

- [ ] **Step 1: Apply the migration to the live Supabase project**

Use `mcp__supabase__apply_migration` with name `create_travellog_plans` and this SQL:

```sql
create table travellog_plans (
  id uuid primary key default gen_random_uuid(),
  "profileId" uuid not null references profiles(id),
  destination text not null,
  hotel text,
  "startDate" date not null,
  "endDate" date not null,
  "numPeople" integer not null default 1,
  "transportMode" text not null,
  budget double precision,
  "budgetCurrency" text not null default 'USD',
  itinerary jsonb not null,
  status text not null default 'draft',
  "acceptedAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default now()
);

create index travellog_plans_profile_id_idx on travellog_plans ("profileId");

alter table travellog_plans enable row level security;

create policy travellog_plans_owner_access on travellog_plans
  for all
  using (exists (
    select 1 from profiles
    where profiles.id = travellog_plans."profileId"
      and profiles."userId" = auth.uid()
  ))
  with check (exists (
    select 1 from profiles
    where profiles.id = travellog_plans."profileId"
      and profiles."userId" = auth.uid()
  ));

alter table tasklog_tasks add column "travelPlanId" uuid references travellog_plans(id);
```

- [ ] **Step 2: Verify the table, column, and policy exist**

Use `mcp__supabase__execute_sql`:
```sql
select relname, relrowsecurity from pg_class where relname = 'travellog_plans';
```
Expected: one row, `relrowsecurity = true`. Then:
```sql
select policyname from pg_policies where tablename = 'travellog_plans';
```
Expected: `travellog_plans_owner_access`. Then:
```sql
select column_name from information_schema.columns where table_name = 'tasklog_tasks' and column_name = 'travelPlanId';
```
Expected: one row.

- [ ] **Step 3: Update `prisma/schema.prisma`**

Add the reciprocal relation to the `Profile` model, next to the existing `TravelVisit             TravelVisit[]` line (around line 96):

```prisma
  TravelVisit             TravelVisit[]
  TravelPlan              TravelPlan[]
```

Add `travelPlanId` to the `Task` model (around line 635-658), inserted right after the `idea`/`ideaId` pair so it groups with the other optional parent relations:

```prisma
model Task {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile   @relation(fields: [profileId], references: [id])
  profileId       String    @db.Uuid
  goal            TaskGoal? @relation(fields: [goalId], references: [id])
  goalId          String?   @db.Uuid
  idea            Idea?     @relation(fields: [ideaId], references: [id])
  ideaId          String?   @db.Uuid
  travelPlan      TravelPlan? @relation(fields: [travelPlanId], references: [id])
  travelPlanId    String?   @db.Uuid
  title           String
  notes           String?
  category        String // 'life' | 'work'
  priority        String    @default("medium") // 'low' | 'medium' | 'high'
  lane            String? // null = Plan inbox; else 'todo' | 'in_progress' | 'done'
  dueDate         DateTime? @db.Date
  plannedForToday Boolean   @default(false)
  position        Int       @default(0)
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  cost            Float?
  costCategory    String?
  costLoggedAt    DateTime?

  @@map("tasklog_tasks")
}
```

(Only the `travelPlan`/`travelPlanId` pair is new; everything else shown is unchanged, given for exact placement.)

Add the new model after `TravelVisit` (which ends `@@map("travellog_visits")`):

```prisma
/// an AI-generated day-by-day trip itinerary; the full itinerary JSON is stored as-is, keyed by day/activity — see docs/superpowers/specs/2026-09-01-icemyvacation-planner-design.md for its shape
model TravelPlan {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile        Profile   @relation(fields: [profileId], references: [id])
  profileId      String    @db.Uuid
  destination    String
  hotel          String?
  startDate      DateTime  @db.Date
  endDate        DateTime  @db.Date
  numPeople      Int       @default(1)
  transportMode  String
  budget         Float?
  budgetCurrency String    @default("USD")
  itinerary      Json
  status         String    @default("draft")
  acceptedAt     DateTime?
  createdAt      DateTime  @default(now())
  tasks          Task[]

  @@map("travellog_plans")
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors. Run `npx prisma generate` if Prisma Client types are consumed elsewhere and need regenerating.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(travellog): add travellog_plans table and Task.travelPlanId"
```

---

### Task 2: Itinerary types and prompt builder

**Files:**
- Create: `lib/travellog/itinerary.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ItineraryRequest`, `Activity`, `ItineraryDay`, `BudgetBreakdown`, `Itinerary` types; `TRANSPORT_HINTS: Record<TransportMode, string>`; `buildSystemPrompt(): string`; `buildUserPrompt(req: ItineraryRequest): string`; `validateItinerary(raw: unknown): Itinerary`. Task 3's API route and Task 7's UI both import these by exact name.

- [ ] **Step 1: Write `lib/travellog/itinerary.ts`**

Ported from `itinerary.py`'s request/response models, transport hints, and prompt builders — camelCased, with the JSON schema in the prompt matching this file's own types:

```ts
// lib/travellog/itinerary.ts

export type TransportMode = 'car' | 'public_transit' | 'flight' | 'mixed';

export interface ItineraryRequest {
  destination: string;
  hotel: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  numPeople: number;
  transportMode: TransportMode;
  budget: number | null;
  budgetCurrency: string;
}

export interface Activity {
  time: string;
  title: string;
  description: string;
  location: string;
  lat: number | null;
  lng: number | null;
  estimatedCost: number;
  transportNote: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  activities: Activity[];
}

export interface BudgetBreakdown {
  accommodation: number;
  food: number;
  activities: number;
  transport: number;
}

export interface Itinerary {
  days: ItineraryDay[];
  budgetBreakdown: BudgetBreakdown;
  totalEstimatedCost: number;
  currency: string;
}

export const TRANSPORT_HINTS: Record<TransportMode, string> = {
  car: 'The traveller is using a CAR. Include driving routes between each activity, estimated drive times, parking tips, scenic road-trip stops, and fuel/toll notes.',
  public_transit: 'The traveller is using PUBLIC TRANSIT (bus, metro, train). Include specific bus/metro/train route numbers where known, estimated journey times, recommended transit cards, and the nearest station/stop for each location.',
  flight: "The traveller's primary long-distance mode is FLIGHT. Include airport transfer details (taxi, shuttle, or rail), check-in/security buffer times, terminal info where relevant, and local transport from the airport.",
  mixed: 'The traveller uses a MIX of transport modes. Choose the most practical mode per leg: flights for long distances, trains/metro for medium distances, and walking/taxi for short hops. State the mode for each activity.',
};

export function buildSystemPrompt(): string {
  return 'You are an expert travel planner. When given travel details you respond with a detailed, day-by-day vacation itinerary as valid JSON only — no markdown, no prose, no code fences. The JSON must exactly match the schema provided by the user.';
}

export function buildUserPrompt(req: ItineraryRequest): string {
  const transportHint = TRANSPORT_HINTS[req.transportMode];
  const budgetLine = req.budget != null
    ? `Total budget: ${req.budget} ${req.budgetCurrency}.`
    : 'No strict budget specified; estimate realistic costs.';

  const schema = `
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "activities": [
        {
          "time": "09:00",
          "title": "Activity title",
          "description": "Detailed description",
          "location": "Place name, City",
          "lat": 13.7563,
          "lng": 100.5018,
          "estimatedCost": 15.0,
          "transportNote": "Take BTS Skytrain to Siam station"
        }
      ]
    }
  ],
  "budgetBreakdown": {
    "accommodation": 0.0,
    "food": 0.0,
    "activities": 0.0,
    "transport": 0.0
  },
  "totalEstimatedCost": 0.0,
  "currency": "USD"
}
`;

  return `Plan a vacation itinerary with the following details:

Destination: ${req.destination}
Hotel / Accommodation: ${req.hotel || 'Not specified'}
Start date: ${req.startDate}
End date: ${req.endDate}
Number of people: ${req.numPeople}
Transport mode: ${req.transportMode}
${budgetLine}
Output currency: ${req.budgetCurrency}

Transport guidance: ${transportHint}

Requirements:
- Create one entry per day between startDate and endDate (inclusive).
- Each day should have at least 3 activities: morning (e.g. 08:00-10:00), afternoon (e.g. 13:00-15:00), and evening (e.g. 18:00-20:00).
- Provide realistic lat/lng coordinates for every location.
- estimatedCost is per-person in ${req.budgetCurrency}.
- transportNote must reflect the chosen transport mode (${req.transportMode}).
- budgetBreakdown totals should equal totalEstimatedCost (for ${req.numPeople} people).
- currency field must be "${req.budgetCurrency}".

Respond with ONLY valid JSON matching this schema exactly:
${schema}
`;
}

function isBudgetBreakdown(v: unknown): v is BudgetBreakdown {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return ['accommodation', 'food', 'activities', 'transport'].every((k) => typeof b[k] === 'number');
}

function isActivity(v: unknown): v is Activity {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.time === 'string' &&
    typeof a.title === 'string' &&
    typeof a.description === 'string' &&
    typeof a.location === 'string' &&
    (a.lat === null || typeof a.lat === 'number') &&
    (a.lng === null || typeof a.lng === 'number') &&
    typeof a.estimatedCost === 'number' &&
    typeof a.transportNote === 'string'
  );
}

function isItineraryDay(v: unknown): v is ItineraryDay {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.day === 'number' &&
    typeof d.date === 'string' &&
    Array.isArray(d.activities) &&
    d.activities.length > 0 &&
    d.activities.every(isActivity)
  );
}

/** Validates a raw AI JSON response against the Itinerary shape, throwing a descriptive error on any mismatch. */
export function validateItinerary(raw: unknown): Itinerary {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.days) || r.days.length === 0 || !r.days.every(isItineraryDay)) {
    throw new Error('AI response is missing a valid "days" array');
  }
  if (!isBudgetBreakdown(r.budgetBreakdown)) {
    throw new Error('AI response is missing a valid "budgetBreakdown" object');
  }
  if (typeof r.totalEstimatedCost !== 'number') {
    throw new Error('AI response is missing a numeric "totalEstimatedCost"');
  }
  if (typeof r.currency !== 'string') {
    throw new Error('AI response is missing a "currency" string');
  }

  return {
    days: r.days as ItineraryDay[],
    budgetBreakdown: r.budgetBreakdown,
    totalEstimatedCost: r.totalEstimatedCost,
    currency: r.currency,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/travellog/itinerary.ts
git commit -m "feat(travellog): port itinerary types and prompt builder from IceMyVacation"
```

---

### Task 3: Itinerary generation API route

**Files:**
- Create: `app/api/ai/travellog/itinerary/route.ts`

**Interfaces:**
- Consumes: `ItineraryRequest`, `buildSystemPrompt`, `buildUserPrompt`, `validateItinerary` (Task 2); `getModel` (`@/lib/ai/modelConfig`, existing); `formatAiError` (`@/lib/ai/errors`, existing).
- Produces: `POST /api/ai/travellog/itinerary` — request body `ItineraryRequest`, success response `Itinerary` JSON, error response `{ error: string }`. Task 6's `TripIntakeForm` calls this.

- [ ] **Step 1: Write `app/api/ai/travellog/itinerary/route.ts`**

```ts
// app/api/ai/travellog/itinerary/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { buildSystemPrompt, buildUserPrompt, validateItinerary, type ItineraryRequest } from '@/lib/travellog/itinerary';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<ItineraryRequest>;
    if (!body.destination || !body.startDate || !body.endDate || !body.transportMode) {
      return NextResponse.json({ error: 'Missing required trip details' }, { status: 400 });
    }

    const req: ItineraryRequest = {
      destination: body.destination,
      hotel: body.hotel || '',
      startDate: body.startDate,
      endDate: body.endDate,
      numPeople: body.numPeople ?? 1,
      transportMode: body.transportMode,
      budget: body.budget ?? null,
      budgetCurrency: body.budgetCurrency || 'USD',
    };

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(req) },
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const itinerary = validateItinerary(parsed);
    return NextResponse.json(itinerary);
  } catch (error) {
    console.error('travellog itinerary error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/travellog/itinerary/route.ts
git commit -m "feat(travellog): add AI itinerary generation endpoint via OpenRouter"
```

---

### Task 4: Currency conversion API route

**Files:**
- Create: `app/api/ai/travellog/currency/route.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `GET /api/ai/travellog/currency?from=X&to=Y` — success `{ rate: number }`, error `{ error: string }`. Task 7's `ItineraryReview` calls this.

- [ ] **Step 1: Write `app/api/ai/travellog/currency/route.ts`**

```ts
// app/api/ai/travellog/currency/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" query parameter' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Currency provider returned an error' }, { status: 502 });
    }
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (typeof rate !== 'number') {
      return NextResponse.json({ error: `No rate available for ${from} → ${to}` }, { status: 502 });
    }
    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: 'Failed to reach currency provider' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/travellog/currency/route.ts
git commit -m "feat(travellog): add currency conversion endpoint (frankfurter.app passthrough)"
```

---

### Task 5: Accept-plan handler

**Files:**
- Create: `lib/travellog/acceptPlan.ts`

**Interfaces:**
- Consumes: `ItineraryRequest`, `Itinerary` (Task 2).
- Produces: `acceptTravelPlan(supabase: SupabaseClient, profileId: string, req: ItineraryRequest, itinerary: Itinerary): Promise<{ tasksCreated: number }>`. Task 8's plan page calls this on accept.

- [ ] **Step 1: Write `lib/travellog/acceptPlan.ts`**

```ts
// lib/travellog/acceptPlan.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ItineraryRequest, Itinerary } from './itinerary';

function firstCoordinates(itinerary: Itinerary): { lat: number; lng: number } {
  for (const day of itinerary.days) {
    for (const activity of day.activities) {
      if (activity.lat != null && activity.lng != null) {
        return { lat: activity.lat, lng: activity.lng };
      }
    }
  }
  return { lat: 0, lng: 0 };
}

function formatDayNotes(day: Itinerary['days'][number]): string {
  return day.activities.map((a) => `${a.time} — ${a.title}`).join('\n');
}

/**
 * Accepts a reviewed itinerary: saves the TravelPlan, auto-logs a TravelVisit
 * for the destination so it appears on the Map tab, and creates TaskLog
 * tasks (logistics + one per itinerary day) tagged with the plan's id.
 */
export async function acceptTravelPlan(
  supabase: SupabaseClient,
  profileId: string,
  req: ItineraryRequest,
  itinerary: Itinerary
): Promise<{ tasksCreated: number }> {
  const acceptedAt = new Date().toISOString();

  const { data: plan, error: planError } = await supabase
    .from('travellog_plans')
    .insert({
      profileId,
      destination: req.destination,
      hotel: req.hotel || null,
      startDate: req.startDate,
      endDate: req.endDate,
      numPeople: req.numPeople,
      transportMode: req.transportMode,
      budget: req.budget,
      budgetCurrency: req.budgetCurrency,
      itinerary,
      status: 'accepted',
      acceptedAt,
    })
    .select()
    .single();
  if (planError) throw planError;

  const { lat, lng } = firstCoordinates(itinerary);
  const { error: visitError } = await supabase.from('travellog_visits').insert({
    profileId,
    placeName: req.destination,
    country: req.destination,
    lat,
    lng,
    arrivalDate: req.startDate,
    departureDate: req.endDate,
    notes: 'Auto-logged from trip plan',
  });
  if (visitError) throw visitError;

  const logisticsTasks: Array<{ title: string; priority: string }> = [];
  if (req.transportMode === 'flight' || req.transportMode === 'mixed') {
    logisticsTasks.push({ title: `Book flights to ${req.destination}`, priority: 'high' });
  }
  logisticsTasks.push({
    title: req.hotel ? `Confirm booking: ${req.hotel}` : `Book accommodation in ${req.destination}`,
    priority: 'high',
  });
  logisticsTasks.push({ title: `Pack for ${req.destination} trip`, priority: 'high' });

  const dayTasks = itinerary.days.map((day) => ({
    title: `Day ${day.day} in ${req.destination}`,
    priority: 'medium',
    dueDate: day.date,
    notes: formatDayNotes(day),
  }));

  const taskRows = [
    ...logisticsTasks.map((t) => ({
      profileId,
      travelPlanId: plan.id,
      title: t.title,
      category: 'life',
      priority: t.priority,
      dueDate: req.startDate,
    })),
    ...dayTasks.map((t) => ({
      profileId,
      travelPlanId: plan.id,
      title: t.title,
      category: 'life',
      priority: t.priority,
      dueDate: t.dueDate,
      notes: t.notes,
    })),
  ];

  const { error: tasksError } = await supabase.from('tasklog_tasks').insert(taskRows);
  if (tasksError) throw tasksError;

  return { tasksCreated: taskRows.length };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/travellog/acceptPlan.ts
git commit -m "feat(travellog): add accept-plan handler (saves plan, logs visit, creates tasks)"
```

---

### Task 6: Trip intake form

**Files:**
- Create: `app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx`

**Interfaces:**
- Consumes: `ItineraryRequest`, `TransportMode` (Task 2).
- Produces: `TripIntakeForm` component, props `{ onGenerated: (req: ItineraryRequest, itinerary: Itinerary) => void }`. Task 8's plan page renders this.

- [ ] **Step 1: Write `app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx`**

```tsx
// app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { ItineraryRequest, Itinerary, TransportMode } from '@/lib/travellog/itinerary';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'THB'];

type TripIntakeFormProps = {
  onGenerated: (req: ItineraryRequest, itinerary: Itinerary) => void;
};

export function TripIntakeForm({ onGenerated }: TripIntakeFormProps) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [destination, setDestination] = useState('');
  const [hotel, setHotel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [numPeople, setNumPeople] = useState('1');
  const [transportMode, setTransportMode] = useState<TransportMode>('public_transit');
  const [budget, setBudget] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!destination.trim() || !startDate || !endDate) {
      setError('Destination, start date, and end date are required.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }

    const req: ItineraryRequest = {
      destination: destination.trim(),
      hotel: hotel.trim(),
      startDate,
      endDate,
      numPeople: Number(numPeople) || 1,
      transportMode,
      budget: budget.trim() ? Number(budget) : null,
      budgetCurrency,
    };

    setLoading(true);
    try {
      const res = await fetch('/api/ai/travellog/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate itinerary');
      onGenerated(req, data as Itinerary);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      toast({ title: 'Could not generate itinerary', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="destination">Destination</Label>
            <Input id="destination" placeholder="e.g. Kyoto, Japan" value={destination} onChange={(e) => setDestination(e.target.value)} disabled={loading} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hotel">Hotel / area (optional)</Label>
            <Input id="hotel" placeholder="Hotel name or neighbourhood" value={hotel} onChange={(e) => setHotel(e.target.value)} disabled={loading} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={loading} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="numPeople">Number of people</Label>
              <Input id="numPeople" type="number" min={1} value={numPeople} onChange={(e) => setNumPeople(e.target.value)} disabled={loading} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="transportMode">Transport mode</Label>
              <Select value={transportMode} onValueChange={(v) => setTransportMode(v as TransportMode)} disabled={loading}>
                <SelectTrigger id="transportMode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="public_transit">Public transit</SelectItem>
                  <SelectItem value="flight">Flight</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget">Budget (optional)</Label>
              <Input id="budget" type="number" min={0} step="0.01" placeholder="0.00" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={loading} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="budgetCurrency">Currency</Label>
              <Select value={budgetCurrency} onValueChange={setBudgetCurrency} disabled={loading}>
                <SelectTrigger id="budgetCurrency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Generate itinerary'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx"
git commit -m "feat(travellog): add trip intake form"
```

---

### Task 7: Itinerary review component

**Files:**
- Create: `app/(travellog)/travellog/plan/_components/ItineraryReview.tsx`

**Interfaces:**
- Consumes: `ItineraryRequest`, `Itinerary` (Task 2).
- Produces: `ItineraryReview` component, props `{ req: ItineraryRequest; itinerary: Itinerary; onAccept: () => void; onStartOver: () => void; accepting: boolean }`. Task 8's plan page renders this.

- [ ] **Step 1: Write `app/(travellog)/travellog/plan/_components/ItineraryReview.tsx`**

```tsx
// app/(travellog)/travellog/plan/_components/ItineraryReview.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';

const CONVERT_TARGETS = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'THB'];

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

type ItineraryReviewProps = {
  req: ItineraryRequest;
  itinerary: Itinerary;
  onAccept: () => void;
  onStartOver: () => void;
  accepting: boolean;
};

export function ItineraryReview({ req, itinerary, onAccept, onStartOver, accepting }: ItineraryReviewProps) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [convertTo, setConvertTo] = useState(itinerary.currency);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (convertTo === itinerary.currency) {
      setConvertedTotal(null);
      return;
    }
    let cancelled = false;
    setConverting(true);
    fetch(`/api/ai/travellog/currency?from=${itinerary.currency}&to=${convertTo}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && typeof data.rate === 'number') {
          setConvertedTotal(itinerary.totalEstimatedCost * data.rate);
        }
      })
      .finally(() => {
        if (!cancelled) setConverting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [convertTo, itinerary.currency, itinerary.totalEstimatedCost]);

  const currentDay = itinerary.days[selectedDay];
  const budgetItems: Array<{ label: string; amount: number }> = [
    { label: 'Accommodation', amount: itinerary.budgetBreakdown.accommodation },
    { label: 'Food', amount: itinerary.budgetBreakdown.food },
    { label: 'Activities', amount: itinerary.budgetBreakdown.activities },
    { label: 'Transport', amount: itinerary.budgetBreakdown.transport },
  ];

  const isOverBudget = req.budget != null && itinerary.totalEstimatedCost > req.budget;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {itinerary.days.map((day, i) => (
          <Button key={day.day} type="button" variant={i === selectedDay ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDay(i)}>
            Day {day.day}
          </Button>
        ))}
      </div>

      {currentDay && (
        <div className="flex flex-col gap-3">
          {currentDay.activities.map((activity, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                    <p className="font-medium">{activity.title}</p>
                  </div>
                  <p className="text-sm font-semibold text-primary whitespace-nowrap">
                    {formatCurrency(activity.estimatedCost, itinerary.currency)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{activity.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{activity.location}</p>
                {activity.transportNote && <p className="text-xs text-muted-foreground italic mt-1">{activity.transportNote}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Budget overview</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {budgetItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">{formatCurrency(item.amount, itinerary.currency)}</span>
            </div>
          ))}
          <div className="border-t pt-2 mt-1 flex items-center justify-between">
            <span className="font-semibold">Total estimated</span>
            <span className={`font-semibold ${isOverBudget ? 'text-red-500' : ''}`}>
              {formatCurrency(itinerary.totalEstimatedCost, itinerary.currency)}
            </span>
          </div>
          {req.budget != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your budget</span>
              <span>{formatCurrency(req.budget, req.budgetCurrency)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">Convert to</span>
            <Select value={convertTo} onValueChange={setConvertTo}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONVERT_TARGETS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {converting && <Loader2 className="animate-spin w-4 h-4" />}
            {!converting && convertedTotal != null && (
              <span className="text-sm font-medium">{formatCurrency(convertedTotal, convertTo)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onStartOver} disabled={accepting}>
          Start over
        </Button>
        <Button type="button" className="flex-1" onClick={onAccept} disabled={accepting}>
          {accepting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Accept trip plan'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "app/(travellog)/travellog/plan/_components/ItineraryReview.tsx"
git commit -m "feat(travellog): add itinerary review component with currency conversion"
```

---

### Task 8: Wire the Plan page

**Files:**
- Modify: `app/(travellog)/travellog/plan/page.tsx` (currently the foundation plan's placeholder)

**Interfaces:**
- Consumes: `TripIntakeForm` (Task 6), `ItineraryReview` (Task 7), `acceptTravelPlan` (Task 5), `useCurrentProfile` (existing).
- Produces: nothing consumed by later tasks (leaf page).

- [ ] **Step 1: Replace `app/(travellog)/travellog/plan/page.tsx`**

```tsx
// app/(travellog)/travellog/plan/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { useToast } from '@/components/ui/use-toast';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';
import { acceptTravelPlan } from '@/lib/travellog/acceptPlan';
import { TripIntakeForm } from './_components/TripIntakeForm';
import { ItineraryReview } from './_components/ItineraryReview';

export default function TravelLogPlanPage() {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [generated, setGenerated] = useState<{ req: ItineraryRequest; itinerary: Itinerary } | null>(null);
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    if (!generated || !profile) return;
    setAccepting(true);
    try {
      const { tasksCreated } = await acceptTravelPlan(supabase, profile.id, generated.req, generated.itinerary);
      toast({ description: `Trip saved — ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} created.` });
      router.push('/travellog/map');
    } catch (err) {
      toast({
        title: 'Could not save trip plan',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Plan" />
      <div className="p-4">
        {!generated ? (
          <TripIntakeForm onGenerated={(req, itinerary) => setGenerated({ req, itinerary })} />
        ) : (
          <ItineraryReview
            req={generated.req}
            itinerary={generated.itinerary}
            onAccept={handleAccept}
            onStartOver={() => setGenerated(null)}
            accepting={accepting}
          />
        )}
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "app/(travellog)/travellog/plan/page.tsx"
git commit -m "feat(travellog): wire Plan tab to intake form and itinerary review"
```

---

### Task 9: Documentation and full verification

**Files:**
- Modify: `app/(travellog)/README.md`

**Interfaces:** None (documentation + verification only).

- [ ] **Step 1: Update `app/(travellog)/README.md`**

Find the "What it does" bullet for Plan (currently describes it as a placeholder) and the "Data model" section. Update:

```markdown
- **Plan** (`/travellog/plan`) — AI-assisted trip planner (ported from
  IceMyVacation, using this codebase's OpenRouter infrastructure instead of
  DeepSeek). Fill in trip details, review a generated day-by-day itinerary,
  and accept to save the plan, auto-log it as a visit on the Map, and create
  TaskLog tasks (logistics + one per day).
```

Update the "Data model" section to add:

```markdown
Prisma models: `TravelVisit` (table `travellog_visits`), `TravelPlan` (table
`travellog_plans`). `Task` (TaskLog's model) gets an optional `travelPlanId`
back-reference. Shares the top-level `Profile` model with every other app.
```

Add to "Key files":

```
  travellog/plan/                   AI trip planner (intake → review → accept)
lib/travellog/itinerary.ts             Itinerary types + prompt builder
lib/travellog/acceptPlan.ts               Accept handler (save plan, log visit, create tasks)
app/api/ai/travellog/                        Itinerary generation + currency conversion
```

- [ ] **Step 2: Full type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors; only the two pre-existing warnings from before this plan started.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, sign in, then in the browser:
1. Navigate to `/travellog/plan`. Fill in a real destination (e.g. "Kyoto, Japan"), dates a few days apart, transport mode "Flight", a budget and currency. Submit.
2. Confirm a day-by-day itinerary renders: day tabs match the date range, each day has at least 3 activities with time/title/description/location/cost, the budget breakdown sums close to the total.
3. Change the "Convert to" currency and confirm a converted total appears (network tab shows a call to `/api/ai/travellog/currency` succeeding).
4. Click "Accept trip plan". Confirm the toast reports a task count and the page redirects to `/travellog/map`.
5. On `/travellog/map`, confirm the trip's destination appears as a hotspot (multi-day) with the correct dates.
6. Navigate to `/tasklog/board` (or wherever the Plan-lane inbox renders) and confirm the logistics tasks (book flights, accommodation, pack) and one task per itinerary day exist, each with the itinerary summary in its notes for the day tasks.
7. In Supabase, confirm a `travellog_plans` row exists with `status = 'accepted'` and the full itinerary JSON.

- [ ] **Step 4: Commit**

```bash
git add "app/(travellog)/README.md"
git commit -m "docs(travellog): document the AI trip planner in the app README"
```
