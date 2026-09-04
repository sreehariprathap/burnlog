// app/(moneylog)/moneylog/onboarding/_components/AssetValueStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface AssetValueStepProps {
  saving: boolean;
  onContinue: (value: number | null) => void;
  onSkip: () => void;
}

export function AssetValueStep({ saving, onContinue, onSkip }: AssetValueStepProps) {
  const [value, setValue] = useState('');
  const parsed = parseFloat(value);
  const hasValue = value.trim().length > 0 && parsed >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>What are your assets worth? (optional)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A rough total across savings, investments, and cash — so MoneyLog can show your net worth from day one.
          You can add individual assets with more detail later from the Assets tab.
        </p>
        <div className="space-y-2">
          <Label htmlFor="onboarding-asset-value">Total value</Label>
          <Input
            id="onboarding-asset-value" type="number" min={0}
            value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 15000"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => onContinue(hasValue ? parsed : null)}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
          </Button>
          <Button variant="outline" onClick={onSkip} disabled={saving}>
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
