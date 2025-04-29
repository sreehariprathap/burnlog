// prisma/seed.js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // ——————————————————————————————————————————
  // 1️⃣ Ensure the Profile exists (so weight entries can point at it)
  // ——————————————————————————————————————————
  const profileId = '04d24dd8-7de8-4eab-8bf5-45299350712f'
  const profile = await prisma.profile.upsert({
    where: { id: profileId },
    update: {},
    create: {
      // must supply all non-nullable fields:
      id: profileId,
      userId: '00000000-0000-0000-0000-000000000000', // pick or generate a UUID
      firstName: 'Seed',
      lastName: 'User',
      age: 30,
      weight: 93,       // starting “current” weight
      height: 175,      // e.g. in cm
      activityLevel: 'moderate',
    },
  })

  // ——————————————————————————————————————————
  // 2️⃣ Build 20 daily weight entries, stepping from 93 → 89
  // ——————————————————————————————————————————
  const start = new Date()
  start.setDate(start.getDate() - 19)

  const entries = Array.from({ length: 20 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)

    // linear interpolation 93 → 89 over 19 steps
    const weight = 93 + ((89 - 93) * i) / 19

    return {
      profileId: profile.id,
      date,
      weight: parseFloat(weight.toFixed(1)),
    }
  })

  // ——————————————————————————————————————————
  // 3️⃣ Insert them all in one batch
  // ——————————————————————————————————————————
  await prisma.weightEntry.createMany({ data: entries })
  console.log(`✅ Seeded ${entries.length} weight entries for profile ${profile.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
