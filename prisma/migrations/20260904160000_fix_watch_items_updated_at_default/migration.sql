-- The original watch_items migration (20260904120000_add_watchlog) declared
-- updatedAt as NOT NULL with no DEFAULT, even though schema.prisma always
-- said `@default(now()) @updatedAt` — a hand-authoring mistake in that raw
-- SQL file. Every write to watch_items goes through the Supabase JS client
-- (not Prisma Client), which is the only thing that would have applied
-- Prisma's @updatedAt behavior, so nothing has ever populated this column:
-- every INSERT into watch_items has failed with a NOT NULL violation.
ALTER TABLE "watch_items" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
