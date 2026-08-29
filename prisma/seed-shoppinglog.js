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

async function main() {
  for (const c of CATEGORIES) {
    await prisma.shopCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon },
      create: c,
    })
  }
  console.log(`✅ Seeded ${CATEGORIES.length} shoppinglog categories`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
