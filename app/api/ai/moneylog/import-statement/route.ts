import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { buildStatementImportPrompt, parseStatementJson, type AccountType } from '@/lib/moneylog/statementImportPrompt';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const MAX_BASE64_LENGTH = 10 * 1024 * 1024 * 1.4; // ~10MB of binary, base64-inflated

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, isAdmin')
      .eq('userId', user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!profile.isAdmin) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { pdfBase64, filename, bank, accountType, periodStart, periodEnd } = body as {
      pdfBase64: string;
      filename: string;
      bank: string;
      accountType: AccountType;
      periodStart: string;
      periodEnd: string;
    };

    if (!pdfBase64 || !bank || !accountType || !periodStart || !periodEnd) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (pdfBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'PDF must be under 10 MB' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'vision');
    const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    const prompt = buildStatementImportPrompt({ bank, accountType, periodStart, periodEnd });

    try {
      const transactions = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'moneylog-import-statement', app: 'moneylog', model: MODEL },
        { bank, accountType, periodStart, periodEnd },
        async () => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.1,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    file: {
                      filename: filename || 'statement.pdf',
                      file_data: `data:application/pdf;base64,${base64Data}`,
                    },
                  } as never,
                  { type: 'text', text: prompt },
                ],
              },
            ],
            response_format: { type: 'json_object' },
          });

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          try {
            return parseStatementJson(content);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'AI response could not be parsed into transactions';
            throw new AiRouteError(message, 502);
          }
        }
      );

      return NextResponse.json({ transactions });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('moneylog/import-statement error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
