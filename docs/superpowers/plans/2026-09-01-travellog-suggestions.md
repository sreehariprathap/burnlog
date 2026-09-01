# TravelLog Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TravelLog's `/travellog/suggestions` tab: AI-generated affordable-trip suggestions computed from the user's real free time (TaskLog/LogBook), disposable income (MoneyLog), and upcoming public holidays in their configured country, with a "Plan this trip" action that deep-links into the existing AI trip planner with the suggestion prefilled.

**Architecture:** One new nullable `Profile.country` column, set from a new country picker in TravelLog's config page (mirroring MoneyLog's currency picker exactly). Three pure/async signal helpers (`lib/travellog/freeTime.ts`, `affordability.ts`, `holidays.ts`) compute free-time windows, disposable surplus, and holidays client-side from existing tables plus a free public holidays API (`date.nager.at`, no key, CORS-open). A new `app/api/ai/travellog/suggestions/route.ts` follows this codebase's established AI-route convention (OpenRouter, `getModel`, `formatAiError`) to turn those three signals into 3-5 destination suggestions. The Suggestions page renders them and "Plan this trip" navigates to `/travellog/plan?destination=...` — which requires adding a `useSearchParams()`-based prefill to the existing Plan page, wrapped in `Suspense` per this codebase's established Next.js 15 requirement (see commit `cf84af1`).

**Tech Stack:** Next.js API routes, `@supabase/ssr` browser client, `date-fns` (already a dependency, used by `lib/financePeriods.ts`), no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-travellog-suggestions-design.md`

## Global Constraints

- No test framework exists in this repo — verification is `npx tsc --noEmit` + `npm run lint` clean, plus manual browser checks (same bar as every prior plan in this repo).
- AI calls go through OpenRouter (`getModel(supabase, 'text')`, `formatAiError`) — never a hardcoded model, never a different provider.
- Any component that calls `useSearchParams()` must be wrapped in `<Suspense>` with a fallback, or `next build` fails with `missing-suspense-with-csr-bailout` (this exact class of bug was fixed across four pages in commit `cf84af1` — don't reintroduce it).
- `date.nager.at` calls are best-effort: a failed or empty holiday fetch must not block the rest of the Suggestions flow — treat it as "no known holidays," not an error.
- Full spec: `docs/superpowers/specs/2026-09-01-travellog-suggestions-design.md`

---

### Task 1: Database — `Profile.country` column

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `profiles.country` (nullable text column). Task 2's config page and Task 8/9's Suggestions page read/write this by exact name.

- [ ] **Step 1: Apply the migration to the live Supabase project**

Use `mcp__supabase__apply_migration` with name `add_profile_country` and this SQL:

```sql
alter table profiles add column country text;
```

- [ ] **Step 2: Verify the column exists**

Use `mcp__supabase__execute_sql`:
```sql
select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'country';
```
Expected: one row.

- [ ] **Step 3: Update `prisma/schema.prisma`**

Find the `Profile` model's `currency` line (`currency                 String    @default("CAD")`) and add directly after it:

```prisma
  currency                 String    @default("CAD")
  country                  String?
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(travellog): add Profile.country column"
```

---

### Task 2: Country list and TravelLog config picker

**Files:**
- Create: `lib/country.ts`
- Modify: `app/(travellog)/travellog/config/page.tsx`

**Interfaces:**
- Produces: `COUNTRIES: { code: string; label: string }[]`, `isCountryCode(value: string): boolean`. Task 9's Suggestions page consumes `profile.country` (no direct import of `COUNTRIES` needed there, just the stored value).

- [ ] **Step 1: Write `lib/country.ts`**

```ts
// lib/country.ts
// Structurally mirrors lib/currency.ts — no localStorage caching here since
// country is only ever read from a loaded `profile`, never formatted
// synchronously outside of that context the way currency is.

export const COUNTRIES = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'IE', label: 'Ireland' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'IN', label: 'India' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'DK', label: 'Denmark' },
  { code: 'JP', label: 'Japan' },
  { code: 'SG', label: 'Singapore' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];

