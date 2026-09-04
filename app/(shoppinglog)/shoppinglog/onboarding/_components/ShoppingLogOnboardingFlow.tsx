// app/(shoppinglog)/shoppinglog/onboarding/_components/ShoppingLogOnboardingFlow.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ShoppingLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/shoppinglog';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to ShoppingLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Buy and sell items with other people using the app. List things you want to get rid of, browse what
          others are selling, and keep track of your orders in one place.
        </p>
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          To actually pay for something, you&apos;ll need to connect your MoneyLog wallet first — you&apos;ll be
          prompted for that the first time you check out.
        </p>
        <Button className="w-full" onClick={() => router.push(returnTo)}>Continue</Button>
      </CardContent>
    </Card>
  );
}
