import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@app/common/services/prisma.service';

/**
 * C7 — PKCE (RFC 7636, S256) for the hand-rolled calendar OAuth flow.
 *
 * The code_verifier is a 32-byte random value kept ONLY server-side in the
 * CalendarOAuthPkce table, keyed by SHA-256 of the signed state JWT (so the
 * lookup id is derivable from the callback's `state` without storing any
 * bearer material verbatim). 10-minute TTL matching the state JWT lifetime,
 * strictly single-use (consumed atomically on redemption). The verifier is
 * never placed in a URL, the state JWT, or logs.
 *
 * Storage choice: DB (not the Redis CacheModule) because Redis is not running
 * locally and the pooler-mode connection makes a memory-based store unsafe
 * across restarts; DB rows survive restart and the table is tiny + indexed
 * on expiry. Logged as a decision in CAL_UPDATE_INFO/COMPLIANCE_LOOP.md.
 */

const VERIFIER_BYTES = 32;
const TTL_MS = 10 * 60 * 1000;

export interface PkceChallenge {
  verifier: string;
  challenge: string;
  method: 'S256';
  stateId: string;
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function stateIdFor(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

@Injectable()
export class PkceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the verifier+challenge pair and persists the verifier. */
  async create(state: string, userId: string, provider: string): Promise<PkceChallenge> {
    const verifier = base64Url(randomBytes(VERIFIER_BYTES)); // 43 chars, RFC7636 charset
    const challenge = base64Url(createHash('sha256').update(verifier).digest());
    const id = stateIdFor(state);
    await this.prisma.calendarOAuthPkce.create({
      data: {
        id,
        codeVerifier: verifier,
        userId,
        provider: provider.toUpperCase() as any,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });
    return { verifier, challenge, method: 'S256', stateId: id };
  }

  /**
   * Atomically redeems the verifier for a callback state. Throws a
   * user-facing error when it is missing (never minted / already cleaned),
   * expired, or already used (replay). The row is marked consumed BEFORE the
   * token exchange runs, so a replayed callback can never reuse it.
   */
  async consume(state: string): Promise<string> {
    const id = stateIdFor(state);
    const now = new Date();
    const redeemed = await this.prisma.calendarOAuthPkce.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (redeemed.count === 0) {
      throw new BadRequestException(
        'Your calendar sign-in request expired or was already used. Please try connecting again.'
      );
    }
    const row = await this.prisma.calendarOAuthPkce.findUnique({ where: { id } });
    // Defensive: consume+read are not one transaction; if the row vanished,
    // treat like expiry rather than passing an empty verifier downstream.
    if (!row?.codeVerifier) {
      throw new BadRequestException(
        'Your calendar sign-in request expired or was already used. Please try connecting again.'
      );
    }
    return row.codeVerifier;
  }

  /** Best-effort cleanup of stale rows (call from maintenance or lazily). */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.calendarOAuthPkce
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => ({ count: 0 }));
    return result.count;
  }
}
