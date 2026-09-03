/* eslint-disable @typescript-eslint/no-explicit-any */
// components/ProfilePage.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Info, AlertTriangle } from 'lucide-react';
import { ProfileAvatar } from './_components/ProfileAvatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { TopBar } from '@/components/TopBar';
import { LogbookBottomNav } from '@/components/LogbookBottomNav';
import { LogoutOverlay } from '@/components/LogoutOverlay';
import { Switch } from '@/components/ui/switch';
import { APPS, AppId, getDefaultApp, setDefaultApp, setEnabledApps } from '@/lib/appMode';
import { useToast } from '@/components/ui/use-toast';

// Client Component — no static <Metadata> export; page title stays the
// default set by the root layout.

export default function ProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutOverlayOpen, setLogoutOverlayOpen] = useState(false);
  const [email, setEmail] = useState<string|null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [defaultApp, setDefaultAppState] = useState<AppId>('burnlog');
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSaveError, setUsernameSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDefaultAppState(getDefaultApp());
  }, []);

  function handleSetDefaultApp(app: AppId) {
    setDefaultApp(app);
    setDefaultAppState(app);
  }

  const [addingApp, setAddingApp] = useState<AppId | null>(null);

  async function handleAddApp(app: AppId) {
    if (!profile) return;
    setAddingApp(app);
    const currentEnabled: AppId[] = profile.enabledApps ?? [];
    const nextEnabled = [...currentEnabled, app];
    const { error } = await supabase
      .from('profiles')
      .update({ enabledApps: nextEnabled })
      .eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not add app', description: error.message, variant: 'destructive' });
      setAddingApp(null);
      return;
    }
    setEnabledApps(nextEnabled);
    setProfile((prev: any) => ({ ...prev, enabledApps: nextEnabled }));
    router.push(`/onboarding/sequence?apps=${app}&step=0&returnTo=/profile`);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: { session }, error: sessErr } = await supabase.auth.getSession();
        
        if (sessErr) {
          console.error("Session error:", sessErr);
          setError("Session error. Please try logging out and logging back in.");
          return;
        }

        if (!session) {
          console.log("No active session, redirecting to login");
          router.replace('/login');
          return;
        }

        setEmail(session.user.email || null);
        setUserId(session.user.id);
        const userId = session.user.id;
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('id,firstName,lastName,age,height,weight,activityLevel,isAdmin,avatarUrl,username,enabledApps')
          .eq('userId', userId)
          .single();

        if (profErr) {
          console.error("Profile error:", profErr);
          
          // If data not found error, set profileNotFound flag
          if (profErr.code === 'PGRST116') {
            console.log("Profile not found");
            setProfileNotFound(true);
          } else {
            setError("Failed to load profile. Please try logging out and logging back in.");
          }
        } else {
          setProfile({ email: session.user.email, ...data });
        }
      } catch (e: any) {
        console.error("Error in profile page:", e);
        setError(e.message || 'Failed to load profile. Please try logging out and logging back in.');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, router]);

  useEffect(() => {
    if (profile?.username) {
      setUsernameInput(profile.username);
    }
  }, [profile?.username]);

  useEffect(() => {
    if (!profile || usernameInput === profile.username || usernameInput.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    let cancelled = false;
    setUsernameStatus('checking');
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/social/username-available?u=${encodeURIComponent(usernameInput)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setUsernameStatus('invalid');
        } else {
          setUsernameStatus(data.available ? 'available' : 'taken');
        }
      } catch {
        if (!cancelled) setUsernameStatus('idle');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [usernameInput, profile]);

  const handleSaveUsername = async () => {
    if (!profile || usernameStatus !== 'available') return;
    setSavingUsername(true);
    setUsernameSaveError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ username: usernameInput })
      .eq('id', profile.id);
    if (error) {
      const message = error.code === '23505' ? 'That username was just taken — try another.' : error.message;
      setUsernameSaveError(message);
      toast({ title: 'Could not save username', description: message, variant: 'destructive' });
    } else {
      setProfile((prev: any) => ({ ...prev, username: usernameInput }));
      setUsernameStatus('idle');
      toast({ description: 'Username saved' });
    }
    setSavingUsername(false);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (e) {
      console.error("Error signing out:", e);
      setError("Failed to log out. Please try again.");
      setLoggingOut(false);
    }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin w-8 h-8" />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Profile" />
      <main className="flex-1 container mx-auto p-4 pb-20">
        {error && (
          <div className="text-center my-12">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Error</h2>
            <p className="mb-6">{error}</p>
            <Button 
              variant="destructive"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
            </Button>
          </div>
        )}
        
        {!error && profileNotFound && (
          <div className="text-center my-12">
            <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Profile Not Found</h2>
            <p className="mb-2">We couldn&apos;t find your profile information.</p>
            {email && <p className="text-sm mb-6">Logged in as: {email}</p>}
            <div className="flex flex-col space-y-4 items-center">
              <Button 
                onClick={() => router.push('/signup/profile')}
              >
                Create Profile
              </Button>
              <Button 
                variant="destructive"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
              </Button>
            </div>
          </div>
        )}
        
        {!error && !profileNotFound && profile && (
          <>
            {/* Avatar + large name display */}
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              {userId && (
                <ProfileAvatar
                  userId={userId}
                  firstName={profile.firstName}
                  lastName={profile.lastName}
                  avatarUrl={profile.avatarUrl ?? null}
                  onUploaded={(url) => setProfile((prev: any) => ({ ...prev, avatarUrl: url }))}
                />
              )}
              <h1 className="text-3xl font-bold tracking-tight">{`${profile.firstName} ${profile.lastName}`}</h1>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Info */}
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
                    ['Activity Level', profile.activityLevel]
                  ].map(([label,value]) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="font-medium">{label}</span>
                      <span className="flex items-center gap-1">
                        {value}
                        <Tooltip>
                          <TooltipTrigger aria-label={`About ${label}`}>
                            <Info className="w-4 h-4 " />
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

              {/* Username */}
              <Card>
                <CardHeader>
                  <CardTitle>Username</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Label htmlFor="username" className="text-xs font-normal text-muted-foreground">
                    Friends find you by this username on the Social tab.
                  </Label>
                  <div className="flex gap-2">
                    <input
                      id="username"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      placeholder="username"
                    />
                    <Button
                      onClick={handleSaveUsername}
                      disabled={usernameStatus !== 'available' || savingUsername}
                    >
                      {savingUsername ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                  {usernameStatus === 'checking' && <p className="text-xs text-muted-foreground">Checking availability…</p>}
                  {usernameStatus === 'available' && <p className="text-xs text-success">Available</p>}
                  {usernameStatus === 'taken' && <p className="text-xs text-destructive">Already taken</p>}
                  {usernameStatus === 'invalid' && <p className="text-xs text-destructive">3-20 lowercase letters, digits, or underscores</p>}
                  {usernameSaveError && <p className="text-xs text-destructive">{usernameSaveError}</p>}
                </CardContent>
              </Card>

              {/* App */}
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
                      <Switch
                        checked={defaultApp === app.id}
                        onCheckedChange={() => handleSetDefaultApp(app.id)}
                      />
                    </div>
                  ))}
                  {(() => {
                    const enabled: AppId[] = profile.enabledApps ?? [];
                    const notEnabled = Object.values(APPS).filter(
                      (app) => app.id !== 'logbook' && !enabled.includes(app.id)
                    );
                    if (notEnabled.length === 0) return null;
                    return (
                      <div className="pt-3 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Add another app</p>
                        {notEnabled.map((app) => (
                          <Button
                            key={app.id}
                            variant="outline"
                            className="w-full justify-start"
                            disabled={addingApp === app.id}
                            onClick={() => handleAddApp(app.id)}
                          >
                            {addingApp === app.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {app.name}
                          </Button>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

            </div>

            {profile.isAdmin && (
              <div className="mt-6">
                <Link href="/adminlog" className="text-sm text-primary underline">
                  Open AdminLog →
                </Link>
              </div>
            )}

            <div className="mt-6 text-center">
              {/* Mobile: opens the slide-to-confirm overlay. Desktop: plain button. */}
              <Button
                variant="destructive"
                onClick={() => setLogoutOverlayOpen(true)}
                disabled={loggingOut}
                className="md:hidden"
              >
                {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
              </Button>
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={loggingOut}
                className="hidden md:inline-flex"
              >
                {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
              </Button>
            </div>
          </>
        )}
      </main>
      <LogoutOverlay
        open={logoutOverlayOpen}
        onOpenChange={setLogoutOverlayOpen}
        onConfirm={handleLogout}
      />
      <LogbookBottomNav />
    </div>
  );
}
