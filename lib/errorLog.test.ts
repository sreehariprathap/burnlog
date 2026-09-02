import { describe, it, expect } from 'vitest';
import { toErrorLogRow } from './errorLog';

describe('toErrorLogRow', () => {
  it('extracts message and stack from an Error instance', () => {
    const err = new Error('boom');
    const row = toErrorLogRow('server', err, { route: '/api/foo' });
    expect(row.source).toBe('server');
    expect(row.message).toBe('boom');
    expect(row.stack).toBe(err.stack);
    expect(row.context).toEqual({ route: '/api/foo' });
  });

  it('stringifies a non-Error thrown value and has no stack', () => {
    const row = toErrorLogRow('client', 'plain string error', undefined);
    expect(row.message).toBe('plain string error');
    expect(row.stack).toBeUndefined();
    expect(row.context).toBeUndefined();
  });
});
