import { describe, it, expect } from 'vitest';
import { truncateTitle } from './chatThreads';

describe('truncateTitle', () => {
  it('returns short messages unchanged', () => {
    expect(truncateTitle('How many calories did I eat today?')).toBe('How many calories did I eat today?');
  });

  it('collapses internal whitespace and trims', () => {
    expect(truncateTitle('  hello   world  ')).toBe('hello world');
  });

  it('truncates at the last word boundary before maxLen and appends an ellipsis', () => {
    const message = 'This is a fairly long message that should definitely get truncated at some point soon';
    const result = truncateTitle(message, 40);
    expect(result.length).toBeLessThanOrEqual(41); // 40 + ellipsis char
    expect(result.endsWith('…')).toBe(true);
    expect(message.startsWith(result.slice(0, -1).trimEnd())).toBe(true);
  });

  it('hard-cuts at maxLen when there is no space to break on', () => {
    const message = 'a'.repeat(80);
    const result = truncateTitle(message, 40);
    expect(result).toBe('a'.repeat(40) + '…');
  });

  it('defaults maxLen to 60', () => {
    const message = 'b'.repeat(100);
    const result = truncateTitle(message);
    expect(result).toBe('b'.repeat(60) + '…');
  });
});
