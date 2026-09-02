// lib/learnlog/suggestions.ts

export interface ClassSuggestionsRequest {
  skillName: string;
  skillCategory: string | null;
  city: string;
  budgetHint: string | null;
  upcomingDestination: string | null;
}

export interface ClassIdea {
  title: string;
  provider: string;
  rationale: string;
}

export interface ClassSuggestionsResponse {
  ideas: ClassIdea[];
}

export function buildSuggestionsSystemPrompt(): string {
  return 'You are a local activities advisor. Given a skill someone wants to practice and their city, you suggest plausible types of classes or providers that likely exist there. You are NOT connected to real listings — your ideas are illustrative, not verified. You respond with valid JSON only — no markdown, no prose, no code fences.';
  // Seam for a future Tavily/LangGraph-backed real-search implementation:
  // getLocalClassIdeas() below is where a search-backed lookup would replace this LLM call.
}

export function buildSuggestionsUserPrompt(req: ClassSuggestionsRequest): string {
  const destinationNote = req.upcomingDestination
    ? ` They also have an upcoming trip to ${req.upcomingDestination} — if relevant, include at least one idea suited to that destination instead of only their home city.`
    : '';
  return `Suggest 3 to 5 plausible class or lesson ideas for someone learning "${req.skillName}"${req.skillCategory ? ` (category: ${req.skillCategory})` : ''} in ${req.city}.${destinationNote}
${req.budgetHint ? `Budget consideration: ${req.budgetHint}` : ''}

Requirements:
- provider should be a realistic type of place (e.g. "local ski resort", "community climbing gym"), not a fabricated business name.
- rationale is one sentence on why this fits the skill and city.

Respond with ONLY valid JSON matching this schema exactly:
{
  "ideas": [
    { "title": "Beginner lesson type", "provider": "Realistic provider type", "rationale": "One sentence." }
  ]
}`;
}

function isClassIdea(v: unknown): v is ClassIdea {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.title === 'string' && typeof s.provider === 'string' && typeof s.rationale === 'string';
}

export function validateSuggestionsResponse(raw: unknown): ClassSuggestionsResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.ideas) || r.ideas.length === 0) {
    throw new Error('AI response is missing an "ideas" array');
  }
  const valid = r.ideas.filter(isClassIdea);
  if (valid.length === 0) {
    throw new Error('AI response contained no valid ideas');
  }
  return { ideas: valid };
}
