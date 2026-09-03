'use client';

import { Figtree } from 'next/font/google';
import { cn } from '@/lib/utils';

const figtree = Figtree({ subsets: ['latin'], weight: ['300', '900'] });

type AuroraLogbookMarkProps = {
  className?: string;
  /** color used for "THE" and the lowercase "log" */
  indigo?: string;
};

/**
 * Static "THE / log" in Figtree thin, animated aurora gradient on "BOOK."
 * Colors match the app's aurora palette (orange -> green -> blue -> pink -> purple).
 */
export function AuroraLogbookMark({ className, indigo = '#A9ADF5' }: AuroraLogbookMarkProps) {
  return (
    <div className={cn('flex flex-col items-center', figtree.className, className)}>
      <div className="text-[clamp(1.1rem,4.5vw,1.6rem)] font-light tracking-wide" style={{ color: indigo }}>
        THE
      </div>
      <div className="flex items-baseline leading-[0.82]">
        <span
          className="text-[clamp(2.75rem,14vw,6rem)] font-light tracking-tight"
          style={{ color: indigo }}
        >
          log
        </span>
        <span
          className="animate-aurora bg-[length:300%_100%] bg-clip-text text-[clamp(2.75rem,14vw,6rem)] font-black uppercase tracking-tighter text-transparent"
          style={{
            backgroundImage:
              'linear-gradient(100deg, #f6a63f 0%, #17b47a 25%, #4a95f0 50%, #e8447b 75%, #8b5fe8 100%)',
          }}
        >
          book
        </span>
        <span className="text-[clamp(2.75rem,14vw,6rem)] font-black" style={{ color: indigo }}>
          .
        </span>
      </div>
    </div>
  );
}
