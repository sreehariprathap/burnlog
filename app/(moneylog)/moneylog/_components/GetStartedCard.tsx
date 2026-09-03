// app/(moneylog)/moneylog/_components/GetStartedCard.tsx
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSignIcon, type DollarSignIconHandle } from '@/components/ui/dollar-sign';
import { useMountAnimation } from '@/lib/useMountAnimation';

export function GetStartedCard() {
  const iconRef = useRef<DollarSignIconHandle>(null);
  useMountAnimation(iconRef);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboard to MoneyLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-center">
        <DollarSignIcon ref={iconRef} size={40} className="mx-auto text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Add your income sources and recurring expenses to start tracking your budget.
        </p>
        <Button asChild>
          <Link href="/moneylog/onboarding">Get started</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
