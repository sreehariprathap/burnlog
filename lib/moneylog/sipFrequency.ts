// lib/moneylog/sipFrequency.ts

export const SIP_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const;

export type SipFrequency = (typeof SIP_FREQUENCIES)[number]['value'];

export function isSipFrequency(value: string): value is SipFrequency {
  return SIP_FREQUENCIES.some((f) => f.value === value);
}

export function sipFrequencyLabel(value: string): string {
  return SIP_FREQUENCIES.find((f) => f.value === value)?.label ?? value;
}
