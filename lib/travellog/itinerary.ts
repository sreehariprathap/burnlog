// lib/travellog/itinerary.ts

export type TransportMode = 'car' | 'public_transit' | 'flight' | 'mixed';

export interface ItineraryRequest {
  destination: string;
  hotel: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  numPeople: number;
  transportMode: TransportMode;
  budget: number | null;
  budgetCurrency: string;
}

export interface Activity {
  time: string;
  title: string;
  description: string;
  location: string;
  lat: number | null;
  lng: number | null;
  estimatedCost: number;
  transportNote: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  activities: Activity[];
}

export interface BudgetBreakdown {
  accommodation: number;
  food: number;
  activities: number;
  transport: number;
}

export interface Itinerary {
  days: ItineraryDay[];
  budgetBreakdown: BudgetBreakdown;
  totalEstimatedCost: number;
  currency: string;
}

export const TRANSPORT_HINTS: Record<TransportMode, string> = {
  car: 'The traveller is using a CAR. Include driving routes between each activity, estimated drive times, parking tips, scenic road-trip stops, and fuel/toll notes.',
  public_transit: 'The traveller is using PUBLIC TRANSIT (bus, metro, train). Include specific bus/metro/train route numbers where known, estimated journey times, recommended transit cards, and the nearest station/stop for each location.',
  flight: "The traveller's primary long-distance mode is FLIGHT. Include airport transfer details (taxi, shuttle, or rail), check-in/security buffer times, terminal info where relevant, and local transport from the airport.",
  mixed: 'The traveller uses a MIX of transport modes. Choose the most practical mode per leg: flights for long distances, trains/metro for medium distances, and walking/taxi for short hops. State the mode for each activity.',
};

export function buildSystemPrompt(): string {
  return 'You are an expert travel planner. When given travel details you respond with a detailed, day-by-day vacation itinerary as valid JSON only — no markdown, no prose, no code fences. The JSON must exactly match the schema provided by the user.';
}

export function buildUserPrompt(req: ItineraryRequest): string {
  const transportHint = TRANSPORT_HINTS[req.transportMode];
  const budgetLine = req.budget != null
    ? `Total budget: ${req.budget} ${req.budgetCurrency}.`
    : 'No strict budget specified; estimate realistic costs.';

  const schema = `
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "activities": [
        {
          "time": "09:00",
          "title": "Activity title",
          "description": "Detailed description",
          "location": "Place name, City",
          "lat": 13.7563,
          "lng": 100.5018,
          "estimatedCost": 15.0,
          "transportNote": "Take BTS Skytrain to Siam station"
        }
      ]
    }
  ],
  "budgetBreakdown": {
    "accommodation": 0.0,
    "food": 0.0,
    "activities": 0.0,
    "transport": 0.0
  },
  "totalEstimatedCost": 0.0,
  "currency": "USD"
}
`;

  return `Plan a vacation itinerary with the following details:

Destination: ${req.destination}
Hotel / Accommodation: ${req.hotel || 'Not specified'}
Start date: ${req.startDate}
End date: ${req.endDate}
Number of people: ${req.numPeople}
Transport mode: ${req.transportMode}
${budgetLine}
Output currency: ${req.budgetCurrency}

Transport guidance: ${transportHint}

Requirements:
- Create one entry per day between startDate and endDate (inclusive).
- Each day should have at least 3 activities: morning (e.g. 08:00-10:00), afternoon (e.g. 13:00-15:00), and evening (e.g. 18:00-20:00).
- Provide realistic lat/lng coordinates for every location.
- estimatedCost is per-person in ${req.budgetCurrency}.
- transportNote must reflect the chosen transport mode (${req.transportMode}).
- budgetBreakdown totals should equal totalEstimatedCost (for ${req.numPeople} people).
- currency field must be "${req.budgetCurrency}".

Respond with ONLY valid JSON matching this schema exactly:
${schema}
`;
}

function isBudgetBreakdown(v: unknown): v is BudgetBreakdown {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return ['accommodation', 'food', 'activities', 'transport'].every((k) => typeof b[k] === 'number');
}

function isActivity(v: unknown): v is Activity {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.time === 'string' &&
    typeof a.title === 'string' &&
    typeof a.description === 'string' &&
    typeof a.location === 'string' &&
    (a.lat === null || typeof a.lat === 'number') &&
    (a.lng === null || typeof a.lng === 'number') &&
    typeof a.estimatedCost === 'number' &&
    typeof a.transportNote === 'string'
  );
}

function isItineraryDay(v: unknown): v is ItineraryDay {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.day === 'number' &&
    typeof d.date === 'string' &&
    Array.isArray(d.activities) &&
    d.activities.length > 0 &&
    d.activities.every(isActivity)
  );
}

/** Validates a raw AI JSON response against the Itinerary shape, throwing a descriptive error on any mismatch. */
export function validateItinerary(raw: unknown): Itinerary {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.days) || r.days.length === 0 || !r.days.every(isItineraryDay)) {
    throw new Error('AI response is missing a valid "days" array');
  }
  if (!isBudgetBreakdown(r.budgetBreakdown)) {
    throw new Error('AI response is missing a valid "budgetBreakdown" object');
  }
  if (typeof r.totalEstimatedCost !== 'number') {
    throw new Error('AI response is missing a numeric "totalEstimatedCost"');
  }
  if (typeof r.currency !== 'string') {
    throw new Error('AI response is missing a "currency" string');
  }

  return {
    days: r.days as ItineraryDay[],
    budgetBreakdown: r.budgetBreakdown,
    totalEstimatedCost: r.totalEstimatedCost,
    currency: r.currency,
  };
}
