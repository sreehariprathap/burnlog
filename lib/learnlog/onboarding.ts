// lib/learnlog/onboarding.ts

export interface OnboardingRequest {
  interests: string;
  readingGoals: string;
  careerFocus: string;
}

export interface OnboardingResult {
  skills: string[];
  careerGoal: string;
  libraryItems: { type: 'BOOK' | 'COURSE'; title: string }[];
}

export function buildOnboardingSystemPrompt(): string {
  return 'You are a thoughtful learning coach helping someone set up a personal learning tracker. Given their interests, reading goals, and career focus, you suggest a small, realistic starting set of skills to track, one career goal, and a couple of books/courses to add. You respond with valid JSON only — no markdown, no prose, no code fences.';
}

export function buildOnboardingUserPrompt(req: OnboardingRequest): string {
  return `Interests/skills they want to develop: ${req.interests}
Reading/learning goals: ${req.readingGoals}
Career focus: ${req.careerFocus}

Suggest:
- 2 to 3 skills (short names, e.g. "Skiing", "Public speaking")
- 1 career goal (one sentence, specific and achievable)
- 2 to 3 library items (books or courses) relevant to their interests, with type and a real, specific title

Respond with ONLY valid JSON matching this schema exactly:
{
  "skills": ["Skiing", "Public speaking"],
  "careerGoal": "One sentence career goal.",
  "libraryItems": [
    { "type": "BOOK", "title": "Real book title" },
    { "type": "COURSE", "title": "Real course title" }
  ]
}`;
}

function isLibraryItemSeed(v: unknown): v is { type: 'BOOK' | 'COURSE'; title: string } {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (s.type === 'BOOK' || s.type === 'COURSE') && typeof s.title === 'string' && s.title.length > 0;
}

export function validateOnboardingResponse(raw: unknown): OnboardingResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.skills) || r.skills.length === 0) {
    throw new Error('AI response is missing a "skills" array');
  }
  if (typeof r.careerGoal !== 'string' || !r.careerGoal.trim()) {
    throw new Error('AI response is missing "careerGoal"');
  }
  if (!Array.isArray(r.libraryItems)) {
    throw new Error('AI response is missing a "libraryItems" array');
  }

  const skills = r.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  const libraryItems = r.libraryItems.filter(isLibraryItemSeed);

  if (skills.length === 0) {
    throw new Error('AI response contained no valid skills');
  }

  return { skills, careerGoal: r.careerGoal.trim(), libraryItems };
}
