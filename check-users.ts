import { PrismaService } from './src/common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot({ envFilePath: '.env' });
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';

const prisma = new PrismaService();

async function checkUsers() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, passwordHash: true },
  });
  console.log('Users:', JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}

checkUsers().catch(console.error);