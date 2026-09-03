# AdminLog Model Gather — Curated OpenRouter Model Catalog

## Summary

Give AdminLog a "Model Gather" page where an admin browses OpenRouter's full
live model catalog (~425 models, free and paid, with filters), and curates a
subset into a new `CuratedModel` table. That table becomes the single source
of truth for every model picker in the app: the existing per-AI-feature
`Select` dropdowns (`/adminlog/ai-models`) and the IntelLog chat model picker
(`/intellog/chat`) both read from it instead of talking to OpenRouter
directly. The IntelLog chat picker's free-text "custom model ID" entry is
unaffected — it stays as the escape hatch for anything not yet curated.

## Background

Two existing pieces of AI-model infrastructure both currently hit OpenRouter
directly and don't share a curated list:

- `/api/ai/models` (`app/api/ai/models/route.ts`) — fetches OpenRouter's
  catalog live on every call, filters to free-only, splits into
  `{text, vision}`. Powers the `Select` dropdowns on `/adminlog/ai-models`
  (which map each of the ~20 `AI_FEATURES` slots to a model, persisted in
  `ai_model_settings`).
- `/api/intellog/chat/models` (`app/api/intellog/chat/models/route.ts`,
  built in a prior session) — fetches OpenRouter's catalog live, cached 1h
  via `lib/intellog/openrouterModels.ts`'s `getModelsList`, returns
  `{id, name}[]` unfiltered (free and paid alike). Powers the searchable
  model picker in `IntelChatModelPicker.tsx`.

Neither shows free/paid status, and there's no way for an admin to curate
"these are the models we actually want available" — every user browsing the
IntelLog chat picker sees the entire raw OpenRouter catalog, noise included.

Separately, `/adminlog/ai-model-test` (`app/(adminlog)/adminlog/ai-model-test/page.tsx`
+ `app/api/ai/model-test/route.ts`) already exists: an admin picks a model
and a prompt-size preset, the route times a real OpenRouter call via
`runAiJob`, and returns the reply plus `promptTokens`/`completionTokens` (so
tokens/sec is derivable). This is the only real "speed" signal available —
OpenRouter's bulk `GET /api/v1/models` response has no latency/throughput
field, and the per-model `.../endpoints` detail endpoint that does have
`latency_last_30m`/`throughput_last_30m` fields returns `null` for them in
practice and would require one HTTP call per model to bulk-fetch (425 calls)
— not viable for a browsing filter. Model Gather links out to this existing
tester per-model instead of trying to show bulk speed data.

## Data model

New table, following the `ToggleOverride`/`ErrorLog` convention of an
admin-attribution FK to `Profile`:

```prisma
/// an OpenRouter model an admin has curated as available app-wide — the
/// source of truth for every model picker (AdminLog's per-feature Select
/// dropdowns, IntelLog chat's model picker)
model CuratedModel {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  modelId         String   @unique // OpenRouter model id, e.g. "openai/gpt-4o-mini"
  name            String
  provider        String   // parsed from modelId's prefix before "/", e.g. "openai"
  modality        String   // 'text' | 'vision' — vision if OpenRouter lists "image" as an input modality
  isFree          Boolean
  contextLength   Int?
  addedByAdmin    Profile  @relation(fields: [addedByAdminId], references: [id])
  addedByAdminId  String   @db.Uuid
  addedAt         DateTime @default(now())

  @@map("ai_model_catalog")
}
```

`Profile` needs a new back-relation field (`CuratedModel CuratedModel[]`),
same as its existing `ToggleOverrideSetBy`/`ErrorLogResolvedBy` relations.

No RLS policies — same posture as `intel_chat_threads`/`intel_chat_messages`
(also no RLS in this codebase): every route that touches this table uses
`createServiceRoleClient()` with an explicit server-side admin check, never
a direct client-side Supabase query.

