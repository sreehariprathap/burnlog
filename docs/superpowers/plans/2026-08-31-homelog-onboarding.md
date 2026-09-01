# HomeLog AI Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `/homelog/onboarding` flow lets a user create or join a household, then (only when creating) get AI-suggested starter chores via a new endpoint modeled on TaskLog's breakdown route, and plugs into the sub-project 2.0 orchestrator.

**Architecture:** A step-state client component (`welcome` → `household` → conditionally `chores` → `done`), reusing every existing HomeLog API route (`/api/homelog/households`, `/api/homelog/invites`, `/api/homelog/chores`) as-is, plus one new small AI route for chore suggestions structured identically to `/api/ai/tasklog/breakdown`.

**Tech Stack:** Next.js App Router (client components + one new Route Handler), Supabase JS client, OpenAI SDK against OpenRouter (existing `lib/ai/modelConfig.ts`/`lib/ai/errors.ts`), shadcn/ui, lucide-react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-31-homelog-onboarding-design.md`

## Global Constraints

- `/homelog`'s existing inline household-creation/invite UI is untouched — the onboarding step components are fresh, not an extraction/refactor of that page.
- All household/chore writes go through existing API routes (`POST /api/homelog/households`, `POST /api/homelog/invites/[id]/accept`, `POST /api/homelog/invites/[id]/decline`, `POST /api/homelog/chores`) — no direct Supabase table writes from onboarding code, since these routes already handle server-side household-membership derivation and validation.
- The chore-suggestion step is reached only after creating a new household (`onCreated`), never after joining one (`onJoined`) — joining means the household already belongs to someone else's setup.
- If the AI chore-suggestion call fails, skip straight to Done with a toast rather than blocking — same rule sub-project 2.1 established.
- The flow reads `returnTo` from `useSearchParams()` (default `/homelog`) from the start.

---

### Task 1: AI chore-suggestion endpoint

**Files:**
- Create: `app/api/ai/homelog/suggest-chores/route.ts`

**Interfaces:**
- Produces: `POST /api/ai/homelog/suggest-chores` — body `{ householdName: string }`, success response `{ chores: ChoreSuggestion[] }` where `ChoreSuggestion = { title: string; category: 'cleaning' | 'maintenance' | 'other'; frequency: 'weekly' | 'monthly' | 'yearly'; dayOfWeek: number | null }`, error response `{ error: string }`.

- [ ] **Step 1: Write the route**

```ts
// app/api/ai/homelog/suggest-chores/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