export function isCountryCode(value: string): value is CountryCode {
  return COUNTRIES.some((c) => c.code === value);
}
```

- [ ] **Step 2: Replace `app/(travellog)/travellog/config/page.tsx`**

```tsx
// app/(travellog)/travellog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppConfigShell } from '@/components/AppConfigShell';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';
import { COUNTRIES } from '@/lib/country';
import { useToast } from '@/components/ui/use-toast';

export default function TravelLogConfigPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useCurrentProfile();

  const handleCountryChange = async (code: string) => {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ country: code }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save country', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
    toast({ description: 'Country updated' });
  };

  return (
    <AppConfigShell
      appName="TravelLog"
      exportData={() => ({})}
      bottomNav={<TravelLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>TravelLog settings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="country" className="font-medium">Country</Label>
          <p className="text-xs text-muted-foreground">Used to look up public holidays for trip suggestions.</p>
          <Select value={(profile?.country as string) ?? ''} onValueChange={handleCountryChange}>
            <SelectTrigger id="country" className="w-full"><SelectValue placeholder="Select your country" /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
```

- [ ] **Step 3: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add lib/country.ts "app/(travellog)/travellog/config/page.tsx"
git commit -m "feat(travellog): add country picker to TravelLog config"
```

---

### Task 3: Free-time window computation

**Files:**
- Create: `lib/travellog/freeTime.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FreeWindow { startDate: string; endDate: string; dayCount: number }`, `computeFreeWindows(blocks, tasks, fromDate: Date, horizonDays?: number): FreeWindow[]`. Task 9's Suggestions page and Task 6's suggestions request type both consume `FreeWindow` by exact shape.

- [ ] **Step 1: Write `lib/travellog/freeTime.ts`**

```ts
// lib/travellog/freeTime.ts
import { addDays, eachDayOfInterval, format } from 'date-fns';

export interface FreeWindow {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  dayCount: number;
}

interface BusyBlock {
  date: string;
}

interface BusyTask {
  dueDate: string | null;
  completedAt: string | null;
}

/**
 * Scans `horizonDays` days from `fromDate` for stretches with no MydayBlock
 * entry and no incomplete Task due that day. Consecutive free days group
 * into a window; single free days are discarded (not a trip).
 */
export function computeFreeWindows(
  blocks: BusyBlock[],
  tasks: BusyTask[],
  fromDate: Date,
  horizonDays: number = 60
): FreeWindow[] {
  const busyDates = new Set<string>();
  for (const b of blocks) busyDates.add(b.date);
  for (const t of tasks) {
    if (t.dueDate && !t.completedAt) busyDates.add(t.dueDate);
  }

  const days = eachDayOfInterval({ start: fromDate, end: addDays(fromDate, horizonDays - 1) });
  const windows: FreeWindow[] = [];
  let windowDays: Date[] = [];

  function flush() {
    if (windowDays.length >= 2) {
      windows.push({
        startDate: format(windowDays[0], 'yyyy-MM-dd'),
        endDate: format(windowDays[windowDays.length - 1], 'yyyy-MM-dd'),
        dayCount: windowDays.length,
      });
    }
    windowDays = [];
  }

  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    if (busyDates.has(key)) {
      flush();
    } else {
      windowDays.push(day);
    }
  }
  flush();

  return windows;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/travellog/freeTime.ts
git commit -m "feat(travellog): add free-time window computation"
```

---

### Task 4: Affordability signal

**Files:**
- Create: `lib/travellog/affordability.ts`

**Interfaces:**
- Consumes: `expandRecurringInRange`, `RecurringItemRow`, `FinanceLineItem` (`@/lib/financePeriods`, existing).
- Produces: `computeAverageMonthlySurplus(supabase: SupabaseClient, profileId: string): Promise<number>`. Task 9's Suggestions page calls this.

- [ ] **Step 1: Write `lib/travellog/affordability.ts`**

```ts
// lib/travellog/affordability.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { expandRecurringInRange, type RecurringItemRow, type FinanceLineItem } from '@/lib/financePeriods';

/**
 * Average monthly (income - expense) over the last 3 calendar months,
 * reusing the same recurring-item expansion MoneyLog's own period views use.
 * There is no stored running balance in this codebase — this average is
 * the honest "disposable surplus" signal available.
 */
export async function computeAverageMonthlySurplus(
  supabase: SupabaseClient,
  profileId: string
): Promise<number> {
  const now = new Date();
  const start = startOfMonth(subMonths(now, 2));
  const end = endOfMonth(now);

  const [recurringRes, transactionsRes] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase
      .from('finance_transactions')
      .select('*')
      .eq('profileId', profileId)
      .gte('date', start.toISOString())
      .lte('date', end.toISOString()),
  ]);

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  const transactions =
    (transactionsRes.data as { type: string; category: string; amount: number; date: string }[]) || [];

  const virtualItems = expandRecurringInRange(recurringItems, start, end);
  const allItems: FinanceLineItem[] = [
    ...virtualItems,
    ...transactions.map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
  ];

  let net = 0;
  for (const item of allItems) {
    if (item.type === 'income') net += item.amount;
    else if (item.type === 'expense') net -= item.amount;
  }

  return net / 3;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/travellog/affordability.ts
git commit -m "feat(travellog): add average-monthly-surplus affordability signal"
```

---

### Task 5: Holidays signal

**Files:**
- Create: `lib/travellog/holidays.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Holiday { date: string; name: string }`, `fetchUpcomingHolidays(countryCode: string, fromDate: Date, horizonDays?: number): Promise<Holiday[]>`. Task 9's Suggestions page and Task 6's suggestions request type both consume `Holiday` by exact shape.

- [ ] **Step 1: Write `lib/travellog/holidays.ts`**

```ts
// lib/travellog/holidays.ts
import { addDays, format } from 'date-fns';

export interface Holiday {
  date: string; // 'YYYY-MM-DD'
  name: string;
}

interface NagerHoliday {
  date: string;
  name: string;
  countryCode: string;
}

async function fetchYear(countryCode: string, year: number): Promise<NagerHoliday[]> {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`);
    if (!res.ok) return [];
    return (await res.json()) as NagerHoliday[];
  } catch {
    return [];
  }
}

