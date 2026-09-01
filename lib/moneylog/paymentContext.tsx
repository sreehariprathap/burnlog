// lib/moneylog/paymentContext.tsx
'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { PaymentSheet, type PaymentSheetPhase } from '@/components/PaymentSheet';

export interface PaymentRequest {
  payeeId: string;
  payeeLabel: string;
  amount: number;
  category: string;
  memo?: string;
  sourceApp: string;
}

export type PaymentResult =
  | { success: true; paymentId: string }
  | { success: false; reason: 'insufficient_funds' | 'declined' | 'error' };

interface PaymentContextValue {
  requestPayment: (input: PaymentRequest) => Promise<PaymentResult>;
}

const PaymentContext = createContext<PaymentContextValue>({
  requestPayment: async () => ({ success: false, reason: 'error' }),
});

export function PaymentProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PaymentRequest | null>(null);
  const [phase, setPhase] = useState<PaymentSheetPhase>('review');
  const [balance, setBalance] = useState<number | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const resolveRef = useRef<((result: PaymentResult) => void) | null>(null);

  const closeAndResolve = useCallback((result: PaymentResult) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPending(null);
    setTransactionId(null);
  }, []);

  const requestPayment = useCallback((input: PaymentRequest): Promise<PaymentResult> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPending(input);
      setPhase('review');
      setBalance(null);
      setTransactionId(null);

      fetch('/api/moneylog/balance')
        .then((r) => r.json())
        .then((data) => setBalance(typeof data.balance === 'number' ? data.balance : 0))
        .catch(() => setBalance(0));
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pending) return;
    setPhase('processing');
    try {
      const res = await fetch('/api/moneylog/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === 'insufficient_funds') {
        setBalance(data.balance);
        setPhase('insufficient');
        return;
      }
      if (!res.ok) {
        setPhase('error');
        return;
      }

      setTransactionId(data.paymentId);
      setPhase('success');
      setTimeout(() => closeAndResolve({ success: true, paymentId: data.paymentId }), 1200);
    } catch {
      setPhase('error');
    }
  }, [pending, closeAndResolve]);

  const handleCancel = useCallback(() => {
    if (phase === 'insufficient') {
      closeAndResolve({ success: false, reason: 'insufficient_funds' });
    } else if (phase === 'error') {
      closeAndResolve({ success: false, reason: 'error' });
    } else {
      closeAndResolve({ success: false, reason: 'declined' });
    }
  }, [phase, closeAndResolve]);

  return (
    <PaymentContext.Provider value={{ requestPayment }}>
      {children}
      <PaymentSheet
        open={!!pending}
        phase={phase}
        payeeLabel={pending?.payeeLabel ?? ''}
        amount={pending?.amount ?? 0}
        memo={pending?.memo}
        balance={balance}
        transactionId={transactionId}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </PaymentContext.Provider>
  );
}

export function usePayment() {
  return useContext(PaymentContext);
}
