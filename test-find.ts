import { PrismaService } from './src/common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

ConfigModule.forRoot({ envFilePath: '.env' });
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';

const prisma = new PrismaService();

async function testFindByEmail() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@calassist.local' },
  });
  
  console.log('User found:', !!user);
  if (user) {
    console.log('Email:', user.email);
    console.log('Has passwordHash:', !!user.passwordHash);
    console.log('Hash length:', user.passwordHash.length);
    
    const result = await bcrypt.compare('testpassword123', user.passwordHash);
    console.log('Password match:', result);
  }
  
  await prisma.$disconnect();
}

testFindByEmail().catch(console.error);