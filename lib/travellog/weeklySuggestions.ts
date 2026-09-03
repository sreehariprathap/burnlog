export interface FreeWindowInput {
  startDate: string;
  endDate: string;
  dayCount: number;
}

export interface HolidayInput {
  date: string;
  name: string;
}

export interface WeeklySuggestionsRequest {
  visitedPlaces: string[];
  freeWindows: FreeWindowInput[];
  holidays: HolidayInput[];
  country: string;
}

export interface WeeklyTripSuggestion {
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  windowLabel: string;
  reason: string;
}

export interface WeeklySuggestionsResponse {
  suggestions: WeeklyTripSuggestion[];
}

export function buildWeeklySuggestionsSystemPrompt(): string {
  return 'You are a travel advisor who spots good opportunities for short trips. Given a traveller\'s past destinations, their actual free-time windows, and upcoming public holidays, you suggest specific, realistic trips timed to those windows. You respond with valid JSON only — no markdown, no prose, no code fences.';
}

export function buildWeeklySuggestionsUserPrompt(req: WeeklySuggestionsRequest): string {
  const windowsList = req.freeWindows
    .map((w) => `- ${w.startDate} to ${w.endDate} (${w.dayCount} days)`)
    .join('\n');
  const holidaysList = req.holidays.length > 0
    ? req.holidays.map((h) => `- ${h.date}: ${h.name}`).join('\n')
    : 'None in this period.';
  const visitedList = req.visitedPlaces.length > 0
    ? req.visitedPlaces.join(', ')
    : 'None recorded yet.';

  return `Suggest 5 to 8 trip ideas for a traveller based in ${req.country}.

Available free-time windows (the ONLY dates you may use):
${windowsList}

Upcoming public holidays in ${req.country}:
${holidaysList}

Places this traveller has already visited: ${visitedList}

Requirements:
- Each suggestion's startDate and endDate MUST fall entirely within one of the listed free-time windows (do not invent dates outside them).
- Prefer destinations the traveller has NOT already visited, unless a long weekend or holiday genuinely makes revisiting one a standout idea.
- Prefer windows that align with or extend a public holiday where one falls nearby.
- windowLabel is a short human-friendly label for the window used, e.g. "Long weekend · Nov 14-16" or "3-day window · Dec 5-7" — mention the holiday name if the window includes one.
- reason is one sentence explaining why this trip fits (the window, a nearby holiday, or novelty vs. their travel history).
- destination should be a real, specific place (city + country or region), not vague.

Respond with ONLY valid JSON matching this schema exactly:
{
  "suggestions": [
    {
      "destination": "Place name, Country",
      "country": "Country",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "windowLabel": "Short label for the window",
      "reason": "One sentence explaining the fit."
    }
  ]
}`;
}

function isWithinAnyWindow(start: string, end: string, windows: FreeWindowInput[]): boolean {
  return windows.some((w) => start >= w.startDate && end <= w.endDate);
}

function isWeeklyTripSuggestion(v: unknown): v is WeeklyTripSuggestion {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.destination === 'string' &&
    typeof s.country === 'string' &&
    typeof s.startDate === 'string' &&
    typeof s.endDate === 'string' &&
    typeof s.reason === 'string'
  );
}

function normalizeWindowLabel(s: Record<string, unknown>): string {
  return typeof s.windowLabel === 'string' && s.windowLabel.trim().length > 0
    ? s.windowLabel
    : `${s.startDate} – ${s.endDate}`;
}

/**
 * Drops any individual suggestion that is malformed or whose dates fall
 * outside the supplied free windows, rather than failing the whole batch —
 * losing a few of 5-8 suggestions is fine; losing the entire weekly batch
 * is not.
 */
export function validateWeeklySuggestionsResponse(raw: unknown, freeWindows: FreeWindowInput[]): WeeklySuggestionsResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.suggestions) || r.suggestions.length === 0) {
    throw new Error('AI response is missing a "suggestions" array');
  }

  const valid = r.suggestions
    .filter(isWeeklyTripSuggestion)
    .filter((s) => isWithinAnyWindow(s.startDate, s.endDate, freeWindows))
    .map((s) => ({ ...s, windowLabel: normalizeWindowLabel(s as unknown as Record<string, unknown>) }))
    .slice(0, 8);

  if (valid.length === 0) {
    throw new Error('AI response contained no suggestions within the supplied free-time windows');
  }

  return { suggestions: valid };
}
