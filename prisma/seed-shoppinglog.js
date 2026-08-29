// prisma/seed-shoppinglog.js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// icon values are lucide-react component names, rendered by CategoryIcon.tsx
const CATEGORIES = [
  { name: 'Electronics', slug: 'electronics', icon: 'Smartphone' },
  { name: 'Furniture', slug: 'furniture', icon: 'Sofa' },
  { name: 'Clothing & Accessories', slug: 'clothing', icon: 'Shirt' },
  { name: 'Home & Garden', slug: 'home-garden', icon: 'Home' },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', icon: 'Dumbbell' },
  { name: 'Books & Media', slug: 'books-media', icon: 'BookOpen' },
  { name: 'Toys & Games', slug: 'toys-games', icon: 'Gamepad2' },
  { name: 'Vehicles', slug: 'vehicles', icon: 'Car' },
  { name: 'Free Stuff', slug: 'free-stuff', icon: 'Gift' },
  { name: 'Other', slug: 'other', icon: 'Package' },
]

// Same 6 demo personas SocialLog seeds (prisma/seed-sociallog.js) — reused
// here so ShoppingLog listings show up under recognizable accounts instead
// of needing a second, disconnected set of fake users.
const PERSONA_USER_IDS = {
  burnlog_official: '11111111-1111-1111-1111-111111111101',
  tasklog_tips: '11111111-1111-1111-1111-111111111102',
  homelog_hq: '11111111-1111-1111-1111-111111111103',
  moneylog_tips: '11111111-1111-1111-1111-111111111104',
  maya_runs: '11111111-1111-1111-1111-111111111105',
  devon_builds: '11111111-1111-1111-1111-111111111106',
}

// Inline SVG data URIs — no external image host to depend on.
function placeholderImage(hex, label) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><rect width='600' height='600' fill='${hex}'/><text x='50%' y='50%' font-family='sans-serif' font-size='36' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const LISTINGS = [
  {
    seller: 'maya_runs',
    title: 'Trek road bike, barely used',
    description: 'Rode it for one season, upgrading to a gravel bike. Well maintained, new tires.',
    price: 450,
    condition: 'used',
    category: 'sports-outdoors',
    stockQuantity: 1,
    image: placeholderImage('#f18701', 'Road Bike'),
  },
  {
    seller: 'devon_builds',
    title: 'Mechanical keyboard (new in box)',
    description: 'Hot-swappable, brown switches, RGB. Bought two by mistake.',
    price: 89.99,
    condition: 'new',
    category: 'electronics',
    stockQuantity: 3,
    image: placeholderImage('#C2660A', 'Keyboard'),
  },
  {
    seller: 'burnlog_official',
    title: 'Adjustable dumbbell set',
    description: '5-50 lbs per side, quick-adjust dial. Some cosmetic wear, works perfectly.',
    price: 120,
    condition: 'used',
    category: 'sports-outdoors',
    stockQuantity: 1,
    image: placeholderImage('#FB923C', 'Dumbbells'),
  },
  {
    seller: 'tasklog_tips',
    title: 'Standing desk converter',
    description: 'Sits on top of any desk, gas-spring height adjust. Moving, must go.',
    price: 75,
    condition: 'used',
    category: 'furniture',
    stockQuantity: 1,
    image: placeholderImage('#FDBA74', 'Standing Desk'),
  },
  {
    seller: 'homelog_hq',
    title: 'Ceramic planter set (new)',
    description: 'Set of 3, matte finish, drainage holes + trays included.',
    price: 34.99,
    condition: 'new',
    category: 'home-garden',
    stockQuantity: 5,
    image: placeholderImage('#9A3412', 'Planters'),
  },
  {
    seller: 'moneylog_tips',
    title: 'Personal finance book bundle',
    description: '5 books on budgeting and investing basics, lightly read.',
    price: 18,
    condition: 'used',
    category: 'books-media',
    stockQuantity: 1,
    image: placeholderImage('#F18701', 'Book Bundle'),
  },
  {
    seller: 'maya_runs',
    title: 'Running shoes, size 9 (new)',
    description: 'Never worn, wrong size ordered online. Tags still on.',
    price: 65,
    condition: 'new',
    category: 'clothing',
    stockQuantity: 2,
    image: placeholderImage('#FDBA74', 'Running Shoes'),
  },
  {
    seller: 'devon_builds',
    title: 'Board game collection',
    description: 'Six strategy games, all pieces accounted for and counted twice.',
    price: 40,
    condition: 'used',
    category: 'toys-games',
    stockQuantity: 1,
    image: placeholderImage('#C2660A', 'Board Games'),
  },
]

