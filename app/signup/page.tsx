'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem
} from '@/components/ui/select';
import { Loader } from 'lucide-react';

export default function SignupPage() {
    const supabase = createClientComponentClient();
    const router = useRouter();

    // Steps: 0 = auth, 1 = profile, 2 = welcome
    const [step, setStep] = useState<0 | 1 | 2>(0);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [age, setAge] = useState(0);
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [activityLevel, setActivityLevel] = useState<'low' | 'medium' | 'high'>('medium');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleBack = useCallback(() => {
        setError(null);
        setLoading(false);
        setStep((prev) => Math.max(0, prev - 1) as 0 | 1 | 2);
    }, []);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setLoading(true);
            setError(null);

            // Sign up
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password
            });
            if (authError) {
                setError(authError.message);
                setLoading(false);
                return;
            }

            // Insert profile
            const userId = authData.user?.id;
            if (userId) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert({
                        id: userId,
                        userId,
                        firstName,
                        lastName,
                        age: age,
                        weight: parseFloat(weight),
                        height: parseFloat(height),
                        activityLevel: activityLevel
                    });
                if (profileError) {
                    setError(profileError.message);
                    setLoading(false);
                    return;
                }
                // Move to welcome step
                setLoading(false);
                setStep(2);
            }
        },
        [email, password, firstName,lastName,age, weight, height, activityLevel, supabase]
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center">
                        {step === 0
                            ? 'Create Account 📄'
                            : step === 1
                                ? 'Your Profile 👤'
                                : 'Welcome to Gymlog 🎉'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {step < 2 ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {step === 0 && (
                                <div className="space-y-6">
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="password">Password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {step === 1 && (
                                <div className="space-y-6">
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="firstName">First Name</Label>
                                        <Input
                                            id="firstName"
                                            type="string"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="lastName">Last Name</Label>
                                        <Input
                                            id="lastName"
                                            type="string"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="age">Age</Label>
                                        <Input
                                            id="age"
                                            type="number"
                                            value={age}
                                            onChange={(e) => setAge(Number(e.target.value))}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="weight">Current Weight (kg) ⚖️</Label>
                                        <Input
                                            id="weight"
                                            type="number"
                                            value={weight}
                                            onChange={(e) => setWeight(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="height">Height (cm) 📏</Label>
                                        <Input
                                            id="height"
                                            type="number"
                                            value={height}
                                            onChange={(e) => setHeight(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="activity_level">Activity Level 🏃</Label>
                                        <Select
                                            value={activityLevel}
                                            onValueChange={(value) => setActivityLevel(value as 'low' | 'medium' | 'high')}
                                        >
                                            <SelectTrigger id="activity_level" className="w-full">
                                                <SelectValue placeholder="Select level" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="low">Low</SelectItem>
                                                <SelectItem value="medium">Medium</SelectItem>
                                                <SelectItem value="high">High</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}

                            {error && <p className="text-red-500 text-sm">{error}</p>}

                            <div className="flex justify-between">
                                {step > 0 && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleBack}
                                        disabled={loading}
                                    >
                                        Back
                                    </Button>
                                )}
                                <div className="ml-auto">
                                    {step < 1 ? (
                                        <Button type="submit" disabled={loading} onClick={() => setStep((step + 1) as 0 | 1 | 2)}>
                                            Next
                                        </Button>
                                    ) : (
                                        <Button type="submit" disabled={loading}>
                                            {loading ? <Loader className='animate-spin'/> : 'Submit'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-6 text-center">
                            <p className="text-base">
                                You’re all set! Would you like to set your fitness goals now?
                            </p>
                            <div className="flex justify-center gap-4">
                                <Button onClick={() => router.push('/goals')}>
                                    Set Fitness Goals
                                </Button>
                                <Button variant="outline" onClick={() => router.push('/dashboard')}>
                                    Skip
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
