// app/(moneylog)/moneylog/_components/UnloggedOccurrencePrompts.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow } from '@/lib/financePeriods';

type Prompt = { recurringItemId: string; label: string; amount: number; type: string; date: string };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function UnloggedOccurrencePrompts({ profileId, onLogged }: { profileId: string; onLogged: () => void }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [logging, setLogging] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const windowStart = new Date(today);
      windowStart.setDate(windowStart.getDate() - 7);

      const [{ data: recurringItems }, { data: occurrences }] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase.from('recurring_item_occurrences').select('recurringItemId, occurrenceDate').gte('occurrenceDate', windowStart.toISOString()),
      ]);

      const loggedKeys = new Set((occurrences ?? []).map((o) => `${o.recurringItemId}:${ymd(new Date(o.occurrenceDate))}`));
      const expanded = expandRecurringInRange((recurringItems ?? []) as RecurringItemRow[], windowStart, today);

      const items = (recurringItems ?? []) as RecurringItemRow[];
      const next: Prompt[] = [];
      for (const occurrence of expanded) {
        const item = items.find((i) => i.category === occurrence.category && i.type === occurrence.type && i.amount === occurrence.amount);
        if (!item) continue;
        const key = `${item.id}:${ymd(occurrence.date)}`;
        if (loggedKeys.has(key)) continue;
        next.push({ recurringItemId: item.id, label: item.label, amount: occurrence.amount, type: occurrence.type, date: ymd(occurrence.date) });
      }
      setPrompts(next);
    })();
  }, [supabase, profileId, onLogged]);

  const logOne = async (prompt: Prompt) => {
    setLogging(`${prompt.recurringItemId}:${prompt.date}`);
    const res = await apiFetch(`/api/moneylog/recurring-items/${prompt.recurringItemId}/log-occurrence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurrenceDate: prompt.date }),
    });
    setLogging(null);
    if (res.ok) {
      toast({ title: `${prompt.label} logged` });
      onLogged();
    }
  };

  if (prompts.length === 0) return null;

  return (
    <div className="space-y-2">
      {prompts.map((prompt) => (
        <Card key={`${prompt.recurringItemId}:${prompt.date}`}>
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {prompt.type === 'income' ? 'Log payday' : 'Log bill'} — {prompt.label}
              </p>
              <p className="text-xs text-muted-foreground">${prompt.amount.toFixed(2)} due {prompt.date}</p>
            </div>
            <Button size="sm" onClick={() => logOne(prompt)} disabled={logging === `${prompt.recurringItemId}:${prompt.date}`}>
              Log
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
