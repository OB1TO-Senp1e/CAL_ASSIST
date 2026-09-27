import { PrismaService } from './src/common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

ConfigModule.forRoot({ envFilePath: '.env' });
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';

const prisma = new PrismaService();

async function createTestUser() {
  const password = 'testpassword123';
  const passwordHash = await bcrypt.hash(password, 12);
  
  const user = await prisma.user.upsert({
    where: { email: 'test@calassist.local' },
    update: { passwordHash, name: 'Test User' },
    create: {
      email: 'test@calassist.local',
      name: 'Test User',
      passwordHash,
      timezone: 'America/Los_Angeles',
    },
  });
  
  console.log('Created user:', user.email);
  console.log('Password:', password);
  console.log('Hash:', passwordHash);
  
  await prisma.$disconnect();
}

createTestUser().catch(console.error);