import { describe, it, expect } from 'vitest';
import { SNAPSHOT_EXTRACTORS } from './extractors';

describe('SNAPSHOT_EXTRACTORS', () => {
  it('registers exactly the 4 v1 apps', () => {
    expect(Object.keys(SNAPSHOT_EXTRACTORS).sort()).toEqual(['burnlog', 'moneylog', 'sociallog', 'tasklog']);
  });

  it('maps each app id to a callable extractor function', () => {
    for (const fn of Object.values(SNAPSHOT_EXTRACTORS)) {
      expect(typeof fn).toBe('function');
    }
  });
});
