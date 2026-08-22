'use client';

import { useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { SparklesText } from '@/components/ui/sparkles-text';
import { Button } from '@/components/ui/button';

type AchievementOverlayProps = {
  open: boolean;
  /** Big sparkled headline, e.g. "Workout Complete!" */
  title: string;
  /** Supporting appreciation line. */
  message?: string;
  /** Optional stat chips, e.g. ["+50 XP", "🔥 5 day streak"]. */
  stats?: string[];
  onClose: () => void;
  /** Auto-dismiss after this many ms (0 disables). */
  autoCloseMs?: number;
};

// burnlog fire-themed sparkles
const SPARKLE_COLORS = { first: '#FF9E4F', second: '#FF3D71' };

export function AchievementOverlay({
  open,
  title,
  message = 'Amazing work — keep the streak burning!',
  stats = [],
  onClose,
  autoCloseMs = 0,
}: AchievementOverlayProps) {
  useEffect(() => {
    if (!open || !autoCloseMs) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [open, autoCloseMs, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-amber-300/30 bg-background p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(70% 50% at 50% 0%, rgba(255,158,79,0.25), transparent 70%)',
          }}
        />

        <div className="relative flex flex-col items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-400/40">
            <Trophy className="size-8 text-amber-500" />
          </div>

          <SparklesText
            className="text-3xl"
            colors={SPARKLE_COLORS}
            sparklesCount={12}
          >
            {title}
          </SparklesText>

          <p className="text-sm text-muted-foreground">{message}</p>

          {stats.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {stats.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-600 dark:text-amber-400"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          <Button onClick={onClose} className="mt-2 w-full">
            Keep Going
          </Button>
        </div>
      </div>
    </div>
  );
}
