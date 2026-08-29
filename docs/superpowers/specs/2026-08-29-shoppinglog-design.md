# ShoppingLog — Design

**Date:** 2026-08-29
**Status:** Approved design, implementing directly per explicit user direction ("implement it, don't wait for approval")
**Parent effort:** Add a sixth sub-app "ShoppingLog" — a Facebook Marketplace × Amazon hybrid: peer-to-peer listings (new and used items) browsable by category, with a cart/checkout flow and payment recorded as a MoneyLog ledger entry (no real money movement in v1, per explicit decision).

## Goal

Users can list items (new or used) for sale with photos, browse/search by category, add items to a cart, check out (creating one order per seller, since a cart can span multiple sellers — mirrors Amazon's per-seller shipment split), and see the purchase/sale reflected as an expense/income transaction in MoneyLog. Buyers can leave a rating + review on items they've actually purchased.

## Non-Goals (v1)

- Real payment processing (Stripe, escrow, payouts) — ledger entry only, per explicit decision.
- Buyer-seller messaging/negotiation (Facebook Marketplace's chat) — out of scope for v1; nothing here blocks adding it later as its own sub-project.
- Shipping/fulfillment tracking, order status beyond "completed" — checkout is instant and final in v1, no seller confirmation step.
- Listing moderation/reporting.
- Multi-currency — amounts are plain floats, same convention as `FinanceTransaction.amount`.

## Decisions

1. **Payment integration**: ledger-only. Checkout inserts a `FinanceTransaction` (expense) for the buyer and one (income) for the seller into MoneyLog's existing `finance_transactions` table — no new payment infrastructure.
2. **Cart spanning multiple sellers**: checkout creates one `ShopOrder` per distinct seller in the cart (Amazon's split-shipment model), each with its own ledger transaction pair.
3. **Stock**: `ShopListing.stockQuantity` (default 1) lets "new" listings represent multiple identical units; "used" listings are naturally always `stockQuantity: 1`. Checkout decrements it; a listing auto-flips to `status: 'sold'` when it hits 0.
4. **Reviews**: gated to buyers who actually purchased the listing (checked via `ShopOrderItem` existence), one review per (reviewer, listing) pair.
5. **Categories**: a small fixed, seeded set (not user-created) — matches how `EXPENSE_CATEGORIES`/`INCOME_CATEGORIES` work in MoneyLog.
6. **Theme**: `#f18701` (vivid orange, oklch hue ≈ 60°) — distinct from every existing app's hue (burnlog ~20-30, moneylog 165, tasklog 255, homelog 302, sociallog 357).

## Architecture

### Route structure

Same URL-transparent route-group pattern as every other sub-app:

```
app/(shoppinglog)/
  layout.tsx                          # marks app="shoppinglog", .app-shoppinglog theme
  shoppinglog/
    page.tsx                          # Browse: category chips + search + listing grid
    listing/[id]/page.tsx             # Listing detail: images, price, condition, seller, reviews
    sell/page.tsx                     # Create listing (multi-photo upload, new/used, category, price, stock)
    sell/[id]/page.tsx                # Edit an existing listing you own
    cart/page.tsx                     # Cart, grouped by seller, checkout button
    orders/page.tsx                   # Purchases / Sales tabs
    favorites/page.tsx                # Saved listings
```

### Data model (Prisma, new models, `shop_*` tables)

Same conventions as every other sub-app's models (UUID pk via `dbgenerated("gen_random_uuid()")`, `profileId`-style FKs to `Profile`, `@@map` snake_case, doc comment). **Every `updatedAt` field gets an explicit `@default(now())`** — a real bug in the SocialLog build came from relying on Prisma's client-side-only `@updatedAt` while writing through the Supabase JS client at runtime; every model here writes through Supabase JS too, so this is non-negotiable this time.

```prisma
model ShopCategory {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String   @unique
  slug      String   @unique
  icon      String   // lucide-react icon name, e.g. "Shirt", "Sofa", "Smartphone"
  createdAt DateTime @default(now())

  listings ShopListing[]
  @@map("shop_categories")
}

model ShopListing {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  seller         Profile  @relation(fields: [sellerId], references: [id], onDelete: Cascade)
  sellerId       String   @db.Uuid
  category       ShopCategory @relation(fields: [categoryId], references: [id])
  categoryId     String   @db.Uuid
  title          String
  description    String
  price          Float
  condition      String   // "new" | "used"
  stockQuantity  Int      @default(1)
  status         String   @default("active") // "active" | "sold" | "removed"
  createdAt      DateTime @default(now())
  updatedAt      DateTime @default(now()) @updatedAt

  images    ShopListingImage[]
  favorites ShopFavorite[]
  cartItems ShopCartItem[]
  orderItems ShopOrderItem[]
  reviews   ShopReview[]
  @@map("shop_listings")
}

model ShopListingImage {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  listing   ShopListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId String   @db.Uuid
  url       String
  position  Int      @default(0)
  @@map("shop_listing_images")
}

model ShopFavorite {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @db.Uuid
  listing   ShopListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId String   @db.Uuid
  createdAt DateTime @default(now())
  @@unique([profileId, listingId])
  @@map("shop_favorites")
}

model ShopCartItem {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @db.Uuid
  listing   ShopListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId String   @db.Uuid
  quantity  Int      @default(1)
  createdAt DateTime @default(now())
  @@unique([profileId, listingId])
  @@map("shop_cart_items")
}

model ShopOrder {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  buyer        Profile  @relation("ShopOrderBuyer", fields: [buyerId], references: [id], onDelete: Cascade)
  buyerId      String   @db.Uuid
  seller       Profile  @relation("ShopOrderSeller", fields: [sellerId], references: [id], onDelete: Cascade)
  sellerId     String   @db.Uuid
  totalAmount  Float
  createdAt    DateTime @default(now())

  items ShopOrderItem[]
  @@map("shop_orders")
}

model ShopOrderItem {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  order     ShopOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderId   String   @db.Uuid
  listing   ShopListing @relation(fields: [listingId], references: [id])
  listingId String   @db.Uuid
  title     String   // snapshot — listing may later be edited/removed
  price     Float    // snapshot
  quantity  Int
  @@map("shop_order_items")
}

model ShopReview {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  listing    ShopListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId  String   @db.Uuid
  reviewer   Profile  @relation(fields: [reviewerId], references: [id], onDelete: Cascade)
  reviewerId String   @db.Uuid
  rating     Int      // 1-5
  body       String?
  createdAt  DateTime @default(now())
  @@unique([reviewerId, listingId])
  @@map("shop_reviews")
}
```

### Ledger integration

On checkout, for each per-seller `ShopOrder` created: insert one `FinanceTransaction` for the buyer (`type: 'expense'`, `category: 'shopping'`) and one for the seller (`type: 'income'`, `category: 'shopping_sales'`). Both new category values are added to `lib/financeCategories.ts`'s `EXPENSE_CATEGORIES`/`INCOME_CATEGORIES` lists so they render correctly (not just raw slugs) anywhere MoneyLog already displays categories (e.g. `FinanceInsightsClient.tsx`, which derives categories dynamically — no hardcoded category-color map to update).

### RLS & storage

`shop_categories` / `shop_listings` / `shop_listing_images` / `shop_reviews`: public read, owner-only write (same public-read-owner-write pattern as `social_posts`). `shop_favorites` / `shop_cart_items`: owner-only read+write (private). `shop_orders` / `shop_order_items`: participant-only read (buyer or seller), no direct client write (created only via the checkout API route, same service-role convention as everywhere else). New public storage bucket `shoplog-media`, path `${profileId}/${listingId}/${filename}`, same upload pattern as `avatars`/`sociallog-media`.

### Theme

`.app-shoppinglog` / `.app-shoppinglog.dark`, oklch hue ≈ 60 (from `#f18701`), same variable set and derivation formula as every other app's theme block.

## Phased Build Order

1. **Foundation** — schema + RLS + storage bucket, theme, nav/registry, route scaffold, seeded categories.
2. **Browse + Listing Detail** — category browse, search, listing detail page with images + reviews, favorite toggle.
3. **Sell** — create/edit listing with multi-photo upload.
4. **Cart + Checkout** — cart page, per-seller checkout creating orders + MoneyLog ledger entries, Orders (Purchases/Sales) page.
5. **Reviews** — leave a rating+review on a purchased listing.
6. **Mock data** — seeded categories + demo listings/orders/reviews using the same persona accounts SocialLog already seeded, so Browse/Orders/Reviews aren't empty on first look.

Each phase ships working, testable software on its own.
