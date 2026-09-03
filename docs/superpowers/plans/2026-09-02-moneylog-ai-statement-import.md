# MoneyLog AI Statement Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "Import" tab to MoneyLog's Log Transaction drawer that turns a bank/credit-card PDF statement into reviewed, bulk-saved `finance_transactions` rows — via a copy-a-prompt-paste-JSON flow for everyone (once an admin flips the feature on), and a direct PDF-upload AI call for admins.

**Architecture:** One pure logic module owns the AI prompt text and the JSON→transactions parsing/validation, so the manual (copy/paste) and auto (server-side AI call) paths can never drift apart. A new API route wraps the existing OpenRouter/`runAiJob` pipeline for the admin-only auto path. A new panel component renders form → (manual paste | admin-only auto upload) → editable review table → bulk insert, and is gated into `LogTransactionModal` behind the existing `adminlog_toggles` mechanism.

**Tech Stack:** Next.js App Router, Supabase (client + server), OpenRouter via `openai` SDK, vitest, shadcn/ui components, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-09-02-moneylog-ai-statement-import-design.md`

## Global Constraints

- Reuse `lib/financeCategories.ts` category values verbatim — never invent new category strings.
- Auto mode's admin check happens server-side in the API route (`profiles.isAdmin`), never trusted from a client-sent flag.
- A missing `feature:moneylog-ai-import` toggle row defaults to **off** (unlike `TopBar.tsx`'s app-toggle default-open rule).
- 10 MB base64 cap on the PDF upload (matches `ReceiptScanner`'s image cap).
- `npm run build` must pass after every task that touches `.ts`/`.tsx` files.

---

### Task 1: Prompt builder + JSON parser (pure logic)

**Files:**
- Create: `lib/moneylog/statementImportPrompt.ts`
- Test: `lib/moneylog/statementImportPrompt.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2 and 3):
  ```ts
  export type AccountType = 'credit' | 'debit' | 'savings';
  export type StatementImportInput = {
    bank: string;
    accountType: AccountType;
    periodStart: string; // YYYY-MM-DD
    periodEnd: string;   // YYYY-MM-DD
  };
  export type ParsedStatementTransaction = {
    date: string;         // YYYY-MM-DD
    type: 'income' | 'expense';
    category: string;
    label: string;
    amount: number;       // positive
    notes: string;
  };
  export function buildStatementImportPrompt(input: StatementImportInput): string;
  export function parseStatementJson(raw: string): ParsedStatementTransaction[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/moneylog/statementImportPrompt.test.ts
import { describe, expect, it } from 'vitest';
import { buildStatementImportPrompt, parseStatementJson } from './statementImportPrompt';

describe('buildStatementImportPrompt', () => {
  it('includes the bank, account type, period, and real category values', () => {
    const prompt = buildStatementImportPrompt({
      bank: 'Chase',
      accountType: 'credit',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(prompt).toContain('Chase');
    expect(prompt).toContain('credit');
    expect(prompt).toContain('2026-07-01');
    expect(prompt).toContain('2026-07-31');
    expect(prompt).toContain('groceries');
    expect(prompt).toContain('salary');
    expect(prompt).toContain('"transactions"');
  });
});

describe('parseStatementJson', () => {
  it('parses a valid transactions array', () => {
    const raw = JSON.stringify({
      transactions: [
        { date: '2026-07-03', type: 'expense', category: 'groceries', label: 'Whole Foods', amount: 45.2, notes: '' },
      ],
    });
    const result = parseStatementJson(raw);
    expect(result).toEqual([
      { date: '2026-07-03', type: 'expense', category: 'groceries', label: 'Whole Foods', amount: 45.2, notes: '' },
    ]);
  });

  it('strips a ```json fence before parsing', () => {
    const raw = '```json\n' + JSON.stringify({
      transactions: [{ date: '2026-07-03', type: 'income', category: 'salary', label: 'Payroll', amount: 1000 }],
    }) + '\n```';
    const result = parseStatementJson(raw);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Payroll');
  });

  it('coerces an unrecognized category to other_expense / other_income', () => {
    const raw = JSON.stringify({
      transactions: [
        { date: '2026-07-03', type: 'expense', category: 'not_a_real_category', label: 'Mystery', amount: 10 },
        { date: '2026-07-04', type: 'income', category: 'not_a_real_category', label: 'Mystery income', amount: 20 },
      ],
    });
    const result = parseStatementJson(raw);
    expect(result[0].category).toBe('other_expense');
    expect(result[1].category).toBe('other_income');
  });

  it('drops rows missing a valid date, type, or amount', () => {
    const raw = JSON.stringify({
      transactions: [
        { date: '2026-07-03', type: 'expense', category: 'groceries', label: 'Good row', amount: 10 },
        { date: 'not-a-date', type: 'expense', category: 'groceries', label: 'Bad date', amount: 10 },
        { date: '2026-07-05', type: 'invalid-type', category: 'groceries', label: 'Bad type', amount: 10 },
        { date: '2026-07-06', type: 'expense', category: 'groceries', label: 'No amount', amount: 0 },
      ],
    });
    const result = parseStatementJson(raw);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Good row');
  });

  it('defaults a blank label to "Imported transaction"', () => {
    const raw = JSON.stringify({
      transactions: [{ date: '2026-07-03', type: 'expense', category: 'groceries', label: '', amount: 10 }],
    });
    const result = parseStatementJson(raw);
    expect(result[0].label).toBe('Imported transaction');
  });

  it('throws when every row is invalid', () => {
    const raw = JSON.stringify({ transactions: [{ date: 'bad', type: 'expense', category: 'groceries', label: 'x', amount: 10 }] });
    expect(() => parseStatementJson(raw)).toThrow('No valid transactions found in the JSON');
  });

  it('throws when the transactions key is missing', () => {
    expect(() => parseStatementJson(JSON.stringify({ foo: 'bar' }))).toThrow('Expected a "transactions" array in the JSON');
  });

  it('throws on unparseable JSON', () => {
    expect(() => parseStatementJson('not json at all')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/moneylog/statementImportPrompt.test.ts`
Expected: FAIL — `Cannot find module './statementImportPrompt'`

- [ ] **Step 3: Implement the module**

```ts
// lib/moneylog/statementImportPrompt.ts
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';

export type AccountType = 'credit' | 'debit' | 'savings';

export type StatementImportInput = {
  bank: string;
  accountType: AccountType;
  periodStart: string;
  periodEnd: string;
};

export type ParsedStatementTransaction = {
  date: string;
  type: 'income' | 'expense';
  category: string;
  label: string;
  amount: number;
  notes: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INCOME_VALUES = new Set(INCOME_CATEGORIES.map((c) => c.value as string));
const EXPENSE_VALUES = new Set(EXPENSE_CATEGORIES.map((c) => c.value as string));

export function buildStatementImportPrompt({ bank, accountType, periodStart, periodEnd }: StatementImportInput): string {
  const categoryValues = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => c.value).join('", "');

  return `You are a bank/credit-card statement transcription assistant. I will attach one or more PDF statements. Read them carefully and extract every individual transaction line item — not summaries, not running balances.

Statement details:
- Bank/institution: ${bank}
- Account type: ${accountType}
- Period: ${periodStart} to ${periodEnd}

Return ONLY a valid JSON object (no markdown, no code fences, no commentary) with this exact shape:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "type": "income" | "expense",
      "category": one of "${categoryValues}",
      "label": "short merchant/description, e.g. 'Whole Foods'",
      "amount": <positive number, absolute value>,
      "notes": "optional short note"
    }
  ]
}

Rules:
- One entry per transaction line item — never summarize or merge multiple transactions into one row.
- "type" is "expense" for money going out (purchases, fees, bill payments) and "income" for money coming in (deposits, refunds). Do NOT count credit-card-payment or balance-transfer lines as income.
- Pick the closest matching category from the list above; use "other_expense" or "other_income" if nothing fits well.
- "amount" is always a positive number, regardless of type.
- Only include transactions dated between ${periodStart} and ${periodEnd}.
- If you cannot read any transactions from the attached file(s), return {"transactions": []}.`;
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

function normalizeRow(row: unknown): ParsedStatementTransaction | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;

  const date = typeof r.date === 'string' && DATE_RE.test(r.date) ? r.date : null;
  const type = r.type === 'income' || r.type === 'expense' ? r.type : null;
  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount > 0 ? r.amount : null;
  if (!date || !type || !amount) return null;

  const validCategories = type === 'income' ? INCOME_VALUES : EXPENSE_VALUES;
  const rawCategory = typeof r.category === 'string' ? r.category : '';
  const category = validCategories.has(rawCategory) ? rawCategory : type === 'income' ? 'other_income' : 'other_expense';

  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : 'Imported transaction';
  const notes = typeof r.notes === 'string' ? r.notes : '';

  return { date, type, category, label, amount, notes };
}

export function parseStatementJson(raw: string): ParsedStatementTransaction[] {
  const cleaned = stripJsonFence(raw);
  const parsed = JSON.parse(cleaned) as unknown;

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).transactions)) {
    throw new Error('Expected a "transactions" array in the JSON');
  }

  const rows = ((parsed as Record<string, unknown>).transactions as unknown[])
    .map(normalizeRow)
    .filter((r): r is ParsedStatementTransaction => r !== null);

  if (rows.length === 0) {
    throw new Error('No valid transactions found in the JSON');
  }

  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/moneylog/statementImportPrompt.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/moneylog/statementImportPrompt.ts lib/moneylog/statementImportPrompt.test.ts
git commit -m "feat(moneylog): add AI statement import prompt/parser module"
```

---

### Task 2: Auto-mode API route

**Files:**
- Create: `app/api/ai/moneylog/import-statement/route.ts`

**Interfaces:**
- Consumes: `buildStatementImportPrompt`, `parseStatementJson`, `AccountType` from `lib/moneylog/statementImportPrompt.ts` (Task 1); `getModel` from `lib/ai/modelConfig.ts`; `runAiJob`, `AiRouteError` from `lib/ai/jobs.ts`; `formatAiError` from `lib/ai/errors.ts`.
- Produces (consumed by Task 4's client code): `POST` accepting
  `{ pdfBase64: string; filename: string; bank: string; accountType: AccountType; periodStart: string; periodEnd: string }`,
  returning `{ transactions: ParsedStatementTransaction[] }` on 200, or `{ error: string }` on 4xx/5xx.

- [ ] **Step 1: Implement the route**

```ts
// app/api/ai/moneylog/import-statement/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { buildStatementImportPrompt, parseStatementJson, type AccountType } from '@/lib/moneylog/statementImportPrompt';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const MAX_BASE64_LENGTH = 10 * 1024 * 1024 * 1.4; // ~10MB of binary, base64-inflated

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, isAdmin')
      .eq('userId', user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!profile.isAdmin) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { pdfBase64, filename, bank, accountType, periodStart, periodEnd } = body as {
      pdfBase64: string;
      filename: string;
      bank: string;
      accountType: AccountType;
      periodStart: string;
      periodEnd: string;
    };

    if (!pdfBase64 || !bank || !accountType || !periodStart || !periodEnd) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (pdfBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'PDF must be under 10 MB' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'vision');
    const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    const prompt = buildStatementImportPrompt({ bank, accountType, periodStart, periodEnd });

    try {
      const transactions = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'moneylog-import-statement', app: 'moneylog', model: MODEL },
        { bank, accountType, periodStart, periodEnd },
        async () => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.1,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    file: {
                      filename: filename || 'statement.pdf',
                      file_data: `data:application/pdf;base64,${base64Data}`,
                    },
                  } as never,
                  { type: 'text', text: prompt },
                ],
              },
            ],
            response_format: { type: 'json_object' },
          });

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          try {
            return parseStatementJson(content);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'AI response could not be parsed into transactions';
            throw new AiRouteError(message, 502);
          }
        }
      );

      return NextResponse.json({ transactions });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('moneylog/import-statement error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

Note: the `as never` cast on the `file` content part exists because the
installed `openai` SDK's TypeScript types (chat-completions message content
union) don't yet include the `file` part shape that OpenRouter accepts at
runtime — same reason the SDK is otherwise duck-typed here. If a future SDK
upgrade adds a typed `file` content part, drop the cast.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (the `as never` cast keeps it clean)

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/moneylog/import-statement/route.ts
git commit -m "feat(moneylog): add admin-only AI statement extraction route"
```

---

### Task 3: StatementImportPanel — form, manual mode, review, save

**Files:**
- Create: `app/(moneylog)/moneylog/_components/StatementImportPanel.tsx`

**Interfaces:**
- Consumes: `AccountType`, `buildStatementImportPrompt`, `parseStatementJson`, `ParsedStatementTransaction` from Task 1; `INCOME_CATEGORIES`, `EXPENSE_CATEGORIES` from `lib/financeCategories.ts`; `useToast` from `@/components/ui/use-toast`; `createClient` from `@/lib/supabase/client`.
- Produces (consumed by Task 4 and Task 5):
  ```ts
  export type StatementImportPanelProps = {
    profileId: string;
    isAdmin: boolean;
    onImported: () => void;
  };
  export function StatementImportPanel(props: StatementImportPanelProps): JSX.Element;
  ```
  Internal row type (not exported, but Task 4 extends the same component):
  ```ts
  type ReviewRow = ParsedStatementTransaction & { id: string };
  ```

This task builds the form + manual sub-flow + review table + save. Task 4
adds the admin-only auto sub-flow on top of the same file.

- [ ] **Step 1: Implement the component**

```tsx
// app/(moneylog)/moneylog/_components/StatementImportPanel.tsx
'use client';