/**
 * Fetches public holidays for `countryCode` falling within
 * [fromDate, fromDate + horizonDays]. Free, no API key (date.nager.at).
 * Best-effort: any fetch failure resolves to an empty array rather than
 * throwing — a missing holidays signal should never block suggestions.
 */
export async function fetchUpcomingHolidays(
  countryCode: string,
  fromDate: Date,
  horizonDays: number = 60
): Promise<Holiday[]> {
  const toDate = addDays(fromDate, horizonDays);
  const years = Array.from(new Set([fromDate.getFullYear(), toDate.getFullYear()]));

  const results = await Promise.all(years.map((year) => fetchYear(countryCode, year)));
  const all = results.flat();

  const fromKey = format(fromDate, 'yyyy-MM-dd');
  const toKey = format(toDate, 'yyyy-MM-dd');

  return all
    .filter((h) => h.date >= fromKey && h.date <= toKey)
    .map((h) => ({ date: h.date, name: h.name }));
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/travellog/holidays.ts
git commit -m "feat(travellog): add upcoming-holidays signal (date.nager.at)"
```

---

### Task 6: Suggestions types and prompt builder

**Files:**
- Create: `lib/travellog/suggestions.ts`

**Interfaces:**
- Consumes: `FreeWindow` (Task 3, imported here as `FreeWindowInput` for the request shape), `Holiday` (Task 5, as `HolidayInput`).
- Produces: `SuggestionsRequest`, `TripSuggestion`, `SuggestionsResponse` types; `buildSuggestionsSystemPrompt(): string`; `buildSuggestionsUserPrompt(req: SuggestionsRequest): string`; `validateSuggestionsResponse(raw: unknown, freeWindows: FreeWindowInput[]): SuggestionsResponse`. Task 7's API route and Task 9's UI both import these by exact name.

- [ ] **Step 1: Write `lib/travellog/suggestions.ts`**

```ts
// lib/travellog/suggestions.ts

export interface FreeWindowInput {
  startDate: string;
  endDate: string;
  dayCount: number;
}

export interface HolidayInput {
  date: string;
  name: string;
}

export interface SuggestionsRequest {
  freeWindows: FreeWindowInput[];
  averageMonthlySurplus: number;
  currency: string;
  country: string;
  holidays: HolidayInput[];
}

export interface TripSuggestion {
  destination: string;
  startDate: string;
  endDate: string;
  estimatedCost: number;
  currency: string;
  rationale: string;
}

export interface SuggestionsResponse {
  suggestions: TripSuggestion[];
}

export function buildSuggestionsSystemPrompt(): string {
  return 'You are a budget-conscious travel advisor. Given a traveller\'s actual free-time windows, disposable income, and upcoming public holidays, you suggest realistic, affordable trips. You respond with valid JSON only — no markdown, no prose, no code fences.';
}

export function buildSuggestionsUserPrompt(req: SuggestionsRequest): string {
  const windowsList = req.freeWindows
    .map((w) => `- ${w.startDate} to ${w.endDate} (${w.dayCount} days)`)
    .join('\n');
  const holidaysList = req.holidays.length > 0
    ? req.holidays.map((h) => `- ${h.date}: ${h.name}`).join('\n')
    : 'None in this period.';

  return `Suggest 3 to 5 affordable trips for a traveller in ${req.country}.

Available free-time windows (the ONLY dates you may use):
${windowsList}

Average monthly disposable surplus: ${req.averageMonthlySurplus} ${req.currency}
Upcoming public holidays in ${req.country}:
${holidaysList}

Requirements:
- Each suggestion's startDate and endDate MUST fall entirely within one of the listed free-time windows (do not invent dates outside them).
- Prefer windows that align with or extend a public holiday where one falls nearby.
- estimatedCost is a realistic total trip cost in ${req.currency} and should not substantially exceed the average monthly surplus (${req.averageMonthlySurplus} ${req.currency}) unless no cheaper realistic option fits the window.
- rationale is one sentence explaining why this trip fits (mention the window, budget fit, or a nearby holiday specifically).
- destination should be a real, specific place (city + country or region), not vague.

Respond with ONLY valid JSON matching this schema exactly:
{
  "suggestions": [
    {
      "destination": "Place name, Country",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "estimatedCost": 450.0,
      "currency": "${req.currency}",
      "rationale": "One sentence explaining the fit."
    }
  ]
}`;
}

function isWithinAnyWindow(start: string, end: string, windows: FreeWindowInput[]): boolean {
  return windows.some((w) => start >= w.startDate && end <= w.endDate);
}

function isTripSuggestion(v: unknown): v is TripSuggestion {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.destination === 'string' &&
    typeof s.startDate === 'string' &&
    typeof s.endDate === 'string' &&
    typeof s.estimatedCost === 'number' &&
    typeof s.currency === 'string' &&
    typeof s.rationale === 'string'
  );
}

