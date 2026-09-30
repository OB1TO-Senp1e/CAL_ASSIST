import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Global } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { validateDatabaseConnectionBudget } from '../../config/connection-budget';

@Global()
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    const databaseUrl =
      configService.get<string>('DATABASE_URL') ||
      'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';
    const budget = validateDatabaseConnectionBudget({
      databasePoolMax: configService.get<string>('DATABASE_POOL_MAX', '10'),
      apiReplicaCount: configService.get<string>('API_REPLICA_COUNT', '2'),
      workerPoolConnections: configService.get<string>('WORKER_POOL_CONNECTIONS', '0'),
      postgresMaxConnections: configService.get<string>('POSTGRES_MAX_CONNECTIONS', '100'),
      databaseConnectionHeadroom: configService.get<string>('DATABASE_CONNECTION_HEADROOM', '20'),
    });
    const poolMax = budget.poolMax;
    const adapter = new PrismaPg({ connectionString: databaseUrl, max: poolMax });
    const queryLoggingEnabled =
      configService.get<string>('NODE_ENV') === 'development' &&
      configService.get<string>('PRISMA_QUERY_LOGGING') === 'true';
    super({
      adapter,
      log: queryLoggingEnabled ? ['query', 'error', 'warn'] : ['error', 'warn'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
