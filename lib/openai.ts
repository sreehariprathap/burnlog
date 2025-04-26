import OpenAI from 'openai';

// Initialize the OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Export a singleton instance
export default openai;

// Export common OpenAI methods with simplified interfaces
export const generateChatCompletion = async (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { model?: string; temperature?: number; max_tokens?: number }
) => {
    const response = await openai.chat.completions.create({
        model: options?.model || 'gpt-4',
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens,
    });

    return response.choices[0].message;
};

// Re-export types that might be commonly used
export type { ChatCompletionMessage } from 'openai/resources';