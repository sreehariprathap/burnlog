/* eslint-disable @typescript-eslint/no-explicit-any */
// components/ProfilePage.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';

export default function ProfilePage() {
  const supabase = createClientComponentClient();
  const router   = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: { session }, error: sessErr } = await supabase.auth.getSession();
        
        if (sessErr) {
          console.error("Session error:", sessErr);
          router.replace('/login');
          return;
        }

        if (!session) {
          console.log("No active session, redirecting to login");
          router.replace('/login');
          return;
        }

        const userId = session.user.id;
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('firstName,lastName,age,weight,height,activityLevel')
          .eq('userId', userId)
          .single();

        if (profErr) {
          console.error("Profile error:", profErr);
          
          // If data not found error, redirect to profile setup
          if (profErr.code === 'PGRST116') {
            console.log("Profile not found, redirecting to profile setup");
            router.replace('/signup/profile');
            return;
          } else {
            throw profErr;
          }
        }
        
        setProfile({ email: session.user.email, ...data });
      } catch (e: any) {
        console.error("Error in profile page:", e);
        setError(e.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin w-8 h-8" />
    </div>
  );
  if (error) return <p className="text-red-500 text-center mt-4">{error}</p>;
  if (!profile) return null;

  // Metrics
  const heightM = profile.height/100;
  const bmi     = +(profile.weight/(heightM*heightM)).toFixed(1);
  const bmiCategory = bmi<18.5 ? 'Underweight' : bmi<25 ? 'Normal' : bmi<30 ? 'Overweight' : 'Obese';
  const bmr     = Math.round(10*profile.weight +6.25*profile.height -5*profile.age +5);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Profile" />
      <main className="flex-1 container mx-auto p-4">
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
                    BMI: {bmi} ({bmiCategory})
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>Your BMI category is <strong>{bmiCategory}</strong>.</p>
                    <div className="h-2 bg-gray-200 rounded-full mt-2">
                      <div
                        className="h-2 bg-blue-500 rounded-full"
                        style={{ width: `${(bmi/40)*100}%` }}
                      />
                    </div>
                    <p className="text-sm  mt-1">
                      Underweight &lt;18.5 | Normal 18.5–24.9 | Overweight 25–29.9 | Obese 30+
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="bmr">
                  <AccordionTrigger>
                    BMR: {bmr} kcal/day
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>Your Basal Metabolic Rate: <strong>{bmr}</strong> kcal/day.</p>
                    <div className="h-2 bg-gray-200 rounded-full mt-2">
                      <div
                        className="h-2 bg-green-500 rounded-full"
                        style={{ width: `${Math.min(bmr/3000,1)*100}%` }}
                      />
                    </div>
                    <p className="text-sm  mt-1">
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
      </main>
      <BottomNav />
    </div>
  );
}
