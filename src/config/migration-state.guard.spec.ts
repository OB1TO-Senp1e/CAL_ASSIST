import { ConfigService } from '@nestjs/config';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MigrationStateGuard, getMigrationStateIssues } from './migration-state.guard';
import { PrismaService } from '../common/services/prisma.service';

const applied = (migration_name: string) => ({
  migration_name,
  finished_at: new Date(),
  rolled_back_at: null,
});

describe('getMigrationStateIssues', () => {
  it('reports migrations that have not been applied', () => {
    expect(getMigrationStateIssues(['001_init', '002_events'], [applied('001_init')])).toEqual([
      'pending migrations: 002_events',
    ]);
  });

  it('reports an unresolved failed migration', () => {
    expect(
      getMigrationStateIssues(
        ['001_init'],
        [{ migration_name: '001_init', finished_at: null, rolled_back_at: null }]
      )
    ).toEqual(['pending migrations: 001_init', 'failed migrations: 001_init']);
  });

  it('accepts fully applied migrations and resolved rollback records', () => {
    expect(
      getMigrationStateIssues(
        ['001_init'],
        [
          {
            migration_name: '000_abandoned',
            finished_at: null,
            rolled_back_at: new Date(),
          },
          applied('001_init'),
        ]
      )
    ).toEqual([]);
  });
});

describe('MigrationStateGuard', () => {
  it('does not query migration metadata outside production', async () => {
    const prisma = { $connect: jest.fn(), $queryRaw: jest.fn() };
    const guard = new MigrationStateGuard(
      { get: () => 'development' } as unknown as ConfigService,
      prisma as unknown as PrismaService
    );

    await expect(guard.onModuleInit()).resolves.toBeUndefined();
    expect(prisma.$connect).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('permits production startup after every bundled migration is applied', async () => {
    const migrations = readdirSync(join(process.cwd(), 'prisma', 'migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const prisma = {
      $connect: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue(migrations.map(applied)),
    };
    const guard = new MigrationStateGuard(
      { get: () => 'production' } as unknown as ConfigService,
      prisma as unknown as PrismaService
    );

    await expect(guard.onModuleInit()).resolves.toBeUndefined();
    expect(prisma.$connect).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('blocks production startup when migrations are pending', async () => {
    const prisma = {
      $connect: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const guard = new MigrationStateGuard(
      { get: () => 'production' } as unknown as ConfigService,
      prisma as unknown as PrismaService
    );

    await expect(guard.onModuleInit()).rejects.toThrow(/pending migrations:/);
  });
});
