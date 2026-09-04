'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { generateUsername, isValidUsername } from '@/lib/username';
import { OnboardingProgressBar } from '@/components/onboarding/OnboardingProgressBar';
import { HorizontalStepper } from '@/components/ui/horizontal-stepper';
import { appSearchColor } from '@/lib/search/registry';

export default function ProfileSetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [profileExists, setProfileExists] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'checking' | 'available' | 'taken' | 'invalid' | 'idle'>('idle');

  // Check if user is logged in and if they have a profile
  useEffect(() => {
    async function checkSessionAndProfile() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Session error:", sessionError);
          router.replace('/login');
          return;
        }

        if (!session) {
          console.log("No active session, redirecting to login");
          router.replace('/login');
          return;
        }

        setSession(session);

        // Check if profile already exists
        const { data: existingProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('userId', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error("Error checking profile:", profileError);
          setError("Failed to check profile status");
        }

        if (existingProfile) {
          // Profile already exists, redirect to Logbook (the app's home)
          setProfileExists(true);
          router.replace('/logbook');
        }
      } catch (err) {
        console.error("Error in session check:", err);
        setError("An error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    checkSessionAndProfile();
  }, [supabase, router]);

  // Seed the username suggestion once firstName is available.
  useEffect(() => {
    if (!username && firstName) {
      setUsername(generateUsername(firstName));
    }
  }, [firstName]);

  // Live availability check, debounced.
  useEffect(() => {
    if (!username) {
      setUsernameStatus('idle');
      return;
    }
    if (!isValidUsername(username)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username-available?u=${encodeURIComponent(username)}`);
        const data = await res.json();
        setUsernameStatus(data.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!session) {
      setError("No active session");
      setLoading(false);
      return;
    }

    if (usernameStatus !== 'available') {
      setError("Please choose an available username");
      setLoading(false);
      return;
    }

    const userId = session.user.id;

    try {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          userId,
          firstName, lastName,
          dateOfBirth, city, country, postalCode,
          username,
        });

      if (insertError) {
        console.error("Profile error:", insertError);
        setError(insertError.message);
      } else {
        // Best-effort: mark a matching pending invite as signed_up via the
        // service-role route (a brand-new user has no admin rights to write
        // adminlog_invites directly, and it shouldn't need any). Never
        // blocks or fails signup — this is a courtesy record, not a gate.
        if (session.user.email) {
          fetch('/api/invites/mark-signed-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: session.user.email }),
          }).catch(() => {
            // no-op — invite tracking is not required for signup to succeed
          });
        }
        router.push('/onboarding/ai-insights');
      }
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Failed to save profile");
    }

    setLoading(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin"/></div>;

  // Don't show the form if the profile exists (should redirect)
  if (profileExists) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin"/></div>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-50 p-4">
      <HorizontalStepper
        steps={[
          { label: 'Profile', state: 'active' },
          { label: 'AI Insights', state: 'default' },
          { label: 'Apps', state: 'default' },
        ]}
      />
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Set Up Profile</CardTitle></CardHeader>
        <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob" type="date" required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="Vancouver" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" required value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal / ZIP code</Label>
              <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="V6B 1A1" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username" required value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
              {usernameStatus === 'checking' && <p className="text-xs text-muted-foreground">Checking…</p>}
              {usernameStatus === 'available' && <p className="text-xs text-green-600">@{username} is available</p>}
              {usernameStatus === 'taken' && <p className="text-xs text-destructive">That username is taken</p>}
              {usernameStatus === 'invalid' && <p className="text-xs text-destructive">3-20 lowercase letters, digits, or underscores</p>}
            </div>

            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={loading || usernameStatus !== 'available'}>
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <OnboardingProgressBar current={1} total={3} color={appSearchColor('logbook')} />
    </div>
  );
}
