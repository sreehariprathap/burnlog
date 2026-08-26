# HomeLog — Inventory & Shopping — Design (Sub-Project 3)

**Date:** 2026-08-25
**Status:** Approved design, pending spec review
**Depends on:** Household foundation (`2026-08-25-homelog-household-foundation-design.md`).

## Goal

Track what the household has on hand (pantry/household supplies) with an auto-populating shared shopping list — no manual "please someone add milk to the list" step required.

## Decisions (locked during brainstorming)

1. **Auto-flag low stock:** each inventory item has a `lowStockThreshold`; when its `quantity` drops to or below that, it's auto-added to the shopping list (if not already present).
2. **Restock on check-off:** checking a shopping list item off resets its linked inventory item's quantity back above threshold and marks it in-stock — closes the loop instead of leaving inventory stale.
3. **API-route mediated**, same reasoning as chores/households: listing "added by Sam" requires reading Sam's name.

## Data model

```prisma
model HouseholdInventoryItem {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  household         Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  householdId       String   @db.Uuid
  name              String
  category          String   // 'pantry' | 'household' | 'other'
  quantity          Int      @default(1)
  lowStockThreshold Int      @default(1)
  status            String   @default("in_stock") // 'in_stock' | 'low' | 'out'
  createdAt         DateTime @default(now())
  shoppingListItems HouseholdShoppingListItem[]

  @@map("household_inventory_items")
}

model HouseholdShoppingListItem {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  household       Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  householdId     String    @db.Uuid
  inventoryItem   HouseholdInventoryItem? @relation(fields: [inventoryItemId], references: [id], onDelete: SetNull)
  inventoryItemId String?   @db.Uuid
  label           String    // denormalized name — works even for items with no inventory link
  addedByProfileId String   @db.Uuid
  addedByProfile  Profile   @relation(fields: [addedByProfileId], references: [id])
  checkedAt       DateTime?
  createdAt       DateTime  @default(now())

  @@map("household_shopping_list_items")
}
```

`quantity` is edited via +/- steppers, not raw text input, to keep it always a valid integer.

## API routes (`app/api/homelog/inventory/*`, `app/api/homelog/shopping-list/*`, service-role)

- `GET /api/homelog/inventory` — my household's items.
- `POST /api/homelog/inventory` — `{ name, category, quantity, lowStockThreshold }`.
- `POST /api/homelog/inventory/[id]/adjust` — `{ delta: number }`. Applies `quantity += delta` (floored at 0), recomputes `status` (`out` at 0, `low` at ≤ threshold, else `in_stock`), and if the new status is `low`/`out` and no active (unchecked) shopping list entry exists for this item, creates one.
- `DELETE /api/homelog/inventory/[id]`.
- `GET /api/homelog/shopping-list` — active (unchecked) items for my household, newest first.
- `POST /api/homelog/shopping-list` — `{ label, inventoryItemId? }` — manual add, doesn't require an inventory link.
- `POST /api/homelog/shopping-list/[id]/check` — sets `checkedAt`; if `inventoryItemId` is set, resets that item's `quantity` to `lowStockThreshold + 1` and `status` to `'in_stock'`.
- `DELETE /api/homelog/shopping-list/[id]` — remove without checking (e.g. added by mistake).

## Pages — `/homelog/inventory`, tab within the same nav item as a two-tab view (Inventory / Shopping List)

New "Inventory" tab in `HomeLogBottomNav` (`Home | Chores | Inventory`). Uses the existing `SmoothTabs`/two-panel pattern already used elsewhere (e.g. LifeLog's period tabs) to switch between:
- **Inventory:** list of items (name, category, quantity with +/- steppers, status badge), "+ Add item" form.
- **Shopping List:** checklist of active items (label, added-by name), tap to check off, "+ Add item" (manual, unlinked) form.

## Testing

Manual, two accounts: add an inventory item with threshold 2 and quantity 3; decrement to 2, confirm it auto-appears on the shopping list and status shows "low"; check it off, confirm quantity resets above threshold and it disappears from the active shopping list.
