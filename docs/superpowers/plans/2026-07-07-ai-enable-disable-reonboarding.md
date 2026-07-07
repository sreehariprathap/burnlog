# AI Feature Enable/Disable with Re-onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user disable AI from the Profile page without losing data, and make
re-enabling always route through the existing `/ai-setup` flow with the questionnaire
pre-filled from their last saved answers.

**Architecture:** Two independent, small changes to existing files - no new routes, no schema
changes. Disable is a one-field flag flip on the Profile page. Re-enable reuses the exact same
three-step `/ai-setup` flow that exists today; the only change is threading the user's saved
`lifestyle` JSON into `LifestyleForm`'s initial field state.

**Tech Stack:** Next.js App Router, Supabase JS client (direct table reads/writes from client
components, matching every other write in this app - no new API route needed for either
change).

## Global Constraints

- Scoped to `Profile.aiEnabled` only - not a general feature-flag framework.
- Disabling never deletes or clears `workout_plans` rows or `profiles.lifestyle` - flag flip
  only.
- Re-enabling always shows the full Consent -> Questionnaire -> Preview flow - no "already
  consented" skip logic.
- Plan generation on re-enable ignores the current `workout_plans` rows and produces a fresh
  plan from submitted lifestyle answers - no plan-continuity/merge logic.
- `tsc --noEmit` must stay clean after every task.

---

### Task 1: Disable AI Insights button on Profile page

**Files:**
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add a `disablingAi` loading-state variable**

Find (near line 27, alongside the other `useState` declarations):

```ts
  const [testSending, setTestSending] = useState(false);
```

Add immediately after it:

```ts
  const [testSending, setTestSending] = useState(false);
  const [disablingAi, setDisablingAi] = useState(false);
```

- [ ] **Step 2: Add the disable handler**

Find the existing `handleSendTestPush` function (around line 77-86):

```ts
  const handleSendTestPush = async () => {
    setTestSending(true);
    const result = await sendRealTestNotification();
    if (result.success) {
      alert('Test push sent - check for a real notification on this device.');
    } else {
      alert(`Test push failed: ${result.error || 'Unknown error'}`);
    }
    setTestSending(false);
  };
```

Add a new handler immediately after it:

```ts
  const handleDisableAi = async () => {
    setDisablingAi(true);
    const { error } = await supabase
      .from('profiles')
      .update({ aiEnabled: false })
      .eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, aiEnabled: false }));
    }
    setDisablingAi(false);
  };
```

(This file already uses `any` for `profile` throughout, per its
`/* eslint-disable @typescript-eslint/no-explicit-any */` header - matching existing
convention, not introducing a new lint exception.)

- [ ] **Step 3: Show the Disable button when AI is enabled**

Find the AI Insights card content (around lines 270-280):

```tsx
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {profile.aiEnabled
                      ? 'AI-powered suggestions are enabled for your account.'
                      : 'Enable AI to get a personalized workout plan based on your lifestyle.'}
                  </p>
                  {!profile.aiEnabled && (
                    <Button onClick={() => router.push('/ai-setup?returnTo=/profile')}>
                      Enable AI Insights
                    </Button>
                  )}
                </CardContent>
```

Replace with:

```tsx
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
                    <Button onClick={() => router.push('/ai-setup?returnTo=/profile')}>
                      Enable AI Insights
                    </Button>
                  )}
                </CardContent>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Using a test account with `aiEnabled: true` (or set it via SQL:
`update profiles set "aiEnabled" = true where id = '<test-profile-id>';`):
- Visit `/profile`, confirm the "Disable AI Insights" button shows instead of "Enable AI
  Insights".
- Click it, confirm the button shows "Disabling..." briefly, then the card switches to showing
  "Enable AI Insights" again without a page reload.
- Confirm via SQL that `aiEnabled` is now `false` and `workout_plans`/`lifestyle` for that
  profile are unchanged from before the click.

- [ ] **Step 6: Commit**

```bash
git add app/profile/page.tsx
git commit -m "$(cat <<'EOF'
Add Disable AI Insights button to Profile page

Flips aiEnabled to false only - workout_plans and lifestyle answers
are left untouched so the user keeps their last AI-generated schedule
even with AI "off".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pre-fill the lifestyle questionnaire on re-enable

**Files:**
- Modify: `app/ai-setup/_components/AiSetupFlow.tsx`
- Modify: `app/ai-setup/_components/LifestyleForm.tsx`

**Interfaces:**
- Consumes: `LifestyleAnswers` type from `@/lib/ai/types` (already imported in both files).
- Produces: `LifestyleForm`'s new `initialAnswers?: LifestyleAnswers | null` prop - this is the
  only interface change, and this task is self-contained (no later task depends on it).

- [ ] **Step 1: Fetch `lifestyle` alongside `id` in `AiSetupFlow.tsx`**

Find (around lines 22-23):

```ts
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleAnswers | null>(null);
```

Note: `lifestyle` here already exists as the state for *submitted* answers (set in
`handleQuestionnaireSubmit`). Add a separate state for the *initial/pre-fill* value so the two
don't collide:

```ts
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleAnswers | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
```

- [ ] **Step 2: Extend the profile fetch to include `lifestyle`**

Find (around lines 36-40):

```ts
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', user.id)
        .single();
```

Replace with:

```ts
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, lifestyle')
        .eq('userId', user.id)
        .single();
```

- [ ] **Step 3: Store the fetched lifestyle as the pre-fill value**

Find (around lines 42-47):

```ts
      if (!profile) {
        router.replace('/signup/profile');
        return;
      }
      setProfileId(profile.id);
      setStep('consent');
```

