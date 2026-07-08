import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateWorkoutPlan } from '@/lib/ai/openrouter';
import type { LifestyleAnswers } from '@/lib/ai/types';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';

function isValidLifestyleAnswers(body: unknown): body is LifestyleAnswers {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.jobType === 'string' &&
    typeof b.hoursSitting === 'string' &&
    typeof b.commuteActivity === 'string' &&
    typeof b.exerciseFrequency === 'string' &&
    typeof b.goalFocus === 'string' &&
    typeof b.injuries === 'string' &&
    typeof b.preferredTrainingDays === 'number' &&
    b.preferredTrainingDays >= 3 &&
    b.preferredTrainingDays <= 6
  );
}

export async function POST(request: Request) {
  let model = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    if (!isValidLifestyleAnswers(body)) {
      return NextResponse.json({ error: 'Invalid lifestyle answers' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('age, weight, height, activityLevel')
      .eq('userId', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    model = await getModel(supabase, 'text');

    try {
      const plan = await generateWorkoutPlan(profile, body, model);
      return NextResponse.json({ plan });
    } catch (firstError) {
      console.error('AI plan generation failed, retrying once:', firstError);
      try {
        const plan = await generateWorkoutPlan(profile, body, model);
        return NextResponse.json({ plan });
      } catch (secondError) {
        console.error('AI plan generation failed on retry:', secondError);
        return NextResponse.json({ error: formatAiError(model, secondError) }, { status: 502 });
      }
    }
  } catch (error) {
    console.error('Unexpected error in /api/ai/workout-plan:', error);
    return NextResponse.json({ error: formatAiError(model, error) }, { status: 500 });
  }
}
