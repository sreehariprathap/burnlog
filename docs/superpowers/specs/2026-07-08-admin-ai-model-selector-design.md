# Admin AI Model Selector — Design

## Problem

The app calls OpenRouter for 4 AI features (workout plan, meal plan, workout-calorie estimation, food-photo scanning), each hardcoded to a model via a `process.env.AI_*` var — with inconsistent naming (`AI_TEXT_MODEL` vs `AI_WORKOUT_MODEL` for the same purpose) and no way to change the model without a redeploy. The admin wants to pick from OpenRouter's free-tier models at runtime, split by text vs image capability.

## Goals

- Admin can browse all free OpenRouter models, split into "text" and "image" lists, and pick one of each as the app's active model for that category.
- Change takes effect immediately (no redeploy) for all 4 existing AI routes.
- Close a real gap found while investigating: there is currently no server-enforced admin boundary anywhere in the app (`profiles.isAdmin` is only checked client-side). This feature is the first thing that needs one, since it's a DB write.

## Data model

New table, mirroring the existing `OnboardingPageFlag` config-table pattern:

```prisma
model AiModelSetting {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slot      String   @unique // 'text' | 'vision'
  modelId   String
  updatedAt DateTime @updatedAt

  @@map("ai_model_settings")
}
```

RLS (new pattern — no admin-only policy exists elsewhere in `supabase/rls.sql` to copy from):
- **SELECT**: any authenticated user (`auth.uid() is not null`). Every AI route needs to resolve which model to call regardless of who's making the request — not just admins.
- **INSERT/UPDATE**: only when the caller's `profiles` row has `isAdmin = true` and `profiles.userId = auth.uid()`.

No `DELETE` policy — rows are only ever upserted.

## Free-models catalog endpoint

New route: `GET /api/ai/models`.

- Fetches `https://openrouter.ai/api/v1/models` (OpenRouter's public model catalog — no API key required for this endpoint).
- Filters to free models only: `id` ends with `:free`, OR `pricing.prompt === "0" && pricing.completion === "0"`.
- Splits into two lists using `architecture.input_modalities`: **vision** = array includes `"image"`; **text** = everything else.
- Returns `{ text: [{ id, name }], vision: [{ id, name }] }`, each list sorted alphabetically by `name`.
- No caching layer (admin-only, low-frequency call). No auth check on this route itself — it returns only public catalog data, not app state.

## Route wiring

New shared helper `lib/ai/modelConfig.ts`:

```ts
export async function getModel(
  supabase: SupabaseClient,
  slot: 'text' | 'vision'
): Promise<string>
```

Reads the `ai_model_settings` row for `slot`; if absent, falls back to today's hardcoded default (`openai/gpt-oss-120b:free` for `text`, `google/gemini-flash-1.5` for `vision`).

Replaces the current `process.env.AI_*` reads in:
- `app/api/ai/scan-food/route.ts` → `vision`
- `app/api/ai/meal-plan/route.ts` → `text`
- `app/api/ai/estimate-workout-calories/route.ts` → `text`
- `lib/ai/openrouter.ts` (used by `app/api/ai/workout-plan/route.ts`) → `text`

This also resolves the existing naming inconsistency (`AI_TEXT_MODEL` vs `AI_WORKOUT_MODEL` serving the same purpose) by giving both a single source of truth.

## Admin UI

New `AiModelSettingsModal.tsx` in `app/profile/_components/`, opened via a new button placed in the existing admin-gated card in `app/profile/page.tsx` (next to the existing "Onboarding Page Toggles" button — same section, same gating pattern: `profile.isAdmin && ...`).

On open:
- Fetch `/api/ai/models` for the catalog.
- Read current `ai_model_settings` rows directly via the Supabase client (same direct-read/write pattern as `OnboardingPageTogglesModal`, no dedicated settings API route needed).

Renders two labeled dropdowns:
- **Text Model** — populated from the catalog's `text` list, preselected to the current `text` slot value (or the hardcoded default if unset).
- **Image Model** — populated from the catalog's `vision` list, preselected the same way.

Saving does a Supabase `upsert` on `ai_model_settings` per changed slot (`onConflict: 'slot'`). RLS enforces that only an actual admin succeeds.

## Error handling & edge cases

- `/api/ai/models` fetch fails (network error, OpenRouter down) → modal shows an inline error message; previously-loaded dropdown state (if any) remains usable; save button disabled until a successful catalog load.
- No `ai_model_settings` row yet for a slot → dropdown shows the hardcoded default preselected; saving creates the row via upsert.
- A non-admin session somehow calls the Supabase upsert directly (e.g. via devtools) → RLS rejects the write, surfaced as an inline error in the modal. This is defense-in-depth — the button itself is still only rendered behind the existing client-side `isAdmin` check for normal UX.
- If the OpenRouter catalog is empty for a category (e.g. no free vision models available that day) → dropdown shows a disabled "No free models available" placeholder option instead of crashing.

## Testing

No automated test suite exists in this repo; verification is manual in-browser (dev server):
- As an admin: open the modal, confirm the catalog loads and is correctly split into Text/Image lists, confirm current selections are preselected (or defaults shown), change each selector, save, and confirm a subsequent call to each of the 4 AI routes picks up the new `modelId`.
- As a non-admin: confirm the button/modal isn't shown; confirm a direct Supabase `upsert` call against `ai_model_settings` from the browser console fails under RLS.
- Simulate `/api/ai/models` failure (e.g. temporarily break the fetch URL) and confirm the modal shows an inline error without crashing.
