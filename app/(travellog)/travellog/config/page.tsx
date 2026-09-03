'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AppConfigShell } from '@/components/AppConfigShell';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';
import { COUNTRIES } from '@/lib/country';
import { useToast } from '@/components/ui/use-toast';

export default function TravelLogConfigPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useCurrentProfile();

  const handleCountryChange = async (code: string) => {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ country: code }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save country', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
    toast({ description: 'Country updated' });
  };

  const handleWeeklyToggle = async (checked: boolean) => {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ weeklyTripSuggestionsEnabled: checked }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save setting', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
    toast({ description: checked ? 'Weekly trip suggestions enabled' : 'Weekly trip suggestions disabled' });
  };

  return (
    <AppConfigShell
      appName="TravelLog"
      exportData={() => ({})}
      bottomNav={<TravelLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>TravelLog settings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="country" className="font-medium">Country</Label>
          <p className="text-xs text-muted-foreground">Used to look up public holidays for trip suggestions.</p>
          <Select value={(profile?.country as string) ?? ''} onValueChange={handleCountryChange}>
            <SelectTrigger id="country" className="w-full"><SelectValue placeholder="Select your country" /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between pt-4">
            <div>
              <Label htmlFor="weekly-suggestions" className="font-medium">Weekly trip suggestions</Label>
              <p className="text-xs text-muted-foreground">Get a new set of trip ideas every week based on your travel history and free time.</p>
            </div>
            <Switch
              id="weekly-suggestions"
              checked={(profile?.weeklyTripSuggestionsEnabled as boolean) ?? true}
              onCheckedChange={handleWeeklyToggle}
            />
          </div>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
