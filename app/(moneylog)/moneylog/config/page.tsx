'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppConfigShell } from '@/components/AppConfigShell';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';
import { CURRENCIES, DEFAULT_CURRENCY, setCurrency } from '@/lib/currency';
import { useToast } from '@/components/ui/use-toast';

export default function MoneyLogConfigPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useCurrentProfile();

  const handleCurrencyChange = async (code: string) => {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ currency: code }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save currency', description: error.message, variant: 'destructive' });
      return;
    }
    setCurrency(code);
    refreshCurrentProfile();
    toast({ description: 'Currency updated' });
  };

  return (
    <AppConfigShell
      appName="MoneyLog"
      onboardingHref="/moneylog/onboarding?returnTo=/moneylog/config"
      exportData={() => ({})}
      bottomNav={<MoneyLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>MoneyLog settings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="currency" className="font-medium">Currency</Label>
          <Select
            value={(profile?.currency as string) ?? DEFAULT_CURRENCY}
            onValueChange={handleCurrencyChange}
          >
            <SelectTrigger id="currency" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
