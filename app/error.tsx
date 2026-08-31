"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl" aria-hidden="true">
        ⚠️
      </div>
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. Try again, or reload the page if it keeps happening.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
