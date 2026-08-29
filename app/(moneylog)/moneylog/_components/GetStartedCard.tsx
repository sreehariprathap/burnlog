// app/(moneylog)/moneylog/_components/GetStartedCard.tsx
'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function GetStartedCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboard to MoneyLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