function buildPrompt(householdName: string): string {
  return `You are helping a household get started with chore tracking.

Household name: ${householdName}

Suggest 5 to 8 common recurring household chores spanning cleaning, maintenance, and other categories. Each chore should be concrete and commonly needed (e.g. "Take out trash", "Clean bathroom", "Vacuum living room", "Change air filter", "Water plants").

Respond with ONLY a JSON object, no markdown, in this exact shape:
{"chores": [{"title": "...", "category": "cleaning, maintenance, or other", "frequency": "weekly, monthly, or yearly", "dayOfWeek": 0-6 or null}]}

dayOfWeek should only be set for weekly chores (0=Sunday..6=Saturday), null otherwise.`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { householdName } = (await request.json()) as { householdName?: string };
    if (!householdName || !householdName.trim()) {
      return NextResponse.json({ error: 'Missing household name' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [{ role: 'user', content: buildPrompt(householdName) }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { chores?: Array<{ title?: string; category?: string; frequency?: string; dayOfWeek?: number | null }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.chores || parsed.chores.length === 0) {
      return NextResponse.json({ error: 'AI response contained no chores' }, { status: 502 });
    }

    const chores = parsed.chores
      .filter((c) => c.title && c.title.trim())
      .map((c) => {
        const frequency = (['weekly', 'monthly', 'yearly'].includes(c.frequency || '') ? c.frequency : 'weekly') as
          | 'weekly'
          | 'monthly'
          | 'yearly';
        return {
          title: c.title!.trim(),
          category: (['cleaning', 'maintenance', 'other'].includes(c.category || '') ? c.category : 'other') as
            | 'cleaning'
            | 'maintenance'
            | 'other',
          frequency,
          dayOfWeek: frequency === 'weekly' && typeof c.dayOfWeek === 'number' ? c.dayOfWeek : null,
        };
      });

    return NextResponse.json({ chores });
  } catch (error) {
    console.error('homelog suggest-chores error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/homelog/suggest-chores/route.ts
git commit -m "feat(homelog): add AI chore-suggestion endpoint"
```

---

### Task 2: Step components — Welcome, HouseholdSetup, ChoreSuggestionReviewSheet, Done

**Files:**
- Create: `app/(homelog)/homelog/onboarding/_components/WelcomeStep.tsx`
- Create: `app/(homelog)/homelog/onboarding/_components/HouseholdSetupStep.tsx`
- Create: `app/(homelog)/homelog/onboarding/_components/ChoreSuggestionReviewSheet.tsx`
- Create: `app/(homelog)/homelog/onboarding/_components/DoneStep.tsx`

**Interfaces:**
- Produces:
  - `WelcomeStep({ onStart, onSkip }: { onStart: () => void; onSkip: () => void })`
  - `HouseholdSetupStep({ onCreated, onJoined }: { onCreated: (household: { id: string; name: string }) => void; onJoined: () => void })`
  - `ChoreSuggestion = { title: string; category: 'cleaning' | 'maintenance' | 'other'; frequency: 'weekly' | 'monthly' | 'yearly'; dayOfWeek: number | null }` (exported from `ChoreSuggestionReviewSheet.tsx`)
  - `ChoreSuggestionReviewSheet({ open, onOpenChange, suggestions, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; suggestions: ChoreSuggestion[]; onConfirm: (selected: ChoreSuggestion[]) => Promise<void> })`
  - `DoneStep({ choreCount, onFinish }: { choreCount: number; onFinish: () => void })`

- [ ] **Step 1: Write `WelcomeStep.tsx`**

```tsx
// app/(homelog)/homelog/onboarding/_components/WelcomeStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface WelcomeStepProps {
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onStart, onSkip }: WelcomeStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Let&apos;s set up HomeLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create your household or join one you&apos;ve been invited to. If you&apos;re starting a new household,
          we&apos;ll suggest some starter chores too.
        </p>
        <div className="flex gap-2">
          <Button onClick={onStart}>Get started</Button>
          <Button variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `HouseholdSetupStep.tsx`**

```tsx
// app/(homelog)/homelog/onboarding/_components/HouseholdSetupStep.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface PendingInvite {
  id: string;
  householdId: string;
  householdName: string;
  invitedByUsername: string;
  createdAt: string;
}

interface HouseholdSetupStepProps {
  onCreated: (household: { id: string; name: string }) => void;
  onJoined: () => void;
}

export function HouseholdSetupStep({ onCreated, onJoined }: HouseholdSetupStepProps) {
  const { toast } = useToast();
  const [householdName, setHouseholdName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/homelog/invites');
        const body = await res.json();
        setInvites(body.invites ?? []);
      } finally {
        setInvitesLoading(false);
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!householdName.trim()) {
      setCreateError('Please enter a household name');
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      const res = await fetch('/api/homelog/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: householdName.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create household');
      onCreated(body.household);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create household';
      setCreateError(message);
      toast({ title: 'Failed to create household', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRespond(inviteId: string, action: 'accept' | 'decline') {
    setRespondingId(inviteId);
    try {
      const res = await fetch(`/api/homelog/invites/${inviteId}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to update invite');
      if (action === 'accept') {
        onJoined();
        return;
      }
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      toast({
        title: 'Failed to update invite',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Create a household</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-household-name">Household name</Label>
              <Input
                id="onboarding-household-name"
                autoFocus
                autoComplete="off"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. The Smith House"
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create household'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {!invitesLoading && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{invite.householdName}</p>
                  <p className="text-xs text-muted-foreground">Invited by @{invite.invitedByUsername}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleRespond(invite.id, 'accept')}
                    disabled={respondingId === invite.id}
                  >
                    {respondingId === invite.id ? 'Saving…' : 'Accept'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRespond(invite.id, 'decline')}
                    disabled={respondingId === invite.id}
                  >
                    {respondingId === invite.id ? 'Saving…' : 'Decline'}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `ChoreSuggestionReviewSheet.tsx`**

```tsx
// app/(homelog)/homelog/onboarding/_components/ChoreSuggestionReviewSheet.tsx
'use client';

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export interface ChoreSuggestion {
  title: string;
  category: 'cleaning' | 'maintenance' | 'other';
  frequency: 'weekly' | 'monthly' | 'yearly';
  dayOfWeek: number | null;
}

interface ChoreSuggestionReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: ChoreSuggestion[];
  onConfirm: (selected: ChoreSuggestion[]) => Promise<void>;
}

export function ChoreSuggestionReviewSheet({ open, onOpenChange, suggestions, onConfirm }: ChoreSuggestionReviewSheetProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<(ChoreSuggestion & { selected: boolean })[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(suggestions.map((s) => ({ ...s, selected: true })));
  }, [suggestions]);

  function updateTitle(index: number, title: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, title } : item)));
  }

  function toggleSelected(index: number) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item)));
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const selected = items.filter((item) => item.selected).map(({ selected: _selected, ...rest }) => rest);
      await onConfirm(selected);
    } catch (err) {
      toast({
        title: 'Failed to add chores',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Review suggested chores</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto px-4">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border p-2">
              <Checkbox
                checked={item.selected}
                onCheckedChange={() => toggleSelected(index)}
                aria-label={`Include chore "${item.title}"`}
              />
              <Label htmlFor={`chore-title-${index}`} className="sr-only">Chore title</Label>
              <Input
                id={`chore-title-${index}`}
                value={item.title}
                onChange={(e) => updateTitle(index, e.target.value)}
                className="h-8 flex-1"
                autoComplete="off"
                autoFocus={index === 0}
              />
              <span className="text-xs capitalize text-muted-foreground">{item.frequency}</span>
            </div>
          ))}
        </div>
        <DrawerFooter>
          <Button type="button" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Adding…' : `Add ${selectedCount} selected`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Write `DoneStep.tsx`**

```tsx
// app/(homelog)/homelog/onboarding/_components/DoneStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PartyPopper } from 'lucide-react';

interface DoneStepProps {
  choreCount: number;
  onFinish: () => void;
}

export function DoneStep({ choreCount, onFinish }: DoneStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-amber-500" />
          Your household is set up!
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {choreCount > 0
            ? `${choreCount} starter chore${choreCount === 1 ? '' : 's'} ready to go.`
            : 'Add chores anytime from the Chores tab.'}
        </p>
        <Button className="w-full" onClick={onFinish}>
          Go to HomeLog
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors (these components have no consumers yet).

- [ ] **Step 6: Commit**

```bash
git add "app/(homelog)/homelog/onboarding/_components/WelcomeStep.tsx" "app/(homelog)/homelog/onboarding/_components/HouseholdSetupStep.tsx" "app/(homelog)/homelog/onboarding/_components/ChoreSuggestionReviewSheet.tsx" "app/(homelog)/homelog/onboarding/_components/DoneStep.tsx"
git commit -m "feat(homelog): add onboarding step components"
```

---

### Task 3: `HomeLogOnboardingFlow` + page

**Files:**
- Create: `app/(homelog)/homelog/onboarding/_components/HomeLogOnboardingFlow.tsx`
- Create: `app/(homelog)/homelog/onboarding/page.tsx`

**Interfaces:**
- Consumes: `WelcomeStep`, `HouseholdSetupStep`, `ChoreSuggestionReviewSheet`, `ChoreSuggestion`, `DoneStep` (Task 2).
- Produces: `/homelog/onboarding` route rendering `<HomeLogOnboardingFlow />`.

- [ ] **Step 1: Write `HomeLogOnboardingFlow.tsx`**

```tsx
// app/(homelog)/homelog/onboarding/_components/HomeLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { WelcomeStep } from './WelcomeStep';
import { HouseholdSetupStep } from './HouseholdSetupStep';
import { ChoreSuggestionReviewSheet, type ChoreSuggestion } from './ChoreSuggestionReviewSheet';
import { DoneStep } from './DoneStep';

type Step = 'welcome' | 'household' | 'chores' | 'done';

export function HomeLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/homelog';
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('welcome');
  const [suggestions, setSuggestions] = useState<ChoreSuggestion[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [choreCount, setChoreCount] = useState(0);

  function handleStart() {
    setStep('household');
  }

  function handleSkip() {
    router.replace(returnTo);
  }

  async function handleCreated(household: { id: string; name: string }) {
    setStep('chores');
    setLoadingSuggestions(true);
    try {
      const res = await fetch('/api/ai/homelog/suggest-chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdName: household.name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to generate chore suggestions');
      setSuggestions(body.chores);
      setReviewOpen(true);
    } catch (err) {
      toast({
        title: "Couldn't generate chore suggestions",
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
      setStep('done');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function handleJoined() {
    setStep('done');
  }

  async function handleReviewConfirm(selected: ChoreSuggestion[]) {
    let created = 0;
    for (const chore of selected) {
      const res = await fetch('/api/homelog/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: chore.title,
          category: chore.category,
          frequency: chore.frequency,
          dayOfWeek: chore.dayOfWeek,
          dayOfMonth: null,
          monthOfYear: null,
          dueDate: new Date().toISOString().slice(0, 10),
        }),
      });
      if (res.ok) created += 1;
    }
    setChoreCount(created);
    setReviewOpen(false);
    setStep('done');
  }

  function handleFinish() {
    router.replace(returnTo);
  }

  if (step === 'welcome') {
    return <WelcomeStep onStart={handleStart} onSkip={handleSkip} />;
  }
  if (step === 'household') {
    return <HouseholdSetupStep onCreated={handleCreated} onJoined={handleJoined} />;
  }
  if (step === 'chores') {
    return (
      <>
        {loadingSuggestions && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm text-muted-foreground">Thinking of some starter chores…</p>
          </div>
        )}
        <ChoreSuggestionReviewSheet
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          suggestions={suggestions}
          onConfirm={handleReviewConfirm}
        />
      </>
    );
  }
  return <DoneStep choreCount={choreCount} onFinish={handleFinish} />;
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
// app/(homelog)/homelog/onboarding/page.tsx
'use client';

import { HomeLogOnboardingFlow } from './_components/HomeLogOnboardingFlow';

export default function HomeLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <HomeLogOnboardingFlow />
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: no new warnings beyond the two pre-existing unrelated ones.

- [ ] **Step 5: Commit**

```bash
git add "app/(homelog)/homelog/onboarding/_components/HomeLogOnboardingFlow.tsx" "app/(homelog)/homelog/onboarding/page.tsx"
git commit -m "feat(homelog): add onboarding flow at /homelog/onboarding"
```

---

### Task 4: Orchestrator + config wiring

**Files:**
- Modify: `app/onboarding/sequence/page.tsx`
- Modify: `app/(homelog)/homelog/config/page.tsx`

- [ ] **Step 1: Register HomeLog in the orchestrator**

In `app/onboarding/sequence/page.tsx`:

```diff
 const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
   burnlog: '/ai-setup',
   moneylog: '/moneylog/onboarding',
   tasklog: '/tasklog/onboarding',
+  homelog: '/homelog/onboarding',
 };
```

- [ ] **Step 2: Add `onboardingHref` to HomeLog's config page**

In `app/(homelog)/homelog/config/page.tsx`:

```diff
     <AppConfigShell
       appName="HomeLog"
+      onboardingHref="/homelog/onboarding?returnTo=/homelog/config"
       exportData={() => ({})}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. From `/onboarding/apps`, select HomeLog, confirm it lands on `/homelog/onboarding`, create a household, confirm the AI chore-suggestion review shows real suggestions, confirm accepted chores appear on `/homelog/chores` with a due instance. With a second test account invited to that household, run their onboarding and confirm accepting the invite skips straight to Done. Visit `/homelog/config`, click "Reonboard into HomeLog", confirm it returns to `/homelog/config`.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors or warnings beyond the two pre-existing unrelated ones.

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/sequence/page.tsx "app/(homelog)/homelog/config/page.tsx"
git commit -m "feat(homelog): wire onboarding into orchestrator and config Reonboard"
```

---

## Post-plan note

This plan completes sub-project 2.2 (HomeLog AI Onboarding). Next:
sub-project 2.3 (SocialLog), then 2.4 (ShoppingLog), each plugging
into `ONBOARDING_ROUTES` the same way. Each needs its own
brainstorm → spec → plan cycle.
