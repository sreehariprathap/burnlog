// components/actions/WeightTracker.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Entry = { 
    id: string;
    date: string; 
    value: number 
};

export default function WeightTracker() {
    const supabase = createClientComponentClient();
    const [entries, setEntries] = useState<Entry[]>([]);
    const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
    const [weight, setWeight] = useState<string>('');

    const fetchEntries = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data } = await supabase
            .from('weight_entries')
            .select('id, date, value')
            .eq('profile_id', user.id)
            .order('date', { ascending: false })
            .limit(5);
            
        setEntries(data || []);
    };

    useEffect(() => {
        fetchEntries();
    }, [supabase]);

    const addEntry = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !weight) return;
        
        await supabase.from('weight_entries').insert({
            profile_id: user.id,
            date,
            value: parseFloat(weight),
        });
        
        setWeight('');
        fetchEntries();
    };

    return (
        <Card className="mt-6">
            <CardHeader className="pb-2">
                <CardTitle>Daily Weight Tracker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex space-x-4 items-end">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="weight-date">Date</Label>
                        <Input
                            id="weight-date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="weight-value">Weight (kg)</Label>
                        <Input
                            id="weight-value"
                            type="number"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            placeholder="e.g. 70.5"
                            className="w-full"
                        />
                    </div>
                    <Button onClick={addEntry} className="ml-2">Add</Button>
                </div>
                
                <div className="space-y-3">
                    {entries.length > 0 ? (
                        entries.map((entry) => (
                            <div key={entry.id} className="flex justify-between text-sm py-1 border-b">
                                <span>{entry.date}</span>
                                <span className="font-medium">{entry.value} kg</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground">No weight entries yet</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
