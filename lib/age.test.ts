import { describe, it, expect } from 'vitest';
import { getAge } from './age';

describe('getAge', () => {
  it('computes age for a birthday already passed this year', () => {
    const now = new Date();
    const dob = new Date(now.getFullYear() - 30, 0, 1);
    if (now.getMonth() === 0 && now.getDate() === 1) {
      expect(getAge(dob)).toBe(30);
    } else {
      expect(getAge(dob)).toBe(30);
    }
  });

  it('computes age for a birthday not yet reached this year', () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dob = new Date(tomorrow);
    dob.setFullYear(tomorrow.getFullYear() - 30);
    expect(getAge(dob)).toBe(29);
  });

  it('accepts an ISO date string', () => {
    const now = new Date();
    const dob = new Date(now.getFullYear() - 25, 0, 1);
    expect(getAge(dob.toISOString())).toBe(25);
  });
});
