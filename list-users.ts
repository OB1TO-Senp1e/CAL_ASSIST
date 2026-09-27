import { PrismaService } from './src/common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

ConfigModule.forRoot({ envFilePath: '.env' });
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';

const prisma = new PrismaService();

async function listUsers() {
  const users = await prisma.user.findMany({
    select: { email: true, passwordHash: true },
  });
  
  console.log('All users:');
  for (const user of users) {
    console.log(`\nUser: ${user.email}`);
    console.log(`Hash: ${user.passwordHash}`);
    const match = await bcrypt.compare('testpassword123', user.passwordHash);
    console.log(`Password match: ${match}`);
  }
  
  await prisma.$disconnect();
}

listUsers().catch(console.error);