// components/PaymentSheet.tsx
'use client';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { CurrencyTransferCard } from '@/components/ui/currency-transfer-card';
import { formatCurrency } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export type PaymentSheetPhase = 'review' | 'processing' | 'success' | 'insufficient' | 'error';

interface PaymentSheetProps {
  open: boolean;
  phase: PaymentSheetPhase;
  payeeLabel: string;
  amount: number;
  memo?: string;
  balance: number | null;
  transactionId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PaymentSheet({
  open,
  phase,
  payeeLabel,
  amount,
  memo,
  balance,
  transactionId,
  onConfirm,
  onCancel,
}: PaymentSheetProps) {
  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next && phase === 'review') onCancel(); }} dismissible={phase === 'review'}>
      <DrawerContent className="app-moneylog">
        <DrawerHeader>
          <DrawerTitle>{phase === 'review' ? 'Confirm Payment' : 'MoneyLog'}</DrawerTitle>
        </DrawerHeader>

        {phase === 'review' && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paying</span>
              <span className="font-medium">{payeeLabel}</span>
            </div>
            {memo && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">For</span>
                <span className="font-medium truncate max-w-[60%] text-right">{memo}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Amount</span>
              <span>{formatCurrency(amount)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Your balance</span>
              <span>{balance === null ? 'Loading…' : formatCurrency(balance)}</span>
            </div>
          </div>
        )}

        {(phase === 'processing' || phase === 'success' || phase === 'error') && (
          <div className="px-4 pb-4">
            <CurrencyTransferCard
              status={phase === 'processing' ? 'processing' : phase === 'success' ? 'success' : 'error'}
              fromLabel="You"
              toLabel={payeeLabel}
              amount={amount}
              transactionId={transactionId ?? undefined}
            />
          </div>
        )}

        {phase === 'insufficient' && (
          <div className="px-4 pb-4 flex flex-col items-center gap-2 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Not enough balance</p>
            <p className="text-xs text-muted-foreground">
              This payment is {formatCurrency(amount)}, but your balance is {balance === null ? '—' : formatCurrency(balance)}.
            </p>
          </div>
        )}

        <DrawerFooter>
          {phase === 'review' && (
            <>
              <Button onClick={onConfirm} disabled={balance === null}>Pay {formatCurrency(amount)}</Button>
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            </>
          )}
          {(phase === 'insufficient' || phase === 'error') && (
            <Button variant="ghost" onClick={onCancel}>Close</Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
