import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateProgram } from '@/lib/ai/program';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';

export async function POST(request: Request) {
  let model = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const pastedPlanText = typeof body?.pastedPlanText === 'string' ? body.pastedPlanText.trim() : '';
    if (!pastedPlanText || pastedPlanText.length < 20) {
      return NextResponse.json({ error: 'Please paste your plan text (at least 20 characters)' }, { status: 400 });
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
      const program = await generateProgram(profile, pastedPlanText, model);
      return NextResponse.json({ program });
    } catch (firstError) {
      console.error('AI program generation failed, retrying once:', firstError);
      try {
        const program = await generateProgram(profile, pastedPlanText, model);
        return NextResponse.json({ program });
      } catch (secondError) {
        console.error('AI program generation failed on retry:', secondError);
        return NextResponse.json({ error: formatAiError(model, secondError) }, { status: 502 });
      }
    }
  } catch (error) {
    console.error('Unexpected error in /api/ai/program:', error);
    return NextResponse.json({ error: formatAiError(model, error) }, { status: 500 });
  }
}
