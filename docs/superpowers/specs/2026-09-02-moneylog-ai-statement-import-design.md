# MoneyLog AI Statement Import

## Problem

Entering transactions one-by-one in MoneyLog doesn't scale for someone
importing a month (or several) of bank/credit-card history at once. Running
that extraction as our own in-app AI call for every user is expensive at
scale, so most users should do the heavy lifting for free in an external AI
chat (ChatGPT/Claude) they already have access to, and just paste the
resulting JSON back into MoneyLog. Only admin accounts get the in-app
"upload the PDF, we call the AI for you" shortcut for now.

## Goals

- A new "Import" tab inside the existing "Log Transaction" drawer
  (`LogTransactionModal`), alongside the existing Manual and Scan Receipt
  tabs.
- **Manual mode (default, everyone)**: fill in period start/end, bank name,
  and account type (Credit / Debit / Savings). The panel builds a copyable
  prompt (copy-icon button) instructing an external AI to read attached PDF
  statement(s) and return JSON in our exact schema. Paste that JSON back in,
  parse it, review it in an editable table, then bulk-save.
- **Auto mode (admin-only)**: same period/bank/account-type fields, plus a
  PDF upload. We call our existing OpenRouter-backed AI pipeline
  server-side, get the same JSON shape back, and land on the same review
  table as Manual mode.
- The whole Import tab is gated behind an AdminLog feature toggle
  (`feature:moneylog-ai-import`), off by default — an admin turns it on
  (globally or per-user) from the existing `/adminlog/toggles` page. No new
  admin page is needed; that page already supports creating an arbitrary
  `feature:` toggle key.
- Auto mode is additionally gated to `profile.isAdmin`, checked server-side
  in the API route (never trust a client-side admin flag for something that
  spends AI budget).

## Non-goals

- No per-user AI usage quotas/billing — Auto mode is admin-only, which is
  the quota for now.
