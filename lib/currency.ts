// lib/currency.ts
// Mirrors the safeGet/safeSet localStorage pattern in lib/appMode.ts.

export const CURRENCIES = [
  { code: 'CAD', label: 'Canadian Dollar (CAD)', locale: 'en-CA' },
  { code: 'USD', label: 'US Dollar (USD)', locale: 'en-US' },
  { code: 'EUR', label: 'Euro (EUR)', locale: 'en-IE' },
  { code: 'GBP', label: 'British Pound (GBP)', locale: 'en-GB' },
  { code: 'INR', label: 'Indian Rupee (INR)', locale: 'en-IN' },
  { code: 'AUD', label: 'Australian Dollar (AUD)', locale: 'en-AU' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];
export const DEFAULT_CURRENCY: CurrencyCode = 'CAD';

const STORAGE_KEY = 'app:currency';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCIES.some((c) => c.code === value);
}

export function getCurrency(): CurrencyCode {
  if (!isBrowser()) return DEFAULT_CURRENCY;
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    return val && isCurrencyCode(val) ? val : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function setCurrency(code: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // storage disabled/unavailable — no-op
  }
}

export function currencyLocale(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.locale ?? 'en-CA';
}
