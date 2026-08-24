// lib/username.ts

function slugifyName(firstName: string): string {
  const slug = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug.length > 0 ? slug : 'user';
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

/** Generates a candidate username like "sree_x7k2". Not guaranteed unique — callers must retry on a unique-constraint violation. */
export function generateUsername(firstName: string): string {
  return `${slugifyName(firstName)}_${randomSuffix()}`;
}

/** 3-20 chars, lowercase letters/digits/underscore only — enforced both for generated and user-edited usernames. */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(username);
}
