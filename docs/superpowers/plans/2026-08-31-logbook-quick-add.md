# Logbook Quick-Add Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, linearly (no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Logbook's duplicated Meal/Expense mini-forms with the real, AI-assisted BurnLog/MoneyLog modals, and add Workout/Steps/Walk quick-add options that don't exist in Logbook today.

**Architecture:** `QuickAddFab` (`app/(logbook)/logbook/_components/QuickAddFab.tsx`) keeps its own picker drawer (grid of option tiles), but instead of branching to inline form components it mounts the already-existing `LogCaloriesModal`, `LogWorkoutModal`, `LogStepsModal`, `WalkTrackerModal` (all from `app/(burnlog)/dashboard/_components/quick-log/`) and `LogTransactionModal` (from `app/(moneylog)/moneylog/_components/`). Every one of these modals already implements the exact `{ profileId, onClose, onSaved }` interface and renders its own `<Drawer open>` — confirmed by reading all five files and the existing `QuickLogFab.tsx` mount-when-selected pattern that already composes them this way in BurnLog's own dashboard.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `lucide-react` icons, existing `components/ui/drawer.tsx` (Radix/vaul-based), no new dependencies.

## Global Constraints

- No test framework exists in this repo. Verification is `npx tsc --noEmit` + manual in-browser checks (this repo's established convention, confirmed in `docs/superpowers/plans/2026-08-22-lifelog-core-features.md`).
- Do not modify `LogCaloriesModal`, `LogWorkoutModal`, `LogStepsModal`, `WalkTrackerModal`, or `LogTransactionModal` themselves — they are reused as-is.
- Keep the existing `TaskForm` (quick mark-done) and `SleepComingSoon` behavior unchanged in this plan (Task gains AI categorization in a separate plan).
- `@/*` resolves to the repo root (`tsconfig.json`), so cross-route-group imports like `@/app/(burnlog)/dashboard/_components/quick-log/LogWorkoutModal` are valid and already used elsewhere (`LogCaloriesModal` itself imports `FoodScanner` from `app/(burnlog)/goals/_components/`).

---

### Task 1: Swap Meal/Expense for the real modals, add Workout/Steps/Walk

**Files:**
- Modify: `app/(logbook)/logbook/_components/QuickAddFab.tsx`

**Interfaces:**
- Consumes: `LogCaloriesModal`, `LogWorkoutModal`, `LogStepsModal`, `WalkTrackerModal` from `@/app/(burnlog)/dashboard/_components/quick-log/*` — each `({ profileId, onClose, onSaved }: { profileId: string; onClose: () => void; onSaved: () => void }) => JSX.Element`. `LogTransactionModal` from `@/app/(moneylog)/moneylog/_components/LogTransactionModal` — same signature.
- Produces: `QuickAddFab({ profileId, onSaved }: { profileId: string; onSaved: () => void })` — unchanged public signature, used by `app/(logbook)/logbook/page.tsx:117` (`<QuickAddFab profileId={profile.id} onSaved={() => mutate()} />`).

- [ ] **Step 1: Replace the full contents of `app/(logbook)/logbook/_components/QuickAddFab.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Plus,
  Flame,
  Dumbbell,
  Footprints,
  Route,
  ListChecks,
  Wallet,
  Moon,
  ChevronLeft,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { LogCaloriesModal } from '@/app/(burnlog)/dashboard/_components/quick-log/LogCaloriesModal';
import { LogWorkoutModal } from '@/app/(burnlog)/dashboard/_components/quick-log/LogWorkoutModal';
import { LogStepsModal } from '@/app/(burnlog)/dashboard/_components/quick-log/LogStepsModal';
import { WalkTrackerModal } from '@/app/(burnlog)/dashboard/_components/quick-log/WalkTrackerModal';
import { LogTransactionModal } from '@/app/(moneylog)/moneylog/_components/LogTransactionModal';

type QuickAddOption = 'meal' | 'workout' | 'steps' | 'walk' | 'task' | 'expense' | 'sleep';

interface QuickAddFabProps {
  profileId: string;
  onSaved: () => void;
}

const OPTIONS: { id: QuickAddOption; label: string; app: string; icon: LucideIcon; color: string; available: boolean }[] = [
  { id: 'meal', label: 'Log Meal', app: 'burnlog', icon: Flame, color: '#F97316', available: true },
  { id: 'workout', label: 'Log Workout', app: 'burnlog', icon: Dumbbell, color: '#F97316', available: true },
  { id: 'steps', label: 'Log Steps', app: 'burnlog', icon: Footprints, color: '#F97316', available: true },
  { id: 'walk', label: 'Track Walk', app: 'burnlog', icon: Route, color: '#F97316', available: true },
  { id: 'task', label: 'Complete Task', app: 'tasklog', icon: ListChecks, color: '#3B82F6', available: true },
  { id: 'expense', label: 'Log Expense', app: 'moneylog', icon: Wallet, color: '#22C55E', available: true },
  { id: 'sleep', label: 'Log Sleep', app: 'lifelog', icon: Moon, color: '#8B5CF6', available: false },
];

function TaskForm({ profileId, onSaved, onCancel }: { profileId: string; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClientComponentClient();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) return setError('Enter a task title');

    setSaving(true);
    const { error: insertError } = await supabase
      .from('tasklog_tasks')
      .insert([{ profileId, title: title.trim(), completedAt: new Date().toISOString() }]);
    setSaving(false);
    if (insertError) return setError(insertError.message);
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>What did you finish?</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send project update" />
      </div>
      <p className="text-xs text-muted-foreground">Logs it straight to done — no need to plan it first.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark done'}
        </Button>
      </div>
    </div>
  );
}

function SleepComingSoon({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-4 text-center">
        <Moon className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">Sleep logging is coming soon</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Lifelog isn&apos;t built yet, so there&apos;s nowhere to save this yet — check back later.
        </p>
      </div>
      <Button variant="outline" className="w-full" onClick={onCancel}>Back</Button>
    </div>
  );
}

const SAVED_MESSAGES: Record<QuickAddOption, string> = {
  meal: 'Meal logged',
  workout: 'Workout logged',
  steps: 'Steps logged',
  walk: 'Walk logged',
  task: 'Task marked done',
  expense: 'Expense logged',
  sleep: 'Sleep logged',
};

export function QuickAddFab({ profileId, onSaved }: QuickAddFabProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<QuickAddOption | null>(null);
  const { toast } = useToast();

  const close = () => {
    setOpen(false);
    setSelected(null);
  };

  const handleSaved = () => {
    if (selected) {
      toast({ description: SAVED_MESSAGES[selected] });
    }
    onSaved();
    close();
  };

  const selectedOption = OPTIONS.find((o) => o.id === selected);

  // The real BurnLog/MoneyLog modals (meal, workout, steps, walk, expense)
  // each render their own <Drawer open>, so once one is selected we stop
  // rendering the picker's <Drawer> and mount the modal directly — nesting
  // two open drawers would double the overlay/backdrop.
  if (selected === 'meal') {
    return <LogCaloriesModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'workout') {
    return <LogWorkoutModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'steps') {
    return <LogStepsModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'walk') {
    return <WalkTrackerModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'expense') {
    return <LogTransactionModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Quick add"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && close()}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              {selectedOption && (
                <button onClick={() => setSelected(null)} aria-label="Back" className="text-muted-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {selectedOption ? selectedOption.label : 'Quick add'}
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6 overflow-y-auto">
            {!selectedOption && (
              <div className="grid grid-cols-2 gap-3">
                {OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelected(opt.id)}
                      className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-transform active:scale-[0.98]"
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${opt.color}1a` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: opt.color }} />
                      </span>
                      <span className="text-sm font-medium">{opt.label}</span>
                      {!opt.available && <span className="text-[10px] text-muted-foreground">Coming soon</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {selected === 'task' && <TaskForm profileId={profileId} onSaved={handleSaved} onCancel={() => setSelected(null)} />}
            {selected === 'sleep' && <SleepComingSoon onCancel={() => setSelected(null)} />}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `QuickAddFab.tsx`.

- [ ] **Step 3: Manual verification in the browser**

Run: `npm run dev -- --port 3100` (a port other than 3000, since another checkout may already be running dev on 3000 — confirmed necessary in this session), then in a browser:
1. Navigate to `/logbook`, tap the Quick Add FAB (bottom-right `+`).
2. Confirm the grid now shows 7 tiles: Log Meal, Log Workout, Log Steps, Track Walk, Complete Task, Log Expense, Log Sleep.
3. Tap "Log Workout" — confirm `LogWorkoutModal` opens (workout type select, duration, AI button next to Calories Burned) and saving a workout shows the "Workout logged" toast and returns to Logbook home with the FAB visible again.
4. Tap "Log Meal" — confirm `LogCaloriesModal` opens with its Manual/Describe/Photo tabs (this is the AI-assisted version, not the old 4-button meal-type picker).
5. Tap "Log Expense" — confirm `LogTransactionModal` opens with its Manual/Photo (receipt scan) tabs.
6. Tap "Complete Task" and "Log Sleep" — confirm both still behave exactly as before (unchanged).

Expected: all six flows work, no console errors, no double-overlay/backdrop when opening a modal from the picker.

- [ ] **Step 4: Commit**

```bash
git add "app/(logbook)/logbook/_components/QuickAddFab.tsx"
git commit -m "$(cat <<'EOF'
feat(logbook): reuse real quick-log modals, add workout/steps/walk

Meal and Expense now open the actual AI-assisted LogCaloriesModal
and LogTransactionModal from BurnLog/MoneyLog instead of duplicated
mini-forms, and Workout/Steps/Walk are new quick-add options reusing
LogWorkoutModal/LogStepsModal/WalkTrackerModal as-is.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** `docs/superpowers/specs/2026-08-31-logbook-quick-add-design.md` calls for removing `MealForm`/`ExpenseForm`, growing `OPTIONS` to Meal/Workout/Steps/Walk/Task/Expense/Sleep, mounting the real modals, and keeping `TaskForm`/`SleepComingSoon` unchanged — all done in Task 1. Water/Weight are explicitly out of scope and not added.
- **Placeholder scan:** none — Step 1 is the complete target file, not a diff description.
- **Type consistency:** `QuickAddOption` covers all seven `OPTIONS` ids and all `SAVED_MESSAGES` keys; `QuickAddFabProps` unchanged from the version already consumed by `app/(logbook)/logbook/page.tsx`.
