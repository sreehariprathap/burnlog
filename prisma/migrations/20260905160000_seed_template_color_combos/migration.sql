-- Seed template color combos
INSERT INTO "adminlog_color_combos"
  ("id", "name", "description", "primaryLight", "primaryDark", "backgroundLight", "backgroundDark", "isTemplate", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Ocean', 'Deep ocean blue with light cyan accents. Calm, professional, trustworthy.', '#0284c7', '#06b6d4', '#f0f9ff', '#0c2340', true, NOW(), NOW()),
  (gen_random_uuid(), 'Sunset', 'Warm orange and coral tones. Energetic, welcoming, friendly.', '#ea580c', '#fb923c', '#fff7ed', '#3d1d0d', true, NOW(), NOW()),
  (gen_random_uuid(), 'Forest', 'Deep green with natural earth tones. Grounded, sustainable, calm.', '#15803d', '#4ade80', '#f0fdf4', '#0b3a0b', true, NOW(), NOW()),
  (gen_random_uuid(), 'Minimalist', 'Pure black and white with neutral grays. Stark, focused, high-contrast.', '#000000', '#ffffff', '#ffffff', '#0a0a0a', true, NOW(), NOW()),
  (gen_random_uuid(), 'Vibrant', 'Electric magenta and bright purple. Bold, creative, energetic.', '#e91e63', '#ff4081', '#fce4ec', '#3a0520', true, NOW(), NOW()),
  (gen_random_uuid(), 'Neutral', 'Soft grays and taupes. Sophisticated, balanced, timeless.', '#57534e', '#a8a29e', '#fafaf9', '#28282828', true, NOW(), NOW()),
  (gen_random_uuid(), 'Cyberpunk', 'Neon cyan and pink on dark canvas. Futuristic, high-tech, intense.', '#00d9ff', '#ff006e', '#e0f7ff', '#0a0e27', true, NOW(), NOW()),
  (gen_random_uuid(), 'Warm', 'Terracotta and amber tones. Cozy, inviting, nurturing.', '#c2410c', '#f97316', '#fefce8', '#4c1d00', true, NOW(), NOW()),
  (gen_random_uuid(), 'Cool', 'Icy blues and purples. Calm, serene, contemplative.', '#3b82f6', '#60a5fa', '#eff6ff', '#0c1e3d', true, NOW(), NOW()),
  (gen_random_uuid(), 'Professional', 'Navy blue with corporate polish. Trustworthy, established, formal.', '#1e40af', '#60a5fa', '#f0f4f8', '#0f172a', true, NOW(), NOW()),
  (gen_random_uuid(), 'Pastel', 'Soft, muted colors. Gentle, approachable, whimsical.', '#e879f9', '#d8b4fe', '#faf5ff', '#2d1b4e', true, NOW(), NOW()),
  (gen_random_uuid(), 'Monochrome', 'Single hue throughout. Cohesive, sophisticated, unified.', '#7c3aed', '#c4b5fd', '#faf5ff', '#2e1065', true, NOW(), NOW());
