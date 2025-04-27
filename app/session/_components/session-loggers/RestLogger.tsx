'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type RestLoggerProps = { onEnd: () => void };

export function RestLogger({ onEnd }: RestLoggerProps) {
  const [sleep, setSleep] = useState<number>(0);
  const [healthy, setHealthy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const sessionSuccess = sleep >= 7 && healthy && hydrated;

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Rest Day</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-2">
            <Label>Sleep Hours</Label>
            <Input
              type="number"
              value={sleep}
              onChange={e => setSleep(Number(e.target.value))}
              placeholder="e.g. 8"
            />
          </div>
          <label className="flex items-center space-x-2">
            <Checkbox
              checked={healthy}
              onCheckedChange={(checked) => setHealthy(!!checked)}
            />
            <span>Healthy Meals</span>
          </label>
          <label className="flex items-center space-x-2">
            <Checkbox
              checked={hydrated}
              onCheckedChange={(checked) => setHydrated(!!checked)}
            />
            <span>Hydrated</span>
          </label>

          <div className="flex justify-end">
            <Button onClick={onEnd} disabled={!sessionSuccess}>
              Finish Rest
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
