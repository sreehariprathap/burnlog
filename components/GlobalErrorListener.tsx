// components/GlobalErrorListener.tsx
'use client';

import { useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';

// Safety net for errors nobody explicitly handled — an uncaught script error
// or unhandled promise rejection anywhere in the app currently fails
// completely silently to the user. This does NOT overlap with try/catch
// blocks that already call toast() themselves (those never reach here,
// since they're handled) or with React render errors (caught by
// ErrorBoundary/app/error.tsx instead — those don't fire these DOM events).
let lastMessage = '';
let lastAt = 0;
const DEDUPE_WINDOW_MS = 3000;

function notifyOnce(message: string) {
  const now = Date.now();
  if (message === lastMessage && now - lastAt < DEDUPE_WINDOW_MS) return;
  lastMessage = message;
  lastAt = now;
  toast({ title: 'Something went wrong', description: message, variant: 'destructive' });
}

function messageFrom(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return 'An unexpected error occurred.';
  }
}

export function GlobalErrorListener() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      notifyOnce(messageFrom(event.error ?? event.message));
    }
    function handleRejection(event: PromiseRejectionEvent) {
      notifyOnce(messageFrom(event.reason));
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
