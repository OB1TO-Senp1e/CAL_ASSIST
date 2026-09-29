import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenCryptoService } from '../src/integrations/calendar-adapters/oauth-token-crypto.service';

loadEnv();

async function main(): Promise<void> {
  const activeKey = process.env.OAUTH_TOKEN_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!activeKey || !databaseUrl) {
    throw new Error('OAUTH_TOKEN_KEY and DATABASE_URL must be set; refusing to run.');
  }

  const dryRun = process.argv.includes('--dry-run');
  const config = new ConfigService();
  config.set('OAUTH_TOKEN_KEY', activeKey);
  config.set('OAUTH_TOKEN_PREVIOUS_KEYS', process.env.OAUTH_TOKEN_PREVIOUS_KEYS);
  config.set('NODE_ENV', process.env.NODE_ENV);

  const crypto = new OAuthTokenCryptoService(config);
  crypto.onModuleInit();
  if (!crypto.enabled) {
    throw new Error('OAUTH_TOKEN_KEY is invalid; expected base64 of 32 bytes.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const rows = await prisma.calendarConnection.findMany({
      select: { id: true, accessToken: true, refreshToken: true },
    });
    let rotated = 0;
    let unchanged = 0;

    for (const row of rows) {
      const accessToken = crypto.reencrypt(row.accessToken);
      const refreshToken = crypto.reencrypt(row.refreshToken);
      if (accessToken === row.accessToken && refreshToken === row.refreshToken) {
        unchanged++;
        continue;
      }
      if (dryRun) {
        rotated++;
        continue;
      }

      const result = await prisma.calendarConnection.updateMany({
        where: {
          id: row.id,
          accessToken: row.accessToken,
          refreshToken: row.refreshToken,
        },
        data: { accessToken, refreshToken },
      });
      if (result.count !== 1) {
        throw new Error(
          'A calendar token changed during key rotation. Stop writers and rerun the operation.'
        );
      }
      rotated++;
    }

    console.log(
      `${dryRun ? '[dry-run] Would rotate' : 'Rotated'} ${rotated} connection row(s); ` +
        `left ${unchanged} already-current or token-less row(s); ${rows.length} total.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown rotation failure';
  console.error(message);
  process.exitCode = 1;
});
