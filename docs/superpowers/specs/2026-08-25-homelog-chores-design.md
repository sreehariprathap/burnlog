# HomeLog — Chores & Maintenance — Design (Sub-Project 2)

**Date:** 2026-08-25
**Status:** Approved design, pending spec review
**Depends on:** Household foundation (`2026-08-25-homelog-household-foundation-design.md`).

## Goal

Recurring chores (take out trash, weekly) and one-off maintenance tasks (change HVAC filter) that rotate automatically across household members, with completion tracked per occurrence.

## Decisions (locked during brainstorming)

1. **Auto-rotation:** completing a recurring chore's current occurrence assigns the next occurrence to the next member in the household (by `joinedAt` order, wrapping around).
2. **Recurrence shape:** mirrors `RecurringItem`'s fields (`frequency`: `'once' | 'weekly' | 'monthly' | 'yearly'`, `dayOfWeek`, `dayOfMonth`, `monthOfYear`) — familiar shape, but chores are **materialized per-occurrence** (unlike LifeLog's purely-virtual recurring items), because completion state and assignment must persist per occurrence, not be recomputed.
3. **Maintenance tasks** are just chores with `frequency: 'once'` — one instance, no rotation, no next-occurrence generation.
4. **All reads/writes go through service-role API routes** (`app/api/homelog/chores/*`), same reasoning as the household foundation: listing "assigned to Alex" requires reading Alex's name, which `profiles` RLS blocks for anyone but Alex.

## Data model

```prisma
model HouseholdChore {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  householdId String   @db.Uuid
  title       String
  category    String   // 'cleaning' | 'maintenance' | 'other'
  frequency   String   // 'once' | 'weekly' | 'monthly' | 'yearly'
  dayOfWeek   Int?     // 0-6, for weekly
  dayOfMonth  Int?     // for monthly/yearly
  monthOfYear Int?     // for yearly
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  instances   HouseholdChoreInstance[]

  @@map("household_chores")
}

model HouseholdChoreInstance {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  chore                 HouseholdChore @relation(fields: [choreId], references: [id], onDelete: Cascade)
  choreId               String    @db.Uuid
  dueDate               DateTime  @db.Date
  assignedProfileId     String?   @db.Uuid
  assignedProfile       Profile?  @relation("ChoreAssigned", fields: [assignedProfileId], references: [id])
  completedAt           DateTime?
  completedByProfileId  String?   @db.Uuid
  completedByProfile    Profile?  @relation("ChoreCompletedBy", fields: [completedByProfileId], references: [id])
  createdAt             DateTime  @default(now())

  @@map("household_chore_instances")
}
```

`Profile` gains `choresAssigned HouseholdChoreInstance[] @relation("ChoreAssigned")` and `choresCompleted HouseholdChoreInstance[] @relation("ChoreCompletedBy")`.

## Recurrence logic — `lib/homelog/choreRecurrence.ts`

```ts
export function nextOccurrenceAfter(
  chore: { frequency: string; dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null },
  after: Date
): Date | null // null for 'once' — no next occurrence
```

- `weekly`: next date matching `dayOfWeek` strictly after `after`.
- `monthly`: next date matching `dayOfMonth` (clamped to month length) strictly after `after`.
- `yearly`: next date matching `monthOfYear`/`dayOfMonth` strictly after `after`.
- `once`: returns `null`.

## API routes (`app/api/homelog/chores/*`, service-role, mirrors household routes)

- `GET /api/homelog/chores` — my household's active chores, each with its **current open instance** (earliest incomplete `dueDate`), assignee name, and category. Lazily creates the first instance for any chore that has none yet (due today).
- `POST /api/homelog/chores` — `{ title, category, frequency, dayOfWeek?, dayOfMonth?, monthOfYear?, dueDate }`. Creates the chore + its first instance (assigned to the creator).
- `POST /api/homelog/chores/instances/[id]/complete` — marks `completedAt`/`completedByProfileId`. If the parent chore isn't `'once'`, computes `nextOccurrenceAfter` and creates the next instance, assigned to the next member after the current assignee (household member list ordered by `joinedAt`, wrapping).
- `DELETE /api/homelog/chores/[id]` — deletes a chore (any member; cascades its instances).

## Page — `/homelog/chores`

New tab in `HomeLogBottomNav` (`Home | Chores`). List of open instances (title, category badge, due date, assignee avatar/name), "Mark done" per row, "+ Add chore" form (title, category select, frequency select with conditional day pickers, initial due date). Completed-today items show briefly with a strikethrough before dropping off on next refresh (no separate "history" view in v1).

## Testing

Manual, two accounts: create a weekly chore, complete its instance as member A, confirm the next instance is auto-assigned to member B; add a one-off maintenance task and confirm no next instance is generated after completing it.
