'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Session } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ProfileSetupPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName ] = useState('');
  const [age,       setAge     ] = useState<number>(0);
  const [weight,    setWeight  ] = useState('');
  const [height,    setHeight  ] = useState('');
  const [activityLevel, setActivityLevel] = useState<'low'|'medium'|'high'>('medium');

  // ensure logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } })=> {
      if (!session) router.replace('/login');
      else setSession(session);
      setLoading(false);
    });
  }, [supabase, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!session) {
      setError("No active session");
      setLoading(false);
      return;
    }
    
    const userId = session.user.id;
    
    try {
      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', userId)
        .single();
      
      let profileError;
      
      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({
            firstName, lastName,
            age, weight: parseFloat(weight),
            height: parseFloat(height),
            activityLevel
          })
          .eq('userId', userId);
        
        profileError = error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from('profiles')
          .insert({ 
            userId,
            firstName, lastName,
            age, weight: parseFloat(weight),
            height: parseFloat(height),
            activityLevel
          });
        
        profileError = error;
      }

      if (profileError) {
        console.error("Profile error:", profileError);
        setError(profileError.message);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Failed to save profile");
    }

    setLoading(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin"/></div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                value={age}
                onChange={e => setAge(Number(e.target.value))}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="weight">
                Current Weight (kg) ⚖️
              </Label>
              <Input
                id="weight"
                type="number"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="height">Height (cm) 📏</Label>
              <Input
                id="height"
                type="number"
                value={height}
                onChange={e => setHeight(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="activityLevel">
                Activity Level 🏃
              </Label>
              <Select
                value={activityLevel}
                onValueChange={value =>
                  setActivityLevel(value as 'low' | 'medium' | 'high')
                }
              >
                <SelectTrigger
                  id="activityLevel"
                  className="w-full"
                >
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader className="animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
