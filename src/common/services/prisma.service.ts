import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Global } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

@Global()
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL') || 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    const queryLoggingEnabled =
      configService.get<string>('NODE_ENV') === 'development' &&
      configService.get<string>('PRISMA_QUERY_LOGGING') === 'true';
    super({
      adapter,
      log: queryLoggingEnabled ? ['query', 'error', 'warn'] : ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
