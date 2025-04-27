'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';

export default function ProfilePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  // fetch user profile and session
  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      const { data: { session }, error: sessError } = await supabase.auth.getSession();
      if (sessError || !session) {
        router.replace('/auth/login');
        return;
      }
      const userId = session.user.id;
      const { data, error: profError } = await supabase
        .from('profiles')
        .select('firstName, lastName, age, weight, height, activityLevel')
        .eq('id', userId)
        .single();
      if (profError) {
        setError(profError.message);
      } else {
        setProfile({ email: session.user.email, ...data });
      }
      setLoading(false);
    }
    loadProfile();
  }, [supabase, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  // Calculate metrics
  const heightM = profile.height / 100;
  const bmi = +(profile.weight / (heightM * heightM)).toFixed(1);
  let bmiCategory = '';
  if (bmi < 18.5) bmiCategory = 'Underweight';
  else if (bmi < 25) bmiCategory = 'Normal';
  else if (bmi < 30) bmiCategory = 'Overweight';
  else bmiCategory = 'Obese';

  // BMR using Mifflin-St Jeor formula (male assumption)
  const bmr = Math.round(10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5);

  return (
    <div className="min-h-screen  flex flex-col gap-5 items-center pb-16">
    <TopBar title="Profile" />
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4">
          {/* Name */}
          <div className="flex items-center justify-between">
            <span className="text-3xl font-">{profile.firstName} {profile.lastName}</span>
          </div>
          {/* Age */}
          <div className="flex items-center justify-between">
            <span>Age: {profile.age}</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Your age in years.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Email */}
          <div className="flex items-center justify-between">
            <span>Email: {profile.email}</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>The email address linked to your account.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Height */}
          <div className="flex items-center justify-between">
            <span>Height: {profile.height} cm</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Your height in centimeters; used in BMI & BMR calculations.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Weight */}
          <div className="flex items-center justify-between">
            <span>Weight: {profile.weight} kg</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Your weight in kilograms; used in BMI & BMR calculations.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* BMI */}
          <div className="flex items-center justify-between">
            <span>BMI: {bmi} ({bmiCategory})</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Body Mass Index: weight/height². Categories:
                  Underweight (&lt;18.5), Normal (18.5–24.9), Overweight (25–29.9), Obese (30+).
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* BMR */}
          <div className="flex items-center justify-between">
            <span>BMR: {bmr} kcal/day</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Basal Metabolic Rate: estimated calories needed at rest
                  (Mifflin-St Jeor, male).
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Logout */}
          <div className="flex justify-center mt-4">
            <Button variant="destructive" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <BottomNav />
    </div>
  );
}
