// Grid container from magicui.design/docs/components/bento-grid, adapted:
// tightened row height and gap to fit stat tiles instead of marketing
// feature cards, and left generic/reusable — LogCardsGrid supplies its own
// tile content rather than the library's name/description/cta BentoCard.
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BentoGridProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
  className?: string;
}

export function BentoGrid({ children, className, ...props }: BentoGridProps) {
  return (
    <div className={cn('grid w-full grid-cols-2 gap-3 lg:grid-cols-3', className)} {...props}>
      {children}
    </div>
  );
}