// [listingIndex, buyerUsername, rating, reviewBody]
const ORDERS = [
  { listingIndex: 2, buyer: 'devon_builds', rating: 5, review: 'Exactly as described, smooth transaction.' },
  { listingIndex: 4, buyer: 'maya_runs', rating: 4, review: 'Cute planters, one had a small chip but seller was upfront about it.' },
  { listingIndex: 7, buyer: 'burnlog_official', rating: 5, review: 'Great condition, kids love the games.' },
]

async function main() {
  for (const c of CATEGORIES) {
    await prisma.shopCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon },
      create: c,
    })
  }
  console.log(`✅ Seeded ${CATEGORIES.length} shoppinglog categories`)

  const profileByUsername = {}
  for (const [username, userId] of Object.entries(PERSONA_USER_IDS)) {
    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile) {
      console.warn(`⚠️  Persona ${username} not found — run "npm run seed:sociallog" first. Skipping shoppinglog mock data.`)
      return
    }
    profileByUsername[username] = profile
  }

  const categoryBySlug = {}
  for (const c of CATEGORIES) {
    categoryBySlug[c.slug] = await prisma.shopCategory.findUniqueOrThrow({ where: { slug: c.slug } })
  }

  const createdListings = []
  for (const l of LISTINGS) {
    const sellerId = profileByUsername[l.seller].id
    let listing = await prisma.shopListing.findFirst({ where: { sellerId, title: l.title } })
    if (!listing) {
      listing = await prisma.shopListing.create({
        data: {
          sellerId,
          categoryId: categoryBySlug[l.category].id,
          title: l.title,
          description: l.description,
          price: l.price,
          condition: l.condition,
          stockQuantity: l.stockQuantity,
        },
      })
      await prisma.shopListingImage.create({ data: { listingId: listing.id, url: l.image, position: 0 } })
    }
    createdListings.push(listing)
  }
  console.log(`✅ Seeded ${createdListings.length} demo listings`)

  let orderCount = 0
  for (const o of ORDERS) {
    const listing = createdListings[o.listingIndex]
    const buyerId = profileByUsername[o.buyer].id
    if (listing.sellerId === buyerId) continue // shouldn't happen, guards against future data edits

    const existingOrderItem = await prisma.shopOrderItem.findFirst({
      where: { listingId: listing.id, order: { buyerId } },
    })
    if (existingOrderItem) continue

    const order = await prisma.shopOrder.create({
      data: { buyerId, sellerId: listing.sellerId, totalAmount: listing.price },
    })
    await prisma.shopOrderItem.create({
      data: { orderId: order.id, listingId: listing.id, title: listing.title, price: listing.price, quantity: 1 },
    })
    await prisma.shopListing.update({
      where: { id: listing.id },
      data: { stockQuantity: { decrement: 1 } },
    })

    const buyerProfile = profileByUsername[o.buyer]
    const sellerProfile = Object.values(profileByUsername).find((p) => p.id === listing.sellerId)
    await prisma.financeTransaction.create({
      data: {
        profileId: buyerId,
        type: 'expense',
        category: 'shopping',
        label: `ShoppingLog: 1 item from @${sellerProfile?.username ?? 'seller'}`,
        amount: listing.price,
      },
    })
    await prisma.financeTransaction.create({
      data: {
        profileId: listing.sellerId,
        type: 'income',
        category: 'shopping_sales',
        label: `ShoppingLog: 1 item sold to @${buyerProfile.username}`,
        amount: listing.price,
      },
    })

    await prisma.shopReview.upsert({
      where: { reviewerId_listingId: { reviewerId: buyerId, listingId: listing.id } },
      update: {},
      create: { listingId: listing.id, reviewerId: buyerId, rating: o.rating, body: o.review },
    })

    orderCount++
  }
  console.log(`✅ Seeded ${orderCount} demo orders + reviews`)

  // Refresh stockQuantity/status on createdListings that had an order applied.
  for (const listing of createdListings) {
    const fresh = await prisma.shopListing.findUnique({ where: { id: listing.id } })
    if (fresh.stockQuantity <= 0 && fresh.status === 'active') {
      await prisma.shopListing.update({ where: { id: listing.id }, data: { status: 'sold' } })
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