import { useState } from 'react';
import { Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import {
  buildStatementImportPrompt,
  parseStatementJson,
  type AccountType,
  type ParsedStatementTransaction,
} from '@/lib/moneylog/statementImportPrompt';

export type StatementImportPanelProps = {
  profileId: string;
  isAdmin: boolean;
  onImported: () => void;
};

type ReviewRow = ParsedStatementTransaction & { id: string };

type Step = 'form' | 'review';

function toReviewRows(transactions: ParsedStatementTransaction[]): ReviewRow[] {
  return transactions.map((t) => ({ ...t, id: crypto.randomUUID() }));
}

export function StatementImportPanel({ profileId, isAdmin, onImported }: StatementImportPanelProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('form');
  const [bank, setBank] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('credit');
  const [periodStart, setPeriodStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [pastedJson, setPastedJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);

  const formInput = { bank, accountType, periodStart, periodEnd };

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(buildStatementImportPrompt(formInput));
    toast({ description: 'Prompt copied — paste it into ChatGPT or Claude along with your statement PDF.' });
  };

  const handleParse = () => {
    setParseError(null);
    try {
      const transactions = parseStatementJson(pastedJson);
      setRows(toReviewRows(transactions));
      setStep('review');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse that JSON');
    }
  };

  const updateRow = (id: string, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleCancelReview = () => {
    setRows([]);
    setStep('form');
  };

  const handleConfirmImport = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('finance_transactions').insert(
        rows.map((r) => ({
          profileId,
          type: r.type,
          category: r.category,
          label: r.label,
          amount: r.amount,
          date: new Date(r.date).toISOString(),
          notes: r.notes || null,
        }))
      );
      if (error) throw error;
      toast({ title: `${rows.length} transaction${rows.length === 1 ? '' : 's'} imported` });
      setRows([]);
      setPastedJson('');
      setStep('form');
      onImported();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import transactions';
      toast({ title: 'Import failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (step === 'review') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Review {rows.length} transaction{rows.length === 1 ? '' : 's'}</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {rows.map((row) => {
            const categories = row.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
            return (
              <div key={row.id} className="rounded-lg border border-border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(row.id, { date: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) })}
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label="Remove row"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={row.type === 'expense' ? 'default' : 'outline'}
                      className="h-7 text-xs px-2"
                      onClick={() => updateRow(row.id, { type: 'expense', category: 'other_expense' })}
                    >
                      Expense
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.type === 'income' ? 'default' : 'outline'}
                      className="h-7 text-xs px-2"
                      onClick={() => updateRow(row.id, { type: 'income', category: 'other_income' })}
                    >
                      Income
                    </Button>
                  </div>
                  <select
                    value={row.category}
                    onChange={(e) => updateRow(row.id, { category: e.target.value })}
                    className="flex h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  value={row.label}
                  onChange={(e) => updateRow(row.id, { label: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="Label"
                />
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No rows left — go back and paste JSON again.</p>}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={handleCancelReview}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={rows.length === 0 || saving} onClick={handleConfirmImport}>
            {saving ? 'Importing...' : `Confirm Import (${rows.length})`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="import-period-start">From</Label>
          <Input id="import-period-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="import-period-end">To</Label>
          <Input id="import-period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="import-bank">Bank</Label>
          <Input id="import-bank" placeholder="e.g. Chase" value={bank} onChange={(e) => setBank(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="import-account-type">Account type</Label>
          <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
            <SelectTrigger id="import-account-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Manual</p>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleCopyPrompt}>
            <Copy className="h-3.5 w-3.5" />
            Copy Prompt
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste the copied prompt into ChatGPT or Claude along with your statement PDF, then paste its JSON reply below.
        </p>
        <Textarea
          value={pastedJson}
          onChange={(e) => setPastedJson(e.target.value)}
          placeholder='{"transactions": [...]}'
          rows={5}
          className="text-xs font-mono"
        />
        {parseError && <p className="text-sm text-destructive">{parseError}</p>}
        <Button type="button" className="w-full" disabled={!pastedJson.trim() || !bank.trim()} onClick={handleParse}>
          Parse
        </Button>
      </div>
    </div>
  );
}
```

Note: `isAdmin` is accepted but unused until Task 4 adds the auto sub-flow
— that's expected for this task and resolved by the next one.

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit`
Expected: only the expected "isAdmin declared but never read" — actually
TypeScript doesn't error on unused destructured function params by default
in this repo's `tsconfig.json` (props are never flagged); if it does,
prefix with `_isAdmin` temporarily — Task 4 renames it back. Confirm with:
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "app/(moneylog)/moneylog/_components/StatementImportPanel.tsx"
git commit -m "feat(moneylog): add statement import panel (manual mode + review)"
```

---

### Task 4: Auto mode (admin-only) upload flow

**Files:**
- Modify: `app/(moneylog)/moneylog/_components/StatementImportPanel.tsx` (Task 3)

**Interfaces:**
- Consumes: `POST /api/ai/moneylog/import-statement` from Task 2, same request/response shape.
- No change to `StatementImportPanelProps`.

- [ ] **Step 1: Add auto-mode state and the sub-mode toggle**

Add these imports and state to the top of the component (alongside the
existing ones from Task 3):

```tsx
import { useRef } from 'react';
import { Loader2, Upload } from 'lucide-react';
```

```tsx
const [mode, setMode] = useState<'manual' | 'auto'>('manual');
const [pdfBase64, setPdfBase64] = useState<string | null>(null);
const [pdfFilename, setPdfFilename] = useState<string | null>(null);
const [extracting, setExtracting] = useState(false);
const [extractError, setExtractError] = useState<string | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Add the file handler and extract handler**

```tsx
const handlePdfFile = (file: File) => {
  if (file.type !== 'application/pdf') {
    setExtractError('Please select a PDF file');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setExtractError('PDF must be under 10 MB');
    return;
  }
  setExtractError(null);
  const reader = new FileReader();
  reader.onload = (e) => {
    setPdfBase64(e.target?.result as string);
    setPdfFilename(file.name);
  };
  reader.readAsDataURL(file);
};

const handleExtract = async () => {
  if (!pdfBase64) return;
  setExtracting(true);
  setExtractError(null);
  try {
    const res = await fetch('/api/ai/moneylog/import-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64, filename: pdfFilename, ...formInput }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setExtractError(data.error ?? 'Failed to extract transactions');
      return;
    }
    setRows(toReviewRows(data.transactions));
    setStep('review');
  } catch {
    setExtractError('Network error. Please try again.');
  } finally {
    setExtracting(false);
  }
};
```

- [ ] **Step 3: Render the sub-mode toggle (admin only) and the auto panel**

Replace the `<div className="rounded-lg border border-border p-3 space-y-2">`
Manual block from Task 3 with a version wrapped in the sub-mode toggle:

```tsx
{isAdmin && (
  <div className="flex gap-2">
    <Button type="button" size="sm" variant={mode === 'manual' ? 'default' : 'outline'} className="flex-1" onClick={() => setMode('manual')}>
      Manual
    </Button>
    <Button type="button" size="sm" variant={mode === 'auto' ? 'default' : 'outline'} className="flex-1" onClick={() => setMode('auto')}>
      Auto (AI upload)
    </Button>
  </div>
)}

{mode === 'manual' || !isAdmin ? (
  <div className="rounded-lg border border-border p-3 space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium">Manual</p>
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleCopyPrompt}>
        <Copy className="h-3.5 w-3.5" />
        Copy Prompt
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">
      Paste the copied prompt into ChatGPT or Claude along with your statement PDF, then paste its JSON reply below.
    </p>
    <Textarea
      value={pastedJson}
      onChange={(e) => setPastedJson(e.target.value)}
      placeholder='{"transactions": [...]}'
      rows={5}
      className="text-xs font-mono"
    />
    {parseError && <p className="text-sm text-destructive">{parseError}</p>}
    <Button type="button" className="w-full" disabled={!pastedJson.trim() || !bank.trim()} onClick={handleParse}>
      Parse
    </Button>
  </div>
) : (
  <div className="rounded-lg border border-border p-3 space-y-2">
    <p className="text-sm font-medium">Auto (AI upload)</p>
    <p className="text-xs text-muted-foreground">Upload the statement PDF — AI extracts transactions directly.</p>
    <input
      ref={fileInputRef}
      type="file"
      accept="application/pdf"
      className="hidden"
      onChange={(e) => e.target.files?.[0] && handlePdfFile(e.target.files[0])}
    />
    <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => fileInputRef.current?.click()}>
      <Upload className="h-3.5 w-3.5" />
      {pdfFilename ?? 'Choose PDF'}
    </Button>
    {extractError && <p className="text-sm text-destructive">{extractError}</p>}
    <Button type="button" className="w-full gap-1.5" disabled={!pdfBase64 || !bank.trim() || extracting} onClick={handleExtract}>
      {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {extracting ? 'Extracting...' : 'Extract Transactions'}
    </Button>
  </div>
)}
```

- [ ] **Step 4: Build and manual smoke test**

Run: `npm run build`
Expected: build succeeds.

Manually: open the app as an admin profile with the feature toggle on (from
Task 5 onward this is reachable via the UI); confirm the Manual/Auto toggle
appears and both sub-panels render without console errors. Full end-to-end
smoke test happens after Task 5 wires the tab in.

- [ ] **Step 5: Commit**

```bash
git add "app/(moneylog)/moneylog/_components/StatementImportPanel.tsx"
git commit -m "feat(moneylog): add admin-only auto PDF upload mode to statement import"
```

---

### Task 5: Wire the Import tab into LogTransactionModal

**Files:**
- Modify: `app/(moneylog)/moneylog/_components/LogTransactionModal.tsx`

**Interfaces:**
- Consumes: `StatementImportPanel` from Task 4 (props: `profileId`, `isAdmin`, `onImported`); `useCurrentProfile` from `@/lib/useCurrentProfile` (already used elsewhere in the app, e.g. `app/(moneylog)/moneylog/page.tsx:8`) for `profile.isAdmin`; `createClient` (already imported in this file).

- [ ] **Step 1: Add toggle resolution**

Add near the top of the component, alongside existing hooks:

```tsx
import { useEffect, useState } from 'react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { StatementImportPanel } from './StatementImportPanel';
```

(merge with the existing `import { useState } from 'react';` line — add `useEffect`)

Inside `LogTransactionModal`, after the existing `const supabase = createClient();` line:

```tsx
const { profile: currentProfile } = useCurrentProfile();
const [importEnabled, setImportEnabled] = useState(false);

useEffect(() => {
  (async () => {
    const { data: toggle } = await supabase
      .from('adminlog_toggles')
      .select('key, type, globallyEnabled')
      .eq('key', 'feature:moneylog-ai-import')
      .maybeSingle();
    // A missing toggle row means no admin has turned this on yet — default closed,
    // unlike TopBar.tsx's app-toggle default-open rule, since this gates AI spend.
    if (!toggle) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: myProfile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
    if (!myProfile) return;

    const { data: override } = await supabase
      .from('adminlog_toggle_overrides')
      .select('enabled')
      .eq('toggleKey', 'feature:moneylog-ai-import')
      .eq('profileId', myProfile.id)
      .maybeSingle();

    if (override) {
      setImportEnabled(override.enabled);
    } else {
      setImportEnabled(toggle.globallyEnabled);
    }
  })();
}, [supabase]);
```

- [ ] **Step 2: Widen the tab list and add the Import tab**

Change:

```tsx
<TabsList className="grid grid-cols-2">
  <TabsTrigger value="manual">Manual</TabsTrigger>
  <TabsTrigger value="photo">Scan Receipt</TabsTrigger>
</TabsList>
```

to:

```tsx
<TabsList className={importEnabled ? 'grid grid-cols-3' : 'grid grid-cols-2'}>
  <TabsTrigger value="manual">Manual</TabsTrigger>
  <TabsTrigger value="photo">Scan Receipt</TabsTrigger>
  {importEnabled && <TabsTrigger value="import">Import</TabsTrigger>}
</TabsList>
```

And change the `tab` state type + add the new `TabsContent`:

```tsx
const [tab, setTab] = useState<'manual' | 'photo' | 'import'>('manual');
```

```tsx
{importEnabled && (
  <TabsContent value="import" className="pt-3">
    <StatementImportPanel
      profileId={profileId}
      isAdmin={Boolean(currentProfile?.isAdmin)}
      onImported={() => {
        setTab('manual');
        onSaved();
      }}
    />
  </TabsContent>
)}
```

Place it as a sibling after the existing `<TabsContent value="manual" ...>`
block, still inside the same `<Tabs>`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke test**

1. As an admin, open `/adminlog/toggles`, use "Add a toggle" with type
   `feature`, key `moneylog-ai-import`, label `MoneyLog AI Statement
   Import` — this creates it with `globallyEnabled: true` by default (the
   admin can flip it off from the same page if they want it opt-in per
   user instead).
2. Open MoneyLog, tap the FAB, confirm the drawer now shows 3 tabs
   (Manual / Scan Receipt / Import).
3. On the Import tab as an admin: confirm the Manual/Auto sub-toggle
   appears; fill the form, click "Copy Prompt", paste it somewhere to
   confirm it contains the bank/period/category list; paste a hand-written
   JSON payload into the textarea, click Parse, confirm the review table
   renders with editable rows, delete one row, click "Confirm Import", and
   confirm the transactions show up in MoneyLog's dashboard.
4. Switch to a non-admin profile (or toggle off `isAdmin` in your test
   data): confirm the Import tab still appears (feature toggle is
   profile-independent) but only the Manual sub-panel renders, with no
   Manual/Auto toggle visible.
5. Turn the `feature:moneylog-ai-import` toggle off globally: confirm the
   Import tab disappears entirely and the drawer falls back to 2 tabs.

- [ ] **Step 5: Commit**

```bash
git add "app/(moneylog)/moneylog/_components/LogTransactionModal.tsx"
git commit -m "feat(moneylog): gate Import tab into Log Transaction drawer via feature toggle"
```
