// lib/intellog/chatThreads.ts

/**
 * Derives a chat thread's list-view title from its first message: collapse
 * whitespace, then trim to maxLen at the last word boundary (falling back to
 * a hard cut if the first "word" alone exceeds maxLen), appending an
 * ellipsis whenever anything was cut.
 */
export function truncateTitle(message: string, maxLen = 60): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;

  const slice = trimmed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace === -1 ? slice : slice.slice(0, lastSpace);
  return `${cut}…`;
}