Deleting a curated model does **not** cascade or validate against existing
usages — `ai_model_settings.modelId`, `IntelChatThread.modelId`, and
IntelLog chat's custom-typed model IDs are all loose strings today (no FK),
and that stays true here. Removing a model from the curated list only
affects what shows up in *future* picks; anything already selected keeps
working exactly as it does now for a since-deprecated OpenRouter model —
i.e. it fails at call time if OpenRouter stops serving it, same as today.

## Live catalog fetch (admin browsing)

`lib/intellog/openrouterModels.ts` already fetches + caches (1h TTL)
OpenRouter's bulk catalog for the IntelLog chat picker. It's extended with a
richer shape for admin browsing, since Model Gather needs provider/modality/
free-paid/context-length to filter on, none of which the existing
`OpenRouterModel { id, name }` carries:

```ts
export interface BrowsableOpenRouterModel {
  id: string;
  name: string;
  provider: string;       // id.split('/')[0]
  modality: 'text' | 'vision';
  isFree: boolean;
  contextLength: number | null;
}

export function mapBrowsableModels(raw: unknown): BrowsableOpenRouterModel[]
export async function getBrowsableModelsList(
  fetchImpl?: typeof fetch,
  now?: () => number
): Promise<BrowsableOpenRouterModel[]>
```

`isFree` mirrors the existing logic in `app/api/ai/models/route.ts`
(`id.endsWith(':free')` or `pricing.prompt === '0' && pricing.completion === '0'`)
— that logic moves here so both the old free-only filtering behavior (now
just a filter option, not a hard gate) and the new admin browser share one
implementation. `modality` mirrors that same route's `isVision` check
(`architecture.input_modalities` includes `"image"`). The two functions share
the module-level cache and fetch machinery already in the file (same
`CACHE_TTL_MS`, same `fetch`/`now` injection for testability) — the existing
`getModelsList`/`mapOpenRouterModels` (used by the IntelLog chat *browse*
call, which is being removed per "Everywhere else reads the curated list"
below) are deleted rather than kept alongside, since after this change
nothing calls them: `getBrowsableModelsList` is strictly a superset used by
the one remaining live-fetch consumer (the admin browse route).

## Admin API routes

All four routes: resolve the caller via `supabase.auth.getUser()`, look up
`profiles.isAdmin` for that user (mirroring the exact check in
`app/api/ai/model-test/route.ts`), 403 if not an admin, then use
`createServiceRoleClient()` for the actual data access.

- `GET /api/adminlog/model-catalog/browse` — returns
  `{ models: BrowsableOpenRouterModel[] }` from `getBrowsableModelsList()`.
  No query params — filtering happens client-side (425 rows is small enough
  to filter in the browser without round-trips).
- `GET /api/adminlog/model-catalog` — returns `{ models: CuratedModelRow[] }`
  (`id, modelId, name, provider, modality, isFree, contextLength, addedAt`),
  ordered `addedAt desc`.
- `POST /api/adminlog/model-catalog` — body `{ modelId: string }`. Looks up
  `modelId` in `getBrowsableModelsList()` (**never** trusts client-supplied
  name/provider/modality/etc. — the client only sends the id it wants
  added). 404 if not found in the live catalog (guards against typos/stale
  ids). Upserts into `CuratedModel` (`onConflict: modelId`) with
  `addedByAdminId` set to the caller's profile id. Returns the created/
  updated row.
- `DELETE /api/adminlog/model-catalog` — body `{ modelId: string }` (a body
  rather than a path param, since OpenRouter ids contain `/` and would need
  encoding in a path segment otherwise). Deletes the matching `CuratedModel`
  row by `modelId`. Returns `{ ok: true }`.

## Everywhere else reads the curated list

