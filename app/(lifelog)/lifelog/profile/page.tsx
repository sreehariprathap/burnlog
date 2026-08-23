// app/(lifelog)/lifelog/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Loader2, Info } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { APPS, AppId, getDefaultApp, setDefaultApp } from '@/lib/appMode';

interface ProfileData {
  email: string | null;
  firstName: string;
  lastName: string;
  age: number;
  height: number;
  weight: number;
  activityLevel: string;
}

export default function LifeLogProfilePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [defaultApp, setDefaultAppState] = useState<AppId>('burnlog');

  useEffect(() => {
    setDefaultAppState(getDefaultApp());
  }, []);

  function handleSetDefaultApp(app: AppId) {
    setDefaultApp(app);
    setDefaultAppState(app);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace('/login');
          return;
        }

        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('firstName,lastName,age,weight,height,activityLevel')
          .eq('userId', session.user.id)
          .single();

        if (profErr) {
          setError('Failed to load profile. Please try logging out and logging back in.');
        } else {
          setProfile({ email: session.user.email || null, ...data });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="pb-24">
      <TopBar title="Profile" />
      <div className="px-4 py-4 flex flex-col gap-4">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {error && (
          <Card>
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {!loading && !error && profile && (
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ['Email', profile.email],
                ['Age', `${profile.age} yrs`],
                ['Height', `${profile.height} cm`],
                ['Weight', `${profile.weight} kg`],
                ['Activity Level', profile.activityLevel],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="font-medium">{label}</span>
                  <span className="flex items-center gap-1">
                    {value}
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>App</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.values(APPS).map((app) => (
              <div key={app.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{app.name}</p>
                  <p className="text-xs text-muted-foreground">Boot into {app.name} by default</p>
                </div>
                <Switch checked={defaultApp === app.id} onCheckedChange={() => handleSetDefaultApp(app.id)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button variant="destructive" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </Button>
      </div>
      <LifeLogBottomNav />
    </div>
  );
}
