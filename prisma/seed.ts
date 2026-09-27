import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
      passwordHash,
      timezone: 'UTC',
      locale: 'en-US',
    },
  });

  console.log('Seeded user:', user.email);

  await prisma.goal.create({
    data: {
      userId: user.id,
      title: 'Learn NestJS',
      description: 'Master NestJS framework and Prisma',
      priority: 7,
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('Seeded goal for user:', user.email);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
