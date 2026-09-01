// components/ui/stat-card.tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NeonGradientCard } from '@/components/ui/neon-gradient-card';
import { cn } from '@/lib/utils';

interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: LucideIcon;
  title?: ReactNode;
  neonColors?: { firstColor: string; secondColor: string };
  borderSize?: number;
  borderRadius?: number;
  children: ReactNode;
}

// var() references, not resolved colors — the gradient re-evaluates whenever
// the active .app-<id> class changes these variables, so every app's
// StatCard glows in that app's own accent with no color prop needed.
const DEFAULT_NEON = { firstColor: 'var(--primary)', secondColor: 'var(--chart-2)' };

/**
 * BurnLog's neon-bordered stat-card look, generalized for every app.
 * NeonGradientCard hardcodes z-10, which ties with TopBar's sticky z-10 and
 * loses on scroll (later DOM order wins the tie) — StatCard drops to z-0 by
 * default so the header always stays on top.
 */
export function StatCard({
  icon: Icon,
  title,
  neonColors = DEFAULT_NEON,
  borderSize = 2,
  borderRadius = 16,
  className,
  children,
  ...props
}: StatCardProps) {
  const hasHeader = Boolean(title || Icon);
  return (
    <NeonGradientCard
      className={cn('z-0', className)}
      borderSize={borderSize}
      borderRadius={borderRadius}
      neonColors={neonColors}
      {...props}
    >
      {hasHeader && (
        <div className="flex items-center justify-between">
          {title && <span className="font-semibold">{title}</span>}
          {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
        </div>
      )}
      <div className={cn(hasHeader && 'mt-4')}>{children}</div>
    </NeonGradientCard>
  );
}
