// lib/tasklog/breakdownPrompt.ts

export function buildBreakdownPrompt(title: string, description: string, category: string, customInstructions?: string): string {
  return `You are a productivity coach breaking a goal into concrete, actionable tasks.

Goal title: ${title}
Goal description: ${description || 'None provided'}
Goal category: ${category}

Generate 4 to 8 concrete tasks that would make meaningful progress on this goal. Each task should be a single, specific action (not vague), with a one-to-two sentence description explaining what doing it actually involves.
${customInstructions ? `\nAdditional instructions from the user (follow these unless they conflict with the rules above): ${customInstructions}\n` : ''}
Respond with ONLY a JSON object, no markdown, in this exact shape:
{"tasks": [{"title": "...", "description": "...", "category": "life or work", "priority": "low, medium, or high", "suggestedDueDate": "YYYY-MM-DD or null"}]}`;
}
