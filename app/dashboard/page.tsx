'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SetGoalsPrompt } from './_components/SetGoalsPrompt';
import { PushNotificationPrompt } from './_components/PushNotificationPrompt';
import { Skeleton } from '@/components/ui/skeleton';

interface FitnessGoal {
  id: string;
  goalType: string;
  targetValue: number | string;
}

export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [goals, setGoals] = useState<FitnessGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('userId', user.id)
          .single();
          
        setUserProfile(profile);
        
        // Get user goals
        const { data: goalsData } = await supabase
          .from('fitness_goals')
          .select('*')
          .eq('profileId', profile?.id);
          
        setGoals(goalsData || []);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();

    // Register Service Worker for PWA functionality
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('Service Worker registered with scope:', registration.scope);
          })
          .catch((error) => {
            console.error('Service Worker registration failed:', error);
          });
      });
    }

    // Set up "Add to Home Screen" prompt listener
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      // Update UI to notify the user they can install the PWA
      setIsInstallable(true);
    });

    // Handle installed event
    window.addEventListener('appinstalled', () => {
      // Log install to analytics
      console.log('PWA was installed');
      setIsInstallable(false);
    });
  }, [supabase]);

  const installApp = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, clear it
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  return (
    <div className="pb-16">
      <TopBar title="Dashboard" />
      <main className="p-4 mt-4 space-y-6">
        {/* Push Notification Prompt */}
        <PushNotificationPrompt />

        {/* Install App Prompt */}
        {isInstallable && (
          <Card className="mb-4 border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Install Gymlog App</h3>
                  <p className="text-sm text-muted-foreground">Add to your home screen for quick access</p>
                </div>
                <button
                  onClick={installApp}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Install
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Welcome Card */}
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold">
                  Hello, {userProfile?.firstName || 'there'}!
                </h2>
                <p className="text-muted-foreground">
                  Welcome to your fitness dashboard
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Goals Card */}
        {loading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-1/3" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ) : goals.length === 0 ? (
          <SetGoalsPrompt />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {goals.map((goal) => (
                <div key={goal.id} className="flex justify-between pb-2 border-b">
                  <span className="font-medium">
                    {goal.goalType.split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </span>
                  <span>{goal.targetValue}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        
        {/* Quick Access Card */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <a 
                href="/session" 
                className="p-4 bg-blue-50 rounded-md text-center hover:bg-blue-100 transition-colors"
              >
                Start Workout
              </a>
              <a 
                href="/goals" 
                className="p-4 bg-green-50 rounded-md text-center hover:bg-green-100 transition-colors"
              >
                Track Progress
              </a>
            </div>
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
