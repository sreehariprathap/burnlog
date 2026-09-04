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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_START_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const WEEK_START_OPTIONS = [
  { value: 'monday', label: 'Monday (Mon–Sun)' },
  { value: 'saturday', label: 'Saturday (Sat–Fri)' },
  { value: 'sunday', label: 'Sunday (Sun–Sat)' },
];

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

  const handlePeriodChange = async (field: 'moneylogYearStartMonth' | 'moneylogMonthStartDay' | 'moneylogWeekStart', value: string) => {
    if (!profile) return;
    const parsed = field === 'moneylogWeekStart' ? value : Number(value);
    const { error } = await supabase.from('profiles').update({ [field]: parsed }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save setting', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
    toast({ description: 'Calculation period updated' });
  };

  const yearStartMonth = (profile?.moneylogYearStartMonth as number) ?? 1;
  const monthStartDay = (profile?.moneylogMonthStartDay as number) ?? 1;
  const weekStart = (profile?.moneylogWeekStart as string) ?? 'monday';

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

      <Card>
        <CardHeader>
          <CardTitle>Calculation periods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Controls what &quot;this year&quot;, &quot;this month&quot;, and &quot;this week&quot; mean across
            Insights and Goals.
          </p>

          <div className="space-y-2">
            <Label htmlFor="year-start" className="font-medium">Year starts on</Label>
            <Select value={String(yearStartMonth)} onValueChange={(v) => handlePeriodChange('moneylogYearStartMonth', v)}>
              <SelectTrigger id="year-start" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={name} value={String(i + 1)}>{name} 1</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="month-start" className="font-medium">Month starts on day</Label>
            <Select value={String(monthStartDay)} onValueChange={(v) => handlePeriodChange('moneylogMonthStartDay', v)}>
              <SelectTrigger id="month-start" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_START_DAYS.map((day) => (
                  <SelectItem key={day} value={String(day)}>{day}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="week-start" className="font-medium">Week starts on</Label>
            <Select value={weekStart} onValueChange={(v) => handlePeriodChange('moneylogWeekStart', v)}>
              <SelectTrigger id="week-start" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEK_START_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
