# ShoppingLog

Marketplace sub-app — buy and sell listings, new or used. One of seven
sub-apps under LogBook — see the [root README](../../README.md) for how it
fits into the wider app.

## What it does

- **Home** (`/shoppinglog`) — browse listings.
- **Listing** (`/shoppinglog/listing`) — view a single listing's detail.
- **Sell** (`/shoppinglog/sell`) — create/manage your own listings (with
  images via `ShopListingImage`).
- **Cart** (`/shoppinglog/cart`) — items added to cart before checkout.
- **Orders** (`/shoppinglog/orders`) — order history (as buyer or seller).
- **Favorites** (`/shoppinglog/favorites`) — saved/favorited listings.
- **Config** (`/shoppinglog/config`) — ShoppingLog-specific settings plus
  "Export config as JSON". No dedicated onboarding flow yet.

Listings are organized under `ShopCategory`, and completed orders can carry
`ShopReview`s.

## Routes

```
/shoppinglog             Home (browse listings)
/shoppinglog/listing        Listing detail
/shoppinglog/sell              Create/manage your listings
/shoppinglog/cart                 Cart
/shoppinglog/orders                  Order history
/shoppinglog/favorites                  Saved listings
/shoppinglog/config                        Settings
```

## Data model

Prisma models: `ShopCategory`, `ShopListing`, `ShopListingImage`,
`ShopFavorite`, `ShopCartItem`, `ShopOrder`, `ShopOrderItem`, `ShopReview`.
Shares the top-level `Profile` model with every other app.

## Key files

```
app/(shoppinglog)/
  layout.tsx               Route-group layout/theming
  shoppinglog/page.tsx        Home (browse)
  shoppinglog/listing/           Listing detail
  shoppinglog/sell/                 Create/manage listings
  shoppinglog/cart/                    Cart
  shoppinglog/orders/                     Order history
  shoppinglog/favorites/                     Saved listings
  shoppinglog/config/                           Settings
components/ShoppingLogBottomNav.tsx           ShoppingLog's bottom nav
```

Seed sample listings with `npm run seed:shoppinglog`.
