/* eslint-disable @typescript-eslint/no-explicit-any */
// components/ProfilePage.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Info, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';

export default function ProfilePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [email, setEmail] = useState<string|null>(null);

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
          .select('firstName,lastName,age,weight,height,activityLevel')
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
      <main className="flex-1 container mx-auto p-4">
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
      <BottomNav />
    </div>
  );
}
