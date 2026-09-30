import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../common/services/prisma.service';

export interface MigrationRecord {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export function getMigrationStateIssues(
  expectedMigrations: readonly string[],
  records: readonly MigrationRecord[]
): string[] {
  const applied = new Set(
    records
      .filter((record) => record.finished_at !== null && record.rolled_back_at === null)
      .map((record) => record.migration_name)
  );
  const pending = expectedMigrations.filter((name) => !applied.has(name));
  const failed = records
    .filter((record) => record.finished_at === null && record.rolled_back_at === null)
    .map((record) => record.migration_name);

  return [
    ...(pending.length ? [`pending migrations: ${pending.join(', ')}`] : []),
    ...(failed.length ? [`failed migrations: ${[...new Set(failed)].join(', ')}`] : []),
  ];
}

@Injectable()
export class MigrationStateGuard implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') !== 'production') return;

    await this.prisma.$connect();
    const migrationDirectory = join(process.cwd(), 'prisma', 'migrations');
    const expectedMigrations = readdirSync(migrationDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    if (expectedMigrations.length === 0) {
      throw new Error('No Prisma migrations are present in the production image');
    }

    const records = await this.prisma.$queryRaw<MigrationRecord[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
    `;
    const issues = getMigrationStateIssues(expectedMigrations, records);
    if (issues.length > 0) {
      throw new Error(`Database migrations are not ready for production: ${issues.join('; ')}`);
    }
  }
}
