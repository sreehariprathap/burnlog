// lib/theme/colorCombos.ts
//
// Template color palettes (combos) shipped with the app. Admins can also
// create custom combos via AdminLog > UI > Color Combos. Each combo bundles
// primaryLight/Dark and backgroundLight/Dark into a cohesive set.

export interface ColorCombo {
  id: string;
  name: string;
  description: string;
  primaryLight: string;
  primaryDark: string;
  backgroundLight: string;
  backgroundDark: string;
  isTemplate: boolean;
}

export const TEMPLATE_COLOR_COMBOS: Omit<ColorCombo, 'isTemplate'>[] = [
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep ocean blue with light cyan accents. Calm, professional, trustworthy.',
    primaryLight: '#0284c7',
    primaryDark: '#06b6d4',
    backgroundLight: '#f0f9ff',
    backgroundDark: '#0c2340',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and coral tones. Energetic, welcoming, friendly.',
    primaryLight: '#ea580c',
    primaryDark: '#fb923c',
    backgroundLight: '#fff7ed',
    backgroundDark: '#3d1d0d',
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green with natural earth tones. Grounded, sustainable, calm.',
    primaryLight: '#15803d',
    primaryDark: '#4ade80',
    backgroundLight: '#f0fdf4',
    backgroundDark: '#0b3a0b',
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Pure black and white with neutral grays. Stark, focused, high-contrast.',
    primaryLight: '#000000',
    primaryDark: '#ffffff',
    backgroundLight: '#ffffff',
    backgroundDark: '#0a0a0a',
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    description: 'Electric magenta and bright purple. Bold, creative, energetic.',
    primaryLight: '#e91e63',
    primaryDark: '#ff4081',
    backgroundLight: '#fce4ec',
    backgroundDark: '#3a0520',
  },
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Soft grays and taupes. Sophisticated, balanced, timeless.',
    primaryLight: '#57534e',
    primaryDark: '#a8a29e',
    backgroundLight: '#fafaf9',
    backgroundDark: '#28282828',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon cyan and pink on dark canvas. Futuristic, high-tech, intense.',
    primaryLight: '#00d9ff',
    primaryDark: '#ff006e',
    backgroundLight: '#e0f7ff',
    backgroundDark: '#0a0e27',
  },
  {
    id: 'warm',
    name: 'Warm',
    description: 'Terracotta and amber tones. Cozy, inviting, nurturing.',
    primaryLight: '#c2410c',
    primaryDark: '#f97316',
    backgroundLight: '#fefce8',
    backgroundDark: '#4c1d00',
  },
  {
    id: 'cool',
    name: 'Cool',
    description: 'Icy blues and purples. Calm, serene, contemplative.',
    primaryLight: '#3b82f6',
    primaryDark: '#60a5fa',
    backgroundLight: '#eff6ff',
    backgroundDark: '#0c1e3d',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Navy blue with corporate polish. Trustworthy, established, formal.',
    primaryLight: '#1e40af',
    primaryDark: '#60a5fa',
    backgroundLight: '#f0f4f8',
    backgroundDark: '#0f172a',
  },
  {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft, muted colors. Gentle, approachable, whimsical.',
    primaryLight: '#e879f9',
    primaryDark: '#d8b4fe',
    backgroundLight: '#faf5ff',
    backgroundDark: '#2d1b4e',
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Single hue throughout. Cohesive, sophisticated, unified.',
    primaryLight: '#7c3aed',
    primaryDark: '#c4b5fd',
    backgroundLight: '#faf5ff',
    backgroundDark: '#2e1065',
  },
];
