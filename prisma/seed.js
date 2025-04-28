// prisma/seed.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const profileId = '04d24dd8-7de8-4eab-8bf5-45299350712f';
  // 20 days from 19 days ago until today
  const start = new Date();
  start.setDate(start.getDate() - 19);

  const entries = Array.from({ length: 20 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    // step from 93 down to 89
    const weight = 93 + ((89 - 93) * i) / 19;
    return {
      profileId,
      date,
      weight: parseFloat(weight.toFixed(1)),
    };
  });

  await prisma.weightEntry.createMany({ data: entries });
  console.log('✅ Seeded 20 weight entries');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