- No persistent "import batch" history/undo — imported rows land in
  `finance_transactions` exactly like a manual entry, indistinguishable
  afterward. (Could add later via the existing `ai_jobs` log, which already
  records Auto mode's input/output.)
- No multi-file upload in Auto mode — one PDF per import run (mirrors the
  10 MB single-file limit `ReceiptScanner` already uses). Manual mode has no
  such limit since the file never touches our server.
- No dedupe against existing transactions — the review step is the user's
  chance to catch double-imports.

## Data flow

```
Manual:  fill form -> [Copy Prompt] -> paste into ChatGPT/Claude with PDF(s)
         -> paste JSON reply back -> [Parse] -> review table -> [Confirm Import]

Auto:    fill form -> upload PDF -> [Extract Transactions]
         -> POST /api/ai/moneylog/import-statement -> review table -> [Confirm Import]
```

Both paths converge on the same review table and the same JSON shape:

```json
{
  "transactions": [
    { "date": "2026-08-03", "type": "expense", "category": "groceries", "label": "Whole Foods", "amount": 45.2, "notes": "" }
  ]
}
```

## Feature gating

Reuse the existing `adminlog_toggles` / `adminlog_toggle_overrides` +
`resolveToggle()` (`lib/adminlog/resolveToggle.ts`) machinery — same
precedence rule already used by `components/TopBar.tsx` for per-app gating.
Toggle key: `feature:moneylog-ai-import`, type `feature`. If no row exists
yet (fresh DB, before an admin creates it via `/adminlog/toggles`), treat it
as **off** — unlike `TopBar.tsx`'s "missing app toggle defaults to open"
rule, a missing *feature* toggle must default closed since it gates an
AI-cost feature, not general access.

## New files

- `lib/moneylog/statementImportPrompt.ts` — pure functions, no I/O:
  - `buildStatementImportPrompt(input: StatementImportInput): string`
  - `parseStatementJson(raw: string): ParsedStatementTransaction[]`
  - Shared by the manual copy-prompt button, the review-parse step, and the
    Auto-mode API route (so prompt text and JSON parsing/validation can
    never drift between the two paths).
- `app/api/ai/moneylog/import-statement/route.ts` — Auto mode only. Admin
  check, `runAiJob` (`jobType: 'moneylog-import-statement'`,
  `app: 'moneylog'`), OpenRouter vision-model call with the PDF as a `file`
  content part, returns `{ transactions: ParsedStatementTransaction[] }`.
- `app/(moneylog)/moneylog/_components/StatementImportPanel.tsx` — the tab
  content: form -> (manual paste | auto upload, admin-only sub-toggle) ->
  review table -> bulk insert into `finance_transactions`.
- `lib/moneylog/statementImportPrompt.test.ts` — unit tests for
  `parseStatementJson`'s validation/normalization.

## Modified files

- `app/(moneylog)/moneylog/_components/LogTransactionModal.tsx` — resolve
  the `feature:moneylog-ai-import` toggle for the current profile (same
  toggle+override query shape as `components/TopBar.tsx:41-68`); if
  resolved true, widen `TabsList` to 3 columns and add an `import`
  `TabsTrigger`/`TabsContent` rendering `StatementImportPanel`. Untouched
  otherwise.

## Prompt contract (`buildStatementImportPrompt`)

Given `{ bank, accountType, periodStart, periodEnd }`, produces a prompt
that:
- States the bank, account type, and date period as context.
- Asks for one JSON object, no markdown fences, shaped exactly as above.
- Lists the real category values from `INCOME_CATEGORIES` /
  `EXPENSE_CATEGORIES` (`lib/financeCategories.ts`) so the AI can only pick
  real categories.
- Instructs: one row per line item (no summarizing/merging), `amount`
  always positive, `type` is `expense` for money out / `income` for money
  in (excluding card-payment/balance-transfer lines), only rows within the
  given period, empty `transactions: []` if nothing readable.

## `parseStatementJson` contract

- Strips a leading/trailing ```` ```json ```` fence defensively (AI output
  sometimes ignores the "no markdown" instruction) before `JSON.parse`.
- Requires a top-level `transactions` array; throws
  `Error('Expected a "transactions" array in the JSON')` otherwise.
- Per row: `date` must match `YYYY-MM-DD`; `type` must be `'income'` or
  `'expense'`; `amount` must be a finite number > 0; `category` is coerced
  to `other_income`/`other_expense` when it's not a real category value for
  that type; `label` defaults to `'Imported transaction'` when blank/absent
  (rows are still user-editable in the review table). Rows missing a valid
  `date`, `type`, or `amount` are dropped rather than throwing (partial AI
  output shouldn't nuke the whole import).
- Throws `Error('No valid transactions found in the JSON')` if every row
  was dropped.

## Auto-mode API route

`POST /api/ai/moneylog/import-statement`

Request: `{ pdfBase64: string; filename: string; bank: string; accountType: 'credit' | 'debit' | 'savings'; periodStart: string; periodEnd: string }`

- Auth: `supabase.auth.getUser()`, then look up `profiles` row by `userId`
  and require `isAdmin === true` (403 `{ error: 'Admin only' }` otherwise) —
  mirrors `lib/adminlog/useRequireAdmin.ts`'s server-side equivalent, since
  there's no shared server helper for this check yet.
- 10 MB base64 payload cap, 400 if exceeded (same ceiling as
  `ReceiptScanner`'s image cap, applied to the PDF instead).
- Model: `getModel(supabase, 'vision')` (same slot `scan-receipt` uses —
  `DEFAULT_MODELS.vision = 'google/gemini-flash-1.5'`, which reads PDF
  document parts).
- OpenRouter chat completion, `response_format: { type: 'json_object' }`,
  message content = `[{ type: 'file', file: { filename, file_data: 'data:application/pdf;base64,' + base64 } }, { type: 'text', text: prompt }]`.
- Wrapped in `runAiJob(supabase, profile.id, { jobType: 'moneylog-import-statement', app: 'moneylog', model }, { bank, accountType, periodStart, periodEnd }, async () => {...})`.
- Parses the model's JSON reply with `parseStatementJson`; on
  parse/validation failure, throw `AiRouteError('AI response could not be parsed into transactions', 502)`.
- Success response: `{ transactions: ParsedStatementTransaction[] }`.

## `StatementImportPanel` UI

- Props: `{ profileId: string; isAdmin: boolean; onImported: () => void }`.
- Step state machine: `'form' | 'review'`.
- Form step:
  - Inputs: Period start (`date`), Period end (`date`), Bank (`text`),
    Account type (`select`: Credit / Debit / Savings).
  - If `isAdmin`: a Manual/Auto sub-toggle (two `Button`s, same
    active/outline variant pattern `LogTransactionModal` already uses for
    Expense/Income), default `'manual'`. Non-admins skip the sub-toggle
    entirely and only ever see the manual UI below.
  - Manual sub-panel: "Copy Prompt" button (`Copy` icon from `lucide-react`,
    `navigator.clipboard.writeText(buildStatementImportPrompt(...))`, toast
    "Prompt copied"), a `Textarea` for pasting the AI's JSON reply, and a
    "Parse" button that calls `parseStatementJson` client-side — on success
    moves to the review step; on throw, shows the error message inline
    (same inline red-text pattern as `LogTransactionModal`'s field errors).
  - Auto sub-panel (admin only): file `input[type=file][accept=application/pdf]`
    (10 MB client-side check, matching `ReceiptScanner.handleFile`), base64
    via `FileReader`, "Extract Transactions" button — POSTs to the route
    above, loading spinner while in flight, moves to review step on
    success, inline error on failure (same `AlertTriangle` pattern as
    `ReceiptScanner`).
- Review step: editable table, one row per parsed transaction —
  `date`/`amount` as small inputs, `type` as Expense/Income buttons (toggles
  which category list applies), `category` as a `<select>` (same native
  select markup `LogTransactionModal` uses), `label` as a text input, and a
  per-row delete (`X` icon) button. Footer: "Cancel" (back to form step,
  discarding rows) and "Confirm Import (N rows)" (disabled when 0 rows) —
  bulk `supabase.from('finance_transactions').insert(rows.map(...))`, toast
  `"N transactions imported"` on success or the Supabase error message on
  failure, then calls `onImported()`.

## Testing

- `lib/moneylog/statementImportPrompt.test.ts` (vitest, same style as
  `lib/adminlog/resolveToggle.test.ts`): covers `parseStatementJson` —
  valid JSON round-trips; a ```` ```json ```` fence is stripped; an invalid
  category is coerced to `other_expense`/`other_income`; a row missing
  `amount` is dropped; all-rows-invalid throws; missing `transactions` key
  throws.
- `npm run build` must pass (type-check + Next build) after all files land.
- Manual smoke test: as admin, enable the toggle via `/adminlog/toggles`
  (Add toggle → type `feature`, key `moneylog-ai-import`), open the Log
  Transaction drawer, confirm the Import tab appears with both Manual and
  Auto sub-modes; as a non-admin/non-toggled profile, confirm the tab is
  absent entirely.
