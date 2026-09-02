// app/(learnlog)/learnlog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AppConfigShell } from '@/components/AppConfigShell';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';

export default function LearnLogConfigPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useCurrentProfile();

  async function handleCityBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (!profile) return;
    const value = e.target.value.trim();
    const { error } = await supabase.from('profiles').update({ learnLogCity: value || null }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save city', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
    toast({ description: 'City updated' });
  }

  async function handleAiToggle(checked: boolean) {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ learnLogAiEnabled: checked }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not update setting', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
  }

  return (
    <AppConfigShell
      appName="LearnLog"
      onboardingHref="/learnlog/onboarding?returnTo=/learnlog/config"
      exportData={() => ({})}
      bottomNav={<LearnLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>LearnLog settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="city">City / region</Label>
            <p className="text-xs text-muted-foreground">Used to suggest nearby classes for your skills.</p>
            <Input id="city" defaultValue={(profile?.learnLogCity as string) ?? ''} onBlur={handleCityBlur} placeholder="e.g. Vancouver, BC" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="aiToggle">AI suggestions</Label>
              <p className="text-xs text-muted-foreground">Nearby-class ideas and onboarding suggestions.</p>
            </div>
            <Switch id="aiToggle" checked={(profile?.learnLogAiEnabled as boolean) ?? true} onCheckedChange={handleAiToggle} />
          </div>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
