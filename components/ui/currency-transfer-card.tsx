// components/ui/currency-transfer-card.tsx
// Local adaptation of the "Transfer in Progress -> Transfer Completed"
// animated status card at https://kokonutui.com/docs/cards/currency-transfer,
// re-themed onto our own design tokens and built on `motion` (already a
// dependency), matching how components/ui/multi-step-loader.tsx was adapted.
'use client';

import { motion, AnimatePresence } from 'motion/react';
import { ArrowRightLeft, CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export type TransferStatus = 'processing' | 'success' | 'error';

interface CurrencyTransferCardProps {
  status: TransferStatus;
  fromLabel: string;
  toLabel: string;
  amount: number;
  transactionId?: string;
}

const TITLES: Record<TransferStatus, string> = {
  processing: 'Transfer in Progress',
  success: 'Transfer Completed',
  error: 'Transfer Failed',
};

export function CurrencyTransferCard({
  status,
  fromLabel,
  toLabel,
  amount,
  transactionId,
}: CurrencyTransferCardProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
        <motion.div
          key={status}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, rotate: status === 'processing' ? 360 : 0 }}
          transition={
            status === 'processing'
              ? { rotate: { duration: 1.2, repeat: Infinity, ease: 'linear' } }
              : { type: 'spring', stiffness: 300, damping: 20 }
          }
          className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border"
        >
          {status === 'processing' && <ArrowRightLeft className="h-5 w-5 text-primary" />}
          {status === 'success' && <CheckCircle2 className="h-6 w-6 text-primary" />}
          {status === 'error' && <XCircle className="h-6 w-6 text-destructive" />}
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={TITLES[status]}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="text-sm font-medium text-foreground"
        >
          {TITLES[status]}
        </motion.p>
      </AnimatePresence>

      <div className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">From</span>
          <span className="font-medium truncate max-w-[9rem]">{fromLabel}</span>
        </div>
        <span className={cn('font-semibold tabular-nums', status === 'error' && 'text-muted-foreground line-through')}>
          {formatCurrency(amount)}
        </span>
        <div className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground">To</span>
          <span className="font-medium truncate max-w-[9rem]">{toLabel}</span>
        </div>
      </div>

      {transactionId && (
        <p className="text-xs text-muted-foreground">Ref: TXN-{transactionId.slice(0, 8).toUpperCase()}</p>
      )}
    </div>
  );
}
