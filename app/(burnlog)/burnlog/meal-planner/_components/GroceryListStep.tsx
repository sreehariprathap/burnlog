// app/(burnlog)/meal-planner/_components/GroceryListStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReceiptText, Home } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

type GroceryListStepProps = {
  groceryList: Record<string, string[]>;
  estimatedBudget: string;
  onContinue: () => void;
};

export function GroceryListStep({ groceryList, estimatedBudget, onContinue }: GroceryListStepProps) {
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'no_household'>('idle');
  const { toast } = useToast();

  const handleSyncToHomeLog = async () => {
    setSyncState('syncing');
    try {
      const res = await fetch('/api/homelog/shopping-list/sync-meal-plan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSyncState('idle');
        toast({ title: 'Could not sync to HomeLog', description: data.error ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      if (data.reason === 'no_household') {
        setSyncState('no_household');
        return;
      }
      setSyncState('idle');
      toast({
        title: 'Synced to HomeLog',
        description: data.count > 0 ? `Added ${data.count} item${data.count === 1 ? '' : 's'} to your household shopping list.` : 'Your household shopping list is already up to date.',
      });
    } catch {
      setSyncState('idle');
      toast({ title: 'Could not sync to HomeLog', description: 'Network error. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ReceiptText className="w-5 h-5" />Your grocery list</CardTitle>
        {estimatedBudget && <p className="text-sm text-muted-foreground">Estimated budget: {estimatedBudget}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groceryList).map(([category, items]) => (
          items.length > 0 && (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{category}</p>
              <ul className="text-sm space-y-1">
                {items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )
        ))}

        {syncState === 'no_household' ? (
          <p className="text-xs text-muted-foreground">Join a HomeLog household to sync this list.</p>
        ) : (
          <Button variant="outline" className="w-full" onClick={handleSyncToHomeLog} disabled={syncState === 'syncing'}>
            <Home className="w-4 h-4" />
            {syncState === 'syncing' ? 'Syncing…' : 'Add to HomeLog shopping list'}
          </Button>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={onContinue}>Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
