// lib/ai/modelTestPresets.ts
// Fixed prompts for the AdminLog "AI Model Test" page — same three prompts
// every time so runs are comparable across models.

export type ModelTestPresetId = 'small' | 'medium' | 'large';

export interface ModelTestPreset {
  id: ModelTestPresetId;
  label: string;
  description: string;
  prompt: string;
}

export const MODEL_TEST_PRESETS: Record<ModelTestPresetId, ModelTestPreset> = {
  small: {
    id: 'small',
    label: 'Small context',
    description: 'A one-line question — measures bare latency with almost no input or output.',
    prompt: 'What is the capital of France? Answer in one word.',
  },
  medium: {
    id: 'medium',
    label: 'Medium context',
    description: 'A few paragraphs to summarize — measures handling of a moderate amount of input.',
    prompt: `Summarize the following in exactly 3 bullet points:

The Roman Empire was one of the largest empires in history, spanning three continents at its height: Europe, North Africa, and the Middle East. It began as a small city-state in Italy around 753 BC and grew through centuries of conquest and diplomacy into a vast, multi-ethnic state. Roman engineering — roads, aqueducts, and concrete construction — enabled the empire to govern territory that would otherwise have been impossible to administer with ancient technology. The empire's legal system, based on codified law and the idea that even rulers were bound by it, influenced legal traditions across Europe for two thousand years afterward.

The empire's decline was gradual rather than sudden, driven by a combination of economic strain, military overextension, political instability, and pressure from migrating peoples along its borders. The Western Roman Empire formally ended in 476 AD when the last emperor was deposed, though the Eastern Roman Empire, later known as the Byzantine Empire, continued for another thousand years until the fall of Constantinople in 1453. Even after its political collapse, Rome's influence persisted through language (the Romance languages), religion (the spread of Christianity as the state religion), and institutions that shaped medieval and modern Europe.`,
  },
  large: {
    id: 'large',
    label: 'Large output',
    description: 'Asks for a long, structured response — measures sustained output throughput.',
    prompt: `You are a certified personal trainer. Write a detailed 7-day beginner workout plan.
For each day, list the day name, a short focus (e.g. "Rest", "Upper Body", "Cardio"), and
3-6 exercises with sets and reps. Format it as clearly labeled sections per day, in plain text.`,
  },
};

export const MODEL_TEST_PRESET_LIST = Object.values(MODEL_TEST_PRESETS);