- `app/api/ai/models/route.ts` — currently has no auth check at all (it only
  proxied OpenRouter's public catalog). Since it now reads from our own
  `CuratedModel` table via `createServiceRoleClient()` (which bypasses RLS),
  it gains an explicit `supabase.auth.getUser()` check — 401 if absent —
  matching the "any authenticated user may read" posture `ai_model_settings`
  already has, without requiring admin.
  Splits by `modality` into the same `{text, vision}` shape
  `/adminlog/ai-models` already consumes, but each entry now also carries
  `isFree` (`{id, name, isFree}`) so that page can badge free/paid — a small,
  additive change to `AiModelsPage`'s `CatalogEntry` type and its
  `SelectItem` rendering (append "· Free"/"· Paid" after the name).
- `app/api/intellog/chat/models/route.ts` — rewritten to query
  `CuratedModel` the same way, returning `{ models: {id, name, isFree}[] }`
  (dropping the `getModelsList`/OpenRouter-fetch call it currently makes).
  `IntelChatModelPicker.tsx` gets the `isFree` field threaded through and
  shown next to each model name in the dropdown list (not the button, to
  keep that compact) — the only UI change needed there, since the "Use
  custom model ID…" free-text path is untouched.
- `lib/intellog/openrouterModels.test.ts` — its existing tests for
  `mapOpenRouterModels`/`getModelsList` are replaced with equivalent tests
  for `mapBrowsableModels`/`getBrowsableModelsList` (same cases: shaping,
  sorting, malformed input, cache hit/miss/TTL/fallback-on-failure — plus
  new cases for the provider/modality/isFree/contextLength derivation).

## AdminLog UI

New page `app/(adminlog)/adminlog/model-gather/page.tsx`, added to the
`SECTIONS` array in `app/(adminlog)/adminlog/page.tsx`:

```
{ href: '/adminlog/model-gather', label: 'Model Gather',
  description: 'Browse OpenRouter's full catalog and curate which models are available across the app.' }
```

Layout (follows `AiModelsPage`'s existing `useRequireAdmin` + loading-state
pattern):

- Filter bar: text input (matches against `id` or `name`, case-insensitive
  substring), a modality `Select` (All / Text / Vision), a provider `Select`
  (options populated from the distinct `provider` values present in the
  fetched browse list, plus "All"), a pricing `Select` (All / Free / Paid),
  and a numeric "Min context length" input (e.g. typing `128` matches
  models with `contextLength >= 128000` — displayed/entered in thousands
  for readability, converted to the raw token count for filtering).
- Below the filters: the filtered list of `BrowsableOpenRouterModel` rows,
  each showing name, id (muted, smaller), provider badge, modality badge,
  a "Free"/"Paid" badge, formatted context length (e.g. "128K"), a "Test
  speed →" link to `/adminlog/ai-model-test?model=<id>` (the existing tester
  page — `ai-model-test/page.tsx` needs a small addition to read a `model`
  query param and preselect it, since it doesn't currently support
  preselection), and an Add/Remove button reflecting whether that `id` is
  present in the curated list (fetched once on load via
  `GET /api/adminlog/model-catalog`, kept as local state, updated
  optimistically on Add/Remove with rollback on request failure).
- No pagination — 425 rows rendered directly is fine (matches the existing
  `AiModelsPage`'s unpaginated per-feature lists in spirit; the filter bar
  is the primary way to narrow it down).

## Testing

- `lib/intellog/openrouterModels.test.ts` — updated/extended as described
  above (pure functions, no network).
- New unit tests for the `provider`/`modality`/`isFree`/`contextLength`
  derivation logic specifically (edge cases: an id with no `/`, missing
  `architecture`, missing `pricing`).
- No tests for the new API routes or the Model Gather page itself — this
  codebase has zero route/component tests (confirmed in the prior IntelLog
  chat work); verified manually against the dev server instead, same as
  every other admin page here.

## Out of scope

- Bulk speed/latency data in the browse list (infeasible per Background;
  the per-model link to the existing tester is the answer here).
- Preselecting a model that's already curated when opening the browse list
  scrolled to it, or any other browse-UX polish beyond the filter bar.
- Changing how `ai_model_settings` or `IntelChatThread.modelId` store their
  selection (both remain plain OpenRouter id strings, unchanged).
- Retroactively validating/cleaning up model ids already in use that aren't
  in the curated list.