/**
 * Validates a raw AI JSON response. Unlike the itinerary route's all-or-
 * nothing validation, this drops any individual suggestion that is
 * malformed or whose dates fall outside the supplied free windows, rather
 * than failing the whole response — losing 1 of 3-5 suggestions is fine;
 * losing an entire itinerary generation is not, which is why the two
 * routes use different failure tolerances.
 */
export function validateSuggestionsResponse(raw: unknown, freeWindows: FreeWindowInput[]): SuggestionsResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.suggestions) || r.suggestions.length === 0) {
    throw new Error('AI response is missing a "suggestions" array');
  }

  const valid = r.suggestions
    .filter(isTripSuggestion)
    .filter((s) => isWithinAnyWindow(s.startDate, s.endDate, freeWindows));

  if (valid.length === 0) {
    throw new Error('AI response contained no suggestions within the supplied free-time windows');
  }

  return { suggestions: valid };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/travellog/suggestions.ts
git commit -m "feat(travellog): add suggestions types and prompt builder"
```

---

### Task 7: AI suggestions API route

**Files:**
- Create: `app/api/ai/travellog/suggestions/route.ts`

**Interfaces:**
- Consumes: `SuggestionsRequest`, `buildSuggestionsSystemPrompt`, `buildSuggestionsUserPrompt`, `validateSuggestionsResponse` (Task 6); `getModel` (`@/lib/ai/modelConfig`, existing); `formatAiError` (`@/lib/ai/errors`, existing).
- Produces: `POST /api/ai/travellog/suggestions` — request body `SuggestionsRequest`, success response `SuggestionsResponse` JSON, error response `{ error: string }`. Task 9's Suggestions page calls this.

- [ ] **Step 1: Write `app/api/ai/travellog/suggestions/route.ts`**

```ts
// app/api/ai/travellog/suggestions/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import {
  buildSuggestionsSystemPrompt,
  buildSuggestionsUserPrompt,
  validateSuggestionsResponse,
  type SuggestionsRequest,
} from '@/lib/travellog/suggestions';

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

    const body = (await request.json()) as Partial<SuggestionsRequest>;
    if (!body.freeWindows || body.freeWindows.length === 0 || !body.country || !body.currency) {
      return NextResponse.json({ error: 'Missing required suggestion inputs' }, { status: 400 });
    }

    const req: SuggestionsRequest = {
      freeWindows: body.freeWindows,
      averageMonthlySurplus: body.averageMonthlySurplus ?? 0,
      currency: body.currency,
      country: body.country,
      holidays: body.holidays ?? [],
    };

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      messages: [
        { role: 'system', content: buildSuggestionsSystemPrompt() },
        { role: 'user', content: buildSuggestionsUserPrompt(req) },
      ],
      response_format: { type: 'json_object' },
    });

    if (!completion.choices || completion.choices.length === 0) {
      const providerError = (completion as unknown as { error?: { message?: string } }).error;
      throw new Error(providerError?.message || 'AI provider returned no response choices');
    }

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = validateSuggestionsResponse(parsed, req.freeWindows);
    return NextResponse.json(result);
  } catch (error) {
    console.error('travellog suggestions error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/travellog/suggestions/route.ts
git commit -m "feat(travellog): add AI suggestions endpoint via OpenRouter"
```

---

### Task 8: Deep-link — prefill the Plan tab from a suggestion

**Files:**
- Modify: `app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx`
- Modify: `app/(travellog)/travellog/plan/page.tsx`

**Interfaces:**
- Consumes: `ItineraryRequest` (existing, from `lib/travellog/itinerary.ts`).
- Produces: `TripIntakeForm` now accepts an optional `initial?: Partial<ItineraryRequest>` prop. Task 9's Suggestions page navigates to `/travellog/plan` with query params this page reads into that shape.

- [ ] **Step 1: Add the `initial` prop to `TripIntakeForm`**

In `app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx`, change the props type and the `useState` initializers:

```tsx
type TripIntakeFormProps = {
  onGenerated: (req: ItineraryRequest, itinerary: Itinerary) => void;
  initial?: Partial<ItineraryRequest>;
};

export function TripIntakeForm({ onGenerated, initial }: TripIntakeFormProps) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [hotel, setHotel] = useState(initial?.hotel ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [numPeople, setNumPeople] = useState(String(initial?.numPeople ?? 1));
  const [transportMode, setTransportMode] = useState<TransportMode>(initial?.transportMode ?? 'public_transit');
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : '');
  const [budgetCurrency, setBudgetCurrency] = useState(initial?.budgetCurrency ?? 'USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

(Only the `initial` prop and the six `useState` initializer changes are new; the rest of the component — `handleSubmit`, the JSX form — is unchanged.)

- [ ] **Step 2: Replace `app/(travellog)/travellog/plan/page.tsx`**

Split into a `Suspense`-wrapped inner component (needed because it now calls `useSearchParams()` — see this plan's Global Constraints and commit `cf84af1`):

```tsx
// app/(travellog)/travellog/plan/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { useToast } from '@/components/ui/use-toast';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';
import { acceptTravelPlan } from '@/lib/travellog/acceptPlan';
import { TripIntakeForm } from './_components/TripIntakeForm';
import { ItineraryReview } from './_components/ItineraryReview';

function PlanPageInner() {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const initial: Partial<ItineraryRequest> | undefined = searchParams.get('destination')
    ? {
        destination: searchParams.get('destination') ?? undefined,
        startDate: searchParams.get('startDate') ?? undefined,
        endDate: searchParams.get('endDate') ?? undefined,
        budget: searchParams.get('budget') ? Number(searchParams.get('budget')) : null,
        budgetCurrency: searchParams.get('budgetCurrency') ?? undefined,
      }
    : undefined;

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
          <TripIntakeForm initial={initial} onGenerated={(req, itinerary) => setGenerated({ req, itinerary })} />
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

export default function TravelLogPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <PlanPageInner />
    </Suspense>
  );
}
```

- [ ] **Step 3: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 4: Verify the production build succeeds**

Run: `npm run build`
Expected: build completes with no `missing-suspense-with-csr-bailout` error for `/travellog/plan` (this is the exact failure class commit `cf84af1` fixed elsewhere — confirm it doesn't reappear here).

- [ ] **Step 5: Commit**

```bash
git add "app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx" "app/(travellog)/travellog/plan/page.tsx"
git commit -m "feat(travellog): prefill Plan tab from a Suggestions deep-link"
```

---

### Task 9: Suggestions page UI

**Files:**
- Modify: `app/(travellog)/travellog/suggestions/page.tsx` (currently the foundation plan's placeholder)

**Interfaces:**
- Consumes: `computeFreeWindows`, `FreeWindow` (Task 3); `computeAverageMonthlySurplus` (Task 4); `fetchUpcomingHolidays`, `Holiday` (Task 5); `TripSuggestion` (Task 6); `useCurrentProfile` (existing).
- Produces: nothing consumed by later tasks (leaf page).

- [ ] **Step 1: Replace `app/(travellog)/travellog/suggestions/page.tsx`**

```tsx
// app/(travellog)/travellog/suggestions/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { computeFreeWindows, type FreeWindow } from '@/lib/travellog/freeTime';
import { computeAverageMonthlySurplus } from '@/lib/travellog/affordability';
import { fetchUpcomingHolidays, type Holiday } from '@/lib/travellog/holidays';
import type { TripSuggestion } from '@/lib/travellog/suggestions';

const HORIZON_DAYS = 60;

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export default function TravelLogSuggestionsPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [signalsLoading, setSignalsLoading] = useState(true);
  const [freeWindows, setFreeWindows] = useState<FreeWindow[]>([]);
  const [surplus, setSurplus] = useState(0);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [suggestions, setSuggestions] = useState<TripSuggestion[] | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!profile || !profile.country) {
      setSignalsLoading(false);
      return;
    }
    let cancelled = false;
    setSignalsLoading(true);

    (async () => {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + HORIZON_DAYS);
      const fromKey = from.toISOString().slice(0, 10);
      const toKey = to.toISOString().slice(0, 10);

      const [blocksRes, tasksRes, holidaysResult, surplusResult] = await Promise.all([
        supabase.from('myday_blocks').select('date').eq('profileId', profile.id).gte('date', fromKey).lte('date', toKey),
        supabase.from('tasklog_tasks').select('dueDate, completedAt').eq('profileId', profile.id).gte('dueDate', fromKey).lte('dueDate', toKey),
        fetchUpcomingHolidays(profile.country as string, from, HORIZON_DAYS),
        computeAverageMonthlySurplus(supabase, profile.id),
      ]);

      if (cancelled) return;

      const windows = computeFreeWindows(
        (blocksRes.data as { date: string }[]) || [],
        (tasksRes.data as { dueDate: string | null; completedAt: string | null }[]) || [],
        from,
        HORIZON_DAYS
      );

      setFreeWindows(windows);
      setHolidays(holidaysResult);
      setSurplus(surplusResult);
      setSignalsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, supabase]);

  async function handleGenerate() {
    if (!profile) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/travellog/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          freeWindows,
          averageMonthlySurplus: surplus,
          currency: (profile.currency as string) || 'USD',
          country: profile.country,
          holidays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate suggestions');
      setSuggestions(data.suggestions);
    } catch (err) {
      toast({
        title: 'Could not generate suggestions',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  }

  function handlePlanTrip(s: TripSuggestion) {
    const params = new URLSearchParams({
      destination: s.destination,
      startDate: s.startDate,
      endDate: s.endDate,
      budget: String(s.estimatedCost),
      budgetCurrency: s.currency,
    });
    router.push(`/travellog/plan?${params.toString()}`);
  }

  const loading = profileLoading || signalsLoading;

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Suggestions" />
      <div className="p-4 flex flex-col gap-4">
        {!profileLoading && !profile?.country ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Set your country to get trip suggestions.</p>
              <Button size="sm" onClick={() => router.push('/travellog/config')}>Go to Config</Button>
            </CardContent>
          </Card>
        ) : loading ? (
          <Skeleton className="w-full h-32 rounded-lg" />
        ) : freeWindows.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No free stretches found in the next {HORIZON_DAYS} days — suggestions need at least a couple of open days.
            </CardContent>
          </Card>
        ) : (
          <>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="animate-spin w-5 h-5" /> : 'Refresh suggestions'}
            </Button>
            {suggestions?.map((s, i) => (
              <Card key={i}>
                <CardContent className="pt-4 flex flex-col gap-2">
                  <p className="font-medium">{s.destination}</p>
                  <p className="text-xs text-muted-foreground">{s.startDate} – {s.endDate}</p>
                  <p className="text-sm font-semibold text-primary">{formatCurrency(s.estimatedCost, s.currency)}</p>
                  <p className="text-sm text-muted-foreground">{s.rationale}</p>
                  <Button size="sm" onClick={() => handlePlanTrip(s)}>Plan this trip</Button>
                </CardContent>
              </Card>
            ))}
          </>
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
git add "app/(travellog)/travellog/suggestions/page.tsx"
git commit -m "feat(travellog): wire Suggestions tab to signals and AI endpoint"
```

---

### Task 10: Documentation and full verification

**Files:**
- Modify: `app/(travellog)/README.md`

**Interfaces:** None (documentation + verification only).

- [ ] **Step 1: Update `app/(travellog)/README.md`**

Find the "What it does" bullet for Suggestions (currently describes it as a placeholder) and the "Data model" section. Update:

```markdown
- **Suggestions** (`/travellog/suggestions`) — AI-generated affordable-trip
  suggestions based on real free-time windows (TaskLog/LogBook),
  disposable income (MoneyLog), and upcoming public holidays in the
  user's configured country. "Plan this trip" deep-links into the Plan
  tab with the suggestion prefilled.
```

Update the "Data model" section to note the new `Profile.country` field:

```markdown
`Profile.country` (nullable, set from TravelLog's config page) drives the
Suggestions tab's holiday lookup.
```

Add to "Key files":

```
  travellog/suggestions/               Suggestions (free time + income + holidays → AI picks)
lib/travellog/freeTime.ts                  Free-time window computation
lib/travellog/affordability.ts                Disposable-surplus signal
lib/travellog/holidays.ts                        Upcoming public holidays (date.nager.at)
lib/travellog/suggestions.ts                        Suggestion types + prompt builder
lib/country.ts                                          Country list for config
```

- [ ] **Step 2: Full type-check, lint, and production build**

Run: `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: no errors; only the two pre-existing lint warnings from before this plan started; production build completes cleanly (confirms Task 8's Suspense fix holds under `next build`, not just `next dev`).

- [ ] **Step 3: Manual verification**

Run `npm run dev`, sign in, then in the browser:
1. Navigate to `/travellog/suggestions` with no country set — confirm the "Set your country" prompt shows and links to Config.
2. Go to `/travellog/config`, set a country, confirm the toast and that the value persists on reload.
3. Back on `/travellog/suggestions`, confirm it now either shows the "no free stretches" empty state or the "Refresh suggestions" button, depending on whether the signed-in profile has any MydayBlock/Task entries in the next 60 days.
4. If free windows exist, tap "Refresh suggestions" and confirm 3-5 cards render, each with a destination, date range within a real free window, a cost, and a rationale.
5. Tap "Plan this trip" on one card — confirm `/travellog/plan` loads with the intake form pre-filled (destination, dates, budget, currency) rather than blank.
6. Confirm generating the itinerary from the prefilled form still works end-to-end (this exercises the existing Plan tab flow, now reached via a second entry point).

- [ ] **Step 4: Commit**

```bash
git add "app/(travellog)/README.md"
git commit -m "docs(travellog): document the Suggestions tab in the app README"
```
