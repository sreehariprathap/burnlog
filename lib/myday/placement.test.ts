import { describe, it, expect } from 'vitest';
import { placeCandidates, type PlacementCandidate, type TimeInterval } from './placement';

function candidate(overrides: Partial<PlacementCandidate>): PlacementCandidate {
  return {
    key: 'k',
    source: 'habit',
    sourceId: 'id',
    title: 'Item',
    desiredStartTime: '07:00',
    durationMinutes: 15,
    stepMinutes: 15,
    ...overrides,
  };
}

describe('placeCandidates', () => {
  it('places a single candidate at its desired time when nothing is occupied', () => {
    const result = placeCandidates([candidate({ desiredStartTime: '07:00', durationMinutes: 15 })], []);
    expect(result).toEqual([
      { key: 'k', source: 'habit', sourceId: 'id', title: 'Item', startTime: '07:00', endTime: '07:15' },
    ]);
  });

  it('shifts forward by the step size when the desired slot is already occupied', () => {
    const existing: TimeInterval[] = [{ startTime: '07:00', endTime: '07:15' }];
    const result = placeCandidates(
      [candidate({ key: 'k2', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 })],
      existing
    );
    expect(result[0]).toMatchObject({ startTime: '07:15', endTime: '07:30' });
  });

  it('stacks multiple candidates sequentially without overlapping each other', () => {
    const result = placeCandidates(
      [
        candidate({ key: 'h1', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 }),
        candidate({ key: 'h2', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 }),
        candidate({ key: 'h3', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 }),
      ],
      []
    );
    expect(result.map((r) => [r.startTime, r.endTime])).toEqual([
      ['07:00', '07:15'],
      ['07:15', '07:30'],
      ['07:30', '07:45'],
    ]);
  });

  it('places a fixed-time candidate at its exact time even if it overlaps an existing block', () => {
    const existing: TimeInterval[] = [{ startTime: '18:00', endTime: '19:00' }];
    const result = placeCandidates(
      [
        candidate({
          key: 'session',
          source: 'burnlog',
          fixedStartTime: '18:30',
          desiredStartTime: '18:30',
          durationMinutes: 60,
          stepMinutes: 60,
        }),
      ],
      existing
    );
    expect(result[0]).toMatchObject({ startTime: '18:30', endTime: '19:30' });
  });

  it('clamps to the 23:00 day-end cap and accepts overlap when no free slot exists', () => {
    // Occupy every 30-minute slot from 09:00 to 23:00 so a 30-minute task
    // candidate starting at 09:00 can never find a free slot.
    const existing: TimeInterval[] = [{ startTime: '09:00', endTime: '23:00' }];
    const result = placeCandidates(
      [candidate({ key: 't1', source: 'tasklog', desiredStartTime: '09:00', durationMinutes: 30, stepMinutes: 30 })],
      existing
    );
    expect(result[0]).toMatchObject({ startTime: '22:30', endTime: '23:00' });
  });
});
