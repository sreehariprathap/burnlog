/* eslint-disable @typescript-eslint/no-explicit-any */
// components/ProfilePage.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Info, AlertTriangle, Sparkles, Bell, Flame, Settings, Cpu } from 'lucide-react';
import { OnboardingPageTogglesModal } from './_components/OnboardingPageTogglesModal';
import { AiModelSettingsModal } from './_components/AiModelSettingsModal';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { sendRealTestNotification } from '@/lib/pushNotification';

export default function ProfilePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [email, setEmail] = useState<string|null>(null);
  const [testSending, setTestSending] = useState(false);
  const [disablingAi, setDisablingAi] = useState(false);
  const [showPageToggles, setShowPageToggles] = useState(false);
  const [showAiModelSettings, setShowAiModelSettings] = useState(false);

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
        const userId = session.user.id;
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level')
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

  const handleSendTestPush = async () => {
    setTestSending(true);
    const result = await sendRealTestNotification();
    if (result.success) {
      alert('Test push sent - check for a real notification on this device.');
    } else {
      alert(`Test push failed: ${result.error || 'Unknown error'}`);
    }
    setTestSending(false);
  };

  const handleDisableAi = async () => {
    setDisablingAi(true);
    const { error } = await supabase
      .from('profiles')
      .update({ aiEnabled: false })
      .eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, aiEnabled: false }));
    }
    setDisablingAi(false);
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
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
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
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
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
            {/* Large name display */}
            <div className="mb-6 text-center">
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
                          <TooltipTrigger>
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

              {/* Health Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Health Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="bmi">
                      <AccordionTrigger>
                        BMI: {+(profile.weight/((profile.height/100)*(profile.height/100))).toFixed(1)} ({profile.weight/((profile.height/100)*(profile.height/100)) < 18.5 ? 'Underweight' : profile.weight/((profile.height/100)*(profile.height/100)) < 25 ? 'Normal' : profile.weight/((profile.height/100)*(profile.height/100)) < 30 ? 'Overweight' : 'Obese'})
                      </AccordionTrigger>
                      <AccordionContent>
                        <p>Your BMI category is <strong>{profile.weight/((profile.height/100)*(profile.height/100)) < 18.5 ? 'Underweight' : profile.weight/((profile.height/100)*(profile.height/100)) < 25 ? 'Normal' : profile.weight/((profile.height/100)*(profile.height/100)) < 30 ? 'Overweight' : 'Obese'}</strong>.</p>
                        <div className="h-2 bg-gray-200 rounded-full mt-2">
                          <div
                            className="h-2 bg-blue-500 rounded-full"
                            style={{ width: `${(+(profile.weight/((profile.height/100)*(profile.height/100))).toFixed(1)/40)*100}%` }}
                          />
                        </div>
                        <p className="text-sm  mt-1">
                          Underweight &lt;18.5 | Normal 18.5–24.9 | Overweight 25–29.9 | Obese 30+
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="bmr">
                      <AccordionTrigger>
                        BMR: {Math.round(10*profile.weight +6.25*profile.height -5*profile.age +5)} kcal/day
                      </AccordionTrigger>
                      <AccordionContent>
                        <p>Your Basal Metabolic Rate: <strong>{Math.round(10*profile.weight +6.25*profile.height -5*profile.age +5)}</strong> kcal/day.</p>
                        <div className="h-2 bg-gray-200 rounded-full mt-2">
                          <div
                            className="h-2 bg-green-500 rounded-full"
                            style={{ width: `${Math.min(Math.round(10*profile.weight +6.25*profile.height -5*profile.age +5)/3000,1)*100}%` }}
                          />
                        </div>
                        <p className="text-sm mt-1">
                          Avg male 1600–2400 | Avg female 1400–2000 kcal/day
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    Level {profile.level}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{profile.xp} xp</span>
                      <span>{100 - (profile.xp % 100)} xp to next level</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full">
                      <div
                        className="h-2 bg-orange-500 rounded-full"
                        style={{ width: `${(profile.xp % 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Current streak: <strong>{profile.currentStreak}</strong> day{profile.currentStreak === 1 ? '' : 's'}</span>
                    <span>Longest: <strong>{profile.longestStreak}</strong> day{profile.longestStreak === 1 ? '' : 's'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    AI Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {profile.aiEnabled
                      ? 'AI-powered suggestions are enabled for your account.'
                      : 'Enable AI to get a personalized workout plan based on your lifestyle.'}
                  </p>
                  {profile.aiEnabled ? (
                    <Button variant="outline" onClick={handleDisableAi} disabled={disablingAi}>
                      {disablingAi ? 'Disabling...' : 'Disable AI Insights'}
                    </Button>
                  ) : (
                    <Button onClick={() => router.push('/ai-setup?returnTo=/profile')}>
                      Enable AI Insights
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-amber-500" />
                      Test Push Notifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - send yourself a real push notification to verify delivery.
                    </p>
                    <Button onClick={handleSendTestPush} disabled={testSending}>
                      {testSending ? 'Sending...' : 'Send Test Push'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-amber-500" />
                      Onboarding Pages
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - control which advanced onboarding pages are shown to everyone
                      in the AI setup flow.
                    </p>
                    <Button variant="outline" onClick={() => setShowPageToggles(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      Manage Pages
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-amber-500" />
                      AI Model Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - choose which free OpenRouter model powers text and image AI features.
                    </p>
                    <Button variant="outline" onClick={() => setShowAiModelSettings(true)}>
                      <Cpu className="w-4 h-4 mr-2" />
                      Manage Models
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="mt-6 text-center">
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
              </Button>
            </div>
          </>
        )}
      </main>
      <OnboardingPageTogglesModal open={showPageToggles} onOpenChange={setShowPageToggles} />
      <AiModelSettingsModal open={showAiModelSettings} onOpenChange={setShowAiModelSettings} />
      <BottomNav />
    </div>
  );
}