Replace with:

```ts
      if (!profile) {
        router.replace('/signup/profile');
        return;
      }
      setProfileId(profile.id);
      setInitialLifestyle(profile.lifestyle ?? null);
      setStep('consent');
```

- [ ] **Step 4: Pass `initialLifestyle` down to `LifestyleForm`**

Find (around line 138):

```tsx
      {step === 'questionnaire' && (
        <LifestyleForm submitting={false} onSubmit={handleQuestionnaireSubmit} />
      )}
```

Replace with:

```tsx
      {step === 'questionnaire' && (
        <LifestyleForm
          submitting={false}
          initialAnswers={initialLifestyle}
          onSubmit={handleQuestionnaireSubmit}
        />
      )}
```

- [ ] **Step 5: Accept and use `initialAnswers` in `LifestyleForm.tsx`**

Find (lines 11-23):

```ts
type LifestyleFormProps = {
  submitting: boolean;
  onSubmit: (answers: LifestyleAnswers) => void;
};

export function LifestyleForm({ submitting, onSubmit }: LifestyleFormProps) {
  const [jobType, setJobType] = useState<LifestyleAnswers['jobType']>('desk');
  const [hoursSitting, setHoursSitting] = useState<LifestyleAnswers['hoursSitting']>('4-6');
  const [commuteActivity, setCommuteActivity] = useState<LifestyleAnswers['commuteActivity']>('sedentary');
  const [exerciseFrequency, setExerciseFrequency] = useState<LifestyleAnswers['exerciseFrequency']>('1-2');
  const [goalFocus, setGoalFocus] = useState<LifestyleAnswers['goalFocus']>('general_health');
  const [injuries, setInjuries] = useState('');
  const [preferredTrainingDays, setPreferredTrainingDays] = useState(4);
```

Replace with:

```ts
type LifestyleFormProps = {
  submitting: boolean;
  initialAnswers?: LifestyleAnswers | null;
  onSubmit: (answers: LifestyleAnswers) => void;
};

export function LifestyleForm({ submitting, initialAnswers, onSubmit }: LifestyleFormProps) {
  const [jobType, setJobType] = useState<LifestyleAnswers['jobType']>(initialAnswers?.jobType ?? 'desk');
  const [hoursSitting, setHoursSitting] = useState<LifestyleAnswers['hoursSitting']>(initialAnswers?.hoursSitting ?? '4-6');
  const [commuteActivity, setCommuteActivity] = useState<LifestyleAnswers['commuteActivity']>(initialAnswers?.commuteActivity ?? 'sedentary');
  const [exerciseFrequency, setExerciseFrequency] = useState<LifestyleAnswers['exerciseFrequency']>(initialAnswers?.exerciseFrequency ?? '1-2');
  const [goalFocus, setGoalFocus] = useState<LifestyleAnswers['goalFocus']>(initialAnswers?.goalFocus ?? 'general_health');
  const [injuries, setInjuries] = useState(initialAnswers?.injuries ?? '');
  const [preferredTrainingDays, setPreferredTrainingDays] = useState(initialAnswers?.preferredTrainingDays ?? 4);
```

Note: these are `useState` initializers, not effects - if `initialAnswers` arrives asynchronously
after first render (it does here, fetched in `AiSetupFlow`'s `useEffect`), the initial value is
still correct because `LifestyleForm` isn't mounted until `step === 'questionnaire'`, which only
happens after the fetch in `AiSetupFlow` has already completed and set `initialLifestyle`. No
`useEffect`-based sync is needed.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Using a disposable test account:
- First-time setup (profile has no `lifestyle` row, e.g. a freshly signed-up test account):
  visit the questionnaire step, confirm every field shows today's original hardcoded defaults
  (Desk job, 4-6 hours, Sedentary, 1-2x per week, General health, empty injuries, 4 training
  days) - not blank or broken.
- Set up a test profile with `aiEnabled: true` and a known `lifestyle` JSON via SQL, e.g.:
  ```sql
  update profiles set "lifestyle" = '{"jobType":"physical","hoursSitting":"2-4","commuteActivity":"walk_or_bike","exerciseFrequency":"3-4","goalFocus":"build_muscle","injuries":"bad left knee","preferredTrainingDays":5}'::jsonb where id = '<test-profile-id>';
  ```
  Then disable AI (Task 1's button) and re-enable from Profile - confirm the Consent step still
  shows, then the Questionnaire shows every field pre-filled matching the SQL values above
  exactly (Physical labor, 2-4 hours, Walk or bike, 3-4x per week, Build muscle, "bad left
  knee", 5 training days).
- Edit one field, submit, confirm the generated plan reflects it and `profiles.lifestyle` after
  Save matches the edited answers (not the pre-filled ones).
- Clean up test data (reset `lifestyle`/`aiEnabled`, remove any test `workout_plans` rows added)
  after verification.

- [ ] **Step 8: Commit**

```bash
git add app/ai-setup/_components/AiSetupFlow.tsx app/ai-setup/_components/LifestyleForm.tsx
git commit -m "$(cat <<'EOF'
Pre-fill lifestyle questionnaire from saved answers on re-enable

AiSetupFlow now fetches profiles.lifestyle alongside id and passes it
to LifestyleForm as initialAnswers, which seeds each field's useState
from it (falling back to the original hardcoded defaults when there's
no saved lifestyle yet, i.e. true first-time setup). Re-enabling still
always shows the full Consent -> Questionnaire -> Preview flow -
nothing about that changes, only what the Questionnaire step starts
pre-filled with.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
