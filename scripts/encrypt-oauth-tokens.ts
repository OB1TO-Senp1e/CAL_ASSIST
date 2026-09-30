/**
 * C2 migration: encrypt existing plaintext OAuth tokens at rest.
 *
 *   npx ts-node scripts/encrypt-oauth-tokens.ts --dry-run   # report only
 *   npx ts-node scripts/encrypt-oauth-tokens.ts             # apply
 *
 * - Rows whose tokens already start with "v1:" are skipped (idempotent —
 *   safe to run repeatedly and safe if the app was already writing encrypted).
 * - NULL/empty token columns are skipped.
 * - Additive and reversible in effect: the app decrypts "v1:" values and
 *   passes legacy plaintext through, so rolling back the code without rolling
 *   back the data still reads; running decrypt-oauth-tokens in an emergency
 *   would be the data-side revert (not implemented — encrypted is the target).
 * - Reads OAUTH_TOKEN_KEY from the environment (same key the app uses).
 *   Never logs token material, plaintext or ciphertext.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { OAuthTokenCryptoService } from '../src/integrations/calendar-adapters/oauth-token-crypto.service';

loadEnv();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const key = process.env.OAUTH_TOKEN_KEY;
  if (!key) {
    console.error('OAUTH_TOKEN_KEY is not set. Refusing to run.');
    process.exit(1);
  }
  const configStub = {
    get: (name: string) =>
      name === 'OAUTH_TOKEN_KEY' ? key : name === 'NODE_ENV' ? process.env.NODE_ENV : undefined,
  } as any;
  const crypto = new OAuthTokenCryptoService(configStub);
  crypto.onModuleInit();
  if (!crypto.enabled) {
    console.error('OAUTH_TOKEN_KEY is present but invalid (need base64 of 32 bytes).');
    process.exit(1);
  }

  // Same driver-adapter wiring as src/common/services/prisma.service.ts.
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const rows = await prisma.calendarConnection.findMany({
      select: { id: true, accessToken: true, refreshToken: true },
    });

    let encrypted = 0;
    let skipped = 0;
    for (const row of rows) {
      const needsAccess = !!row.accessToken && !OAuthTokenCryptoService.isEncrypted(row.accessToken);
      const needsRefresh =
        !!row.refreshToken && !OAuthTokenCryptoService.isEncrypted(row.refreshToken);
      if (!needsAccess && !needsRefresh) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await prisma.calendarConnection.update({
          where: { id: row.id },
          data: {
            accessToken: needsAccess ? crypto.encrypt(row.accessToken)! : row.accessToken,
            refreshToken: needsRefresh ? crypto.encrypt(row.refreshToken)! : row.refreshToken,
          },
        });
      }
      encrypted++;
    }

    console.log(
      `${dryRun ? '[dry-run] Would encrypt' : 'Encrypted'} ${encrypted} connection row(s); ` +
        `skipped ${skipped} already-encrypted or token-less row(s); ${rows.length} total.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err?.message || err);
  process.exit(1);
});
