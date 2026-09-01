'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

type GroceryListRow = {
  items: Record<string, string[]>;
  estimatedBudget: string | null;
};

export default function GroceryListPage() {
  const supabase = createClient();
  const router = useRouter();
  const [row, setRow] = useState<GroceryListRow | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('grocery_lists')
        .select('items, estimatedBudget')
        .eq('profileId', profile.id)
        .maybeSingle();
      if (error) throw error;
      setRow(data as GroceryListRow | null);
    } catch (err) {
      toast({
        title: 'Could not load grocery list',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, router, toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4 text-center">
        <ShoppingCart className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold">No grocery list yet</p>
        <p className="text-sm text-muted-foreground">Run the Meal Planner to generate your first grocery list.</p>
        <Button onClick={() => router.push('/meal-planner')}>Start Meal Planner</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>🧾 Your grocery list</CardTitle>
            {row.estimatedBudget && <p className="text-sm text-muted-foreground">Estimated budget: {row.estimatedBudget}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh grocery list"
            disabled={loading}
            onClick={() => load()}
          >
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(row.items).map(([category, items]) => (
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
        </CardContent>
      </Card>
    </div>
  );
}
