// prisma/seed-loading-animations.js
//
// One-time, idempotent seed: registers the 5 existing built-in Lottie files
// and the Siri orb as read-only library entries, then assigns each to the
// app it already shows for today (matching SwitchLoader's old hardcoded
// map exactly, so running this migration changes nothing visible until an
// admin acts).
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Fixed UUIDs so re-running this script upserts the same rows instead of
// duplicating them, same idiom as prisma/seed-sociallog.js's PERSONAS.
const BUILT_INS = [
  { id: '22222222-2222-2222-2222-222222222201', name: 'Weightlifting', filePath: '/lottie/burnlog.json', defaultApp: 'burnlog' },
  { id: '22222222-2222-2222-2222-222222222202', name: 'Money', filePath: '/lottie/moneylog.json', defaultApp: 'moneylog' },
  { id: '22222222-2222-2222-2222-222222222203', name: 'Social Media Marketing', filePath: '/lottie/sociallog.json', defaultApp: 'sociallog' },
  { id: '22222222-2222-2222-2222-222222222204', name: 'World Map', filePath: '/lottie/travellog.json', defaultApp: 'travellog' },
  { id: '22222222-2222-2222-2222-222222222205', name: 'Gears & Loading', filePath: '/lottie/adminlog.json', defaultApp: 'adminlog' },
]

const SIRI_ORB_ID = '22222222-2222-2222-2222-222222222206'

async function main() {
  for (const b of BUILT_INS) {
    await prisma.lottieAnimation.upsert({
      where: { id: b.id },
      create: { id: b.id, name: b.name, kind: 'lottie', isReadOnly: true, filePath: b.filePath },
      update: { name: b.name, kind: 'lottie', isReadOnly: true, filePath: b.filePath, data: null },
    })
    await prisma.appLottieAssignment.upsert({
      where: { appId: b.defaultApp },
      create: { appId: b.defaultApp, animationId: b.id },
      update: { animationId: b.id },
    })
  }

  await prisma.lottieAnimation.upsert({
    where: { id: SIRI_ORB_ID },
    create: { id: SIRI_ORB_ID, name: 'Siri Orb (IntelLog default)', kind: 'siri_orb', isReadOnly: true },
    update: { name: 'Siri Orb (IntelLog default)', kind: 'siri_orb', isReadOnly: true, filePath: null, data: null },
  })
  await prisma.appLottieAssignment.upsert({
    where: { appId: 'intellog' },
    create: { appId: 'intellog', animationId: SIRI_ORB_ID },
    update: { animationId: SIRI_ORB_ID },
  })

  console.log('Seeded 5 built-in animations, the Siri orb entry, and 6 default assignments.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
