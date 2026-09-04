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
  // Anchored fence (whole paste is a fenced block).
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1];
  // Fence appears somewhere in the middle of other text (e.g. commentary
  // before/after the code block) — grab the first fenced block anywhere.
  const embedded = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return embedded ? embedded[1] : trimmed;
}

/**
 * Finds the first plausible top-level JSON value (object or array) in a
 * blob of text by locating the first `{` or `[` and its matching closing
 * bracket, so leading/trailing prose from the AI's reply doesn't block
 * parsing.
 */
function extractJsonSubstring(text: string): string | null {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const candidates: Array<{ close: string; start: number }> = [];
  if (firstBrace !== -1) candidates.push({ close: '}', start: firstBrace });
  if (firstBracket !== -1) candidates.push({ close: ']', start: firstBracket });
  if (candidates.length === 0) return null;
  // Prefer whichever bracket type appears first in the text.
  candidates.sort((a, b) => a.start - b.start);
  const { close, start } = candidates[0];
  const lastClose = trimmed.lastIndexOf(close);
  if (lastClose === -1 || lastClose <= start) return null;
  return trimmed.slice(start, lastClose + 1);
}

/**
 * Lenient JSON parse for near-miss JSON that AI tools commonly produce:
 * trailing commas and single-quoted strings/keys. Only used as a fallback
 * after strict JSON.parse fails.
 */
function lenientJsonParse(text: string): unknown {
  let normalized = text
    // Remove trailing commas before a closing ] or }
    .replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(normalized);
  } catch {
    // Fall through and try converting single-quoted strings/keys to double
    // quotes. This is a best-effort heuristic, not a full JS-object parser.
    normalized = normalized
      // Quote unquoted object keys: {key: ...} -> {"key": ...}
      .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
      // Convert single-quoted string values to double-quoted.
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner) => `"${inner.replace(/"/g, '\\"')}"`);
    return JSON.parse(normalized);
  }
}

type NormalizeResult =
  | { ok: true; row: ParsedStatementTransaction }
  | { ok: false; reasons: string[] };

function normalizeRow(row: unknown, index: number): NormalizeResult {
  if (!row || typeof row !== 'object') {
    return { ok: false, reasons: [`row ${index + 1}: not an object`] };
  }
  const r = row as Record<string, unknown>;
  const reasons: string[] = [];

  const date = typeof r.date === 'string' && DATE_RE.test(r.date) ? r.date : null;
  if (!date) reasons.push(`row ${index + 1}: "date" must be YYYY-MM-DD (got ${JSON.stringify(r.date)})`);

  const type = r.type === 'income' || r.type === 'expense' ? r.type : null;
  if (!type) reasons.push(`row ${index + 1}: "type" must be "income" or "expense" (got ${JSON.stringify(r.type)})`);

  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount > 0 ? r.amount : null;
  if (!amount) reasons.push(`row ${index + 1}: "amount" must be a positive number (got ${JSON.stringify(r.amount)})`);

  if (!date || !type || !amount) return { ok: false, reasons };

  const validCategories = type === 'income' ? INCOME_VALUES : EXPENSE_VALUES;
  const rawCategory = typeof r.category === 'string' ? r.category : '';
  const category = validCategories.has(rawCategory) ? rawCategory : type === 'income' ? 'other_income' : 'other_expense';

  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : 'Imported transaction';
  const notes = typeof r.notes === 'string' ? r.notes : '';

  return { ok: true, row: { date, type, category, label, amount, notes } };
}

/**
 * Parses the JSON an AI tool pasted back into the Import tab. This is
 * deliberately forgiving because that JSON rarely comes back clean:
 *  1. Strip a ```json fence if present, wherever it appears.
 *  2. Try strict JSON.parse on the cleaned text.
 *  3. If that fails, try again on just the first {...}/[...] substring, to
 *     skip over leading/trailing prose the AI added.
 *  4. If strict parsing still fails, try a lenient parse (trailing commas,
 *     single-quoted strings) on both the cleaned text and the substring.
 *  5. Only after all of that fails do we give up, with an actionable error.
 */
export function parseStatementJson(raw: string): ParsedStatementTransaction[] {
  if (!raw || !raw.trim()) {
    throw new Error("Paste the JSON reply first — the box is empty.");
  }

  const cleaned = stripJsonFence(raw);
  const substring = extractJsonSubstring(cleaned) ?? extractJsonSubstring(raw.trim());

  const attempts: Array<() => unknown> = [
    () => JSON.parse(cleaned),
    ...(substring && substring !== cleaned ? [() => JSON.parse(substring)] : []),
    () => lenientJsonParse(cleaned),
    ...(substring && substring !== cleaned ? [() => lenientJsonParse(substring)] : []),
  ];

  let parsed: unknown = undefined;
  let parsedOk = false;
  for (const attempt of attempts) {
    try {
      parsed = attempt();
      parsedOk = true;
      break;
    } catch {
      // try the next strategy
    }
  }

  if (!parsedOk) {
    throw new Error(
      "Couldn't find valid JSON in what you pasted — check that it starts with { and ends with }, and that it's the full reply (no partial copy)."
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object like {"transactions": [...]}, not a bare array or value.');
  }

  const transactionsField = (parsed as Record<string, unknown>).transactions;
  if (!Array.isArray(transactionsField)) {
    throw new Error('Expected a "transactions" array in the JSON');
  }

  if (transactionsField.length === 0) {
    throw new Error('No valid transactions found in the JSON');
  }

  const results = transactionsField.map((t, i) => normalizeRow(t, i));
  const rows = results.filter((r): r is Extract<NormalizeResult, { ok: true }> => r.ok).map((r) => r.row);

  if (rows.length === 0) {
    const reasons = results.flatMap((r) => (r.ok ? [] : r.reasons));
    const preview = reasons.slice(0, 5).join('; ');
    throw new Error(
      `No valid transactions found in the JSON${preview ? ` — ${preview}${reasons.length > 5 ? '; ...' : ''}` : ''}`
    );
  }

  return rows;
}
