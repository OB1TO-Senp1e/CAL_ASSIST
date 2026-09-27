import { PrismaService } from './src/common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

ConfigModule.forRoot({ envFilePath: '.env' });
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';

const prisma = new PrismaService();

async function testPassword() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@calassist.local' },
  });
  
  if (!user) {
    console.log('User not found');
    return;
  }
  
  console.log('User:', user.email);
  console.log('Hash:', user.passwordHash);
  
  const testPassword = 'testpassword123';
  const result = await bcrypt.compare(testPassword, user.passwordHash);
  console.log('Password match:', result);
  
  await prisma.$disconnect();
}

testPassword().catch(console.error);