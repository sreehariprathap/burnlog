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
- Expected period (approximate — read the statement's own dates, don't filter by this): ${periodStart} to ${periodEnd}

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
- Include every transaction dated on the statement, even if its date falls outside the expected period above — the statement's actual dates are the source of truth, not that estimate.
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
