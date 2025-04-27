// components/actions/MuscleTracker.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Entry = { id: string; date: string; value: number };

export default function MuscleTracker() {
  const supabase = createClientComponentClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [kg, setKg] = useState<string>('');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('protein_intake')
        .select('id, date, value')
        .eq('profile_id', user.id)
        .order('date', { ascending: false })
        .limit(5);
      setEntries(data || []);
    })();
  }, [supabase]);

  const addEntry = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !kg) return;
    await supabase.from('protein_intake').insert({
      profile_id: user.id,
      date,
      value: parseFloat(kg),
    });
    setKg('');
    const { data } = await supabase
      .from('protein_intake')
      .select('id, date, value')
      .eq('profile_id', user.id)
      .order('date', { ascending: false })
      .limit(5);
    setEntries(data || []);
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Protein Intake</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2 items-end">
          <div className="flex flex-col gap-1">
            <Label htmlFor="protein-date">Date</Label>
            <Input
              id="protein-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="protein-value">Protein (g)</Label>
            <Input
              id="protein-value"
              type="number"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              placeholder="e.g. 150"
            />
          </div>
          <Button onClick={addEntry}>Add</Button>
        </div>
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex justify-between text-sm">
              <span>{e.date}</span>
              <span>{e.value} g</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
