# HomeLog

Household management sub-app — chores, bills, shared inventory, and
expense-splitting for a household of multiple members. One of seven
sub-apps under LogBook — see the [root README](../../README.md) for how it
fits into the wider app.

## What it does

- **Home** (`/homelog`) — household overview.
- **Chores** (`/homelog/chores`) — recurring/assigned chores and chore
  instances.
- **Bills** (`/homelog/bills`) — shared bills, expenses, and expense
  splitting/settlement between household members.
- **Inventory** (`/homelog/inventory`) — shared household inventory and
  shopping-list items.
- **Config** (`/homelog/config`) — HomeLog-specific settings plus "Export
  config as JSON". No dedicated onboarding flow yet.

A household has members (invited via `HouseholdInvite`) who share the same
chore/bill/inventory data — this is the one sub-app built around
multi-person shared state rather than a single user's own data.

## Routes

```
/homelog             Home
/homelog/chores        Chores
/homelog/bills           Bills & expense splitting
/homelog/inventory         Shared inventory
/homelog/config               Settings
```

## Data model

Prisma models: `Household`, `HouseholdMember`, `HouseholdInvite`,
`HouseholdChore`, `HouseholdChoreInstance`, `HouseholdInventoryItem`,
`HouseholdShoppingListItem`, `HouseholdExpense`, `HouseholdExpenseSplit`,
`HouseholdSettlement`. Shares the top-level `Profile` model with every
other app.

## Key files

```
app/(homelog)/
  layout.tsx           Route-group layout/theming
  homelog/page.tsx        Home
  homelog/chores/            Chores
  homelog/bills/                Bills & splitting
  homelog/inventory/               Shared inventory
  homelog/config/                     Settings
components/HomeLogBottomNav.tsx        HomeLog's bottom nav
lib/homelog/                             HomeLog-specific helpers
```
