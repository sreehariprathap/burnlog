'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type GroceryListRow = {
  items: Record<string, string[]>;
  estimatedBudget: string | null;
};

export default function GroceryListPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [row, setRow] = useState<GroceryListRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
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
      const { data } = await supabase
        .from('grocery_lists')
        .select('items, estimatedBudget')
        .eq('profileId', profile.id)
        .maybeSingle();
      setRow(data as GroceryListRow | null);
      setLoading(false);
    })();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">No grocery list yet — run the Meal Planner first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>🧾 Your grocery list</CardTitle>
          {row.estimatedBudget && <p className="text-sm text-muted-foreground">Estimated budget: {row.estimatedBudget}</p>}
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
