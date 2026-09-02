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
