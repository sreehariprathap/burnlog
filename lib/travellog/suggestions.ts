export interface FreeWindowInput {
  startDate: string;
  endDate: string;
  dayCount: number;
}

export interface HolidayInput {
  date: string;
  name: string;
}

export interface SuggestionsRequest {
  freeWindows: FreeWindowInput[];
  averageMonthlySurplus: number;
  currency: string;
  country: string;
  holidays: HolidayInput[];
}

export interface TripSuggestion {
  destination: string;
  startDate: string;
  endDate: string;
  estimatedCost: number;
  currency: string;
  rationale: string;
}

export interface SuggestionsResponse {
  suggestions: TripSuggestion[];
}

export function buildSuggestionsSystemPrompt(): string {
  return 'You are a budget-conscious travel advisor. Given a traveller\'s actual free-time windows, disposable income, and upcoming public holidays, you suggest realistic, affordable trips. You respond with valid JSON only — no markdown, no prose, no code fences.';
}

export function buildSuggestionsUserPrompt(req: SuggestionsRequest): string {
  const windowsList = req.freeWindows
    .map((w) => `- ${w.startDate} to ${w.endDate} (${w.dayCount} days)`)
    .join('\n');
  const holidaysList = req.holidays.length > 0
    ? req.holidays.map((h) => `- ${h.date}: ${h.name}`).join('\n')
    : 'None in this period.';

  return `Suggest 3 to 5 affordable trips for a traveller in ${req.country}.

Available free-time windows (the ONLY dates you may use):
${windowsList}

Average monthly disposable surplus: ${req.averageMonthlySurplus} ${req.currency}
Upcoming public holidays in ${req.country}:
${holidaysList}

Requirements:
- Each suggestion's startDate and endDate MUST fall entirely within one of the listed free-time windows (do not invent dates outside them).
- Prefer windows that align with or extend a public holiday where one falls nearby.
- estimatedCost is a realistic total trip cost in ${req.currency} and should not substantially exceed the average monthly surplus (${req.averageMonthlySurplus} ${req.currency}) unless no cheaper realistic option fits the window.
- rationale is one sentence explaining why this trip fits (mention the window, budget fit, or a nearby holiday specifically).
- destination should be a real, specific place (city + country or region), not vague.

Respond with ONLY valid JSON matching this schema exactly:
{
  "suggestions": [
    {
      "destination": "Place name, Country",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "estimatedCost": 450.0,
      "currency": "${req.currency}",
      "rationale": "One sentence explaining the fit."
    }
  ]
}`;
}

function isWithinAnyWindow(start: string, end: string, windows: FreeWindowInput[]): boolean {
  return windows.some((w) => start >= w.startDate && end <= w.endDate);
}

function isTripSuggestion(v: unknown): v is TripSuggestion {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.destination === 'string' &&
    typeof s.startDate === 'string' &&
    typeof s.endDate === 'string' &&
    typeof s.estimatedCost === 'number' &&
    typeof s.currency === 'string' &&
    typeof s.rationale === 'string'
  );
}

/**
 * Validates a raw AI JSON response. Unlike the itinerary route's all-or-
 * nothing validation, this drops any individual suggestion that is
 * malformed or whose dates fall outside the supplied free windows, rather
 * than failing the whole response — losing 1 of 3-5 suggestions is fine;
 * losing an entire itinerary generation is not, which is why the two
 * routes use different failure tolerances.
 */
export function validateSuggestionsResponse(raw: unknown, freeWindows: FreeWindowInput[]): SuggestionsResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.suggestions) || r.suggestions.length === 0) {
    throw new Error('AI response is missing a "suggestions" array');
  }

  const valid = r.suggestions
    .filter(isTripSuggestion)
    .filter((s) => isWithinAnyWindow(s.startDate, s.endDate, freeWindows));

  if (valid.length === 0) {
    throw new Error('AI response contained no suggestions within the supplied free-time windows');
  }

  return { suggestions: valid };
}
