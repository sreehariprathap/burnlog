// components/intellog/MarkdownMessage.tsx
'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const components: Components = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10">{children}</code>,
};

/** Renders an assistant chat message's markdown content with compact, bubble-friendly spacing. */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed [&_>*:first-child]:mt-0 [&_>*:last-child]:mb-0">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
