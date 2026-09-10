// lib/myday/placement.ts
//
// Pure scheduling logic: given a list of candidate items that each want a
// slot on a day's timeline, and the intervals already occupied, decides
// exact start/end times. No I/O — see lib/myday/materializeSourceBlocks.ts
// for the Supabase-backed wrapper that gathers candidates and inserts the
// result as myday_blocks rows.

export interface TimeInterval {
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
}

export type PlacementSource = 'habit' | 'burnlog' | 'tasklog' | 'homelog';

export interface PlacementCandidate {
  key: string; // stable identifier, e.g. `habit:${occurrenceId}`
  source: PlacementSource;
  sourceId: string;
  title: string;
  // Set only for items that already happened (a logged workout session) —
  // placed at this exact time regardless of overlap. Omit for everything else.
  fixedStartTime?: string;
  desiredStartTime: string; // 'HH:mm' category default, used when fixedStartTime is unset
  durationMinutes: number;
  stepMinutes: number; // increment used when searching forward for a free slot
}

export interface PlacedBlock {
  key: string;
  source: PlacementSource;
  sourceId: string;
  title: string;
  startTime: string;
  endTime: string;
}

const DAY_END_MINUTES = 23 * 60; // 23:00 cap, matches DayTimeline's visible range

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function placeCandidates(candidates: PlacementCandidate[], existing: TimeInterval[]): PlacedBlock[] {
  const occupied = existing.map((iv) => ({ start: timeToMinutes(iv.startTime), end: timeToMinutes(iv.endTime) }));
  const placed: PlacedBlock[] = [];

  for (const candidate of candidates) {
    let start: number;

    if (candidate.fixedStartTime) {
      start = timeToMinutes(candidate.fixedStartTime);
    } else {
      start = timeToMinutes(candidate.desiredStartTime);
      while (occupied.some((iv) => overlaps(start, start + candidate.durationMinutes, iv.start, iv.end))) {
        if (start + candidate.stepMinutes + candidate.durationMinutes > DAY_END_MINUTES) {
          start = Math.max(0, DAY_END_MINUTES - candidate.durationMinutes);
          break;
        }
        start += candidate.stepMinutes;
      }
    }

    const end = start + candidate.durationMinutes;
    occupied.push({ start, end });
    placed.push({
      key: candidate.key,
      source: candidate.source,
      sourceId: candidate.sourceId,
      title: candidate.title,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
    });
  }

  return placed;
}
