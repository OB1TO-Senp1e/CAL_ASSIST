import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@app/common/services/prisma.service';

/**
 * C6 — explicit, revocable user consent before any Google-sourced content is
 * sent to an external AI provider.
 *
 * Storage: the existing Preference table (category PRIVACY_SETTINGS, key
 * ai_processing_consent), so no schema migration is needed. The stored JSON
 * records the grant timestamp and the policy version the user accepted;
 * revocation removes the row, which immediately blocks every gated AI call.
 */

export const AI_CONSENT_KEY = '***';
export const AI_CONSENT_CATEGORY = 'PRIVACY_SETTINGS';
/** Bump when the disclosure text changes materially; users re-consent. */
export const AI_CONSENT_POLICY_VERSION = '1';

interface ConsentRecord {
  grantedAt: string;
  policyVersion: string;
}

export interface AiConsentStatus {
  granted: boolean;
  grantedAt: string | null;
  policyVersion: string | null;
  currentPolicyVersion: string;
}

@Injectable()
export class AiConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string): Promise<AiConsentStatus> {
    const record = await this.read(userId);
    return {
      granted: !!record,
      grantedAt: record?.grantedAt ?? null,
      policyVersion: record?.policyVersion ?? null,
      currentPolicyVersion: AI_CONSENT_POLICY_VERSION,
    };
  }

  /** True only when the user consented to the *current* policy version. */
  async hasConsent(userId: string): Promise<boolean> {
    if (!userId) return false;
    const record = await this.read(userId);
    return !!record && record.policyVersion === AI_CONSENT_POLICY_VERSION;
  }

  async grant(userId: string, policyVersion?: string): Promise<AiConsentStatus> {
    if (policyVersion && policyVersion !== AI_CONSENT_POLICY_VERSION) {
      throw new BadRequestException(
        `Consent must reference the current policy version (${AI_CONSENT_POLICY_VERSION}).`
      );
    }
    const record: ConsentRecord = {
      grantedAt: new Date().toISOString(),
      policyVersion: AI_CONSENT_POLICY_VERSION,
    };
    await this.prisma.preference.upsert({
      where: {
        userId_category_key: {
          userId,
          category: AI_CONSENT_CATEGORY as any,
          key: AI_CONSENT_KEY,
        },
      },
      create: {
        userId,
        category: AI_CONSENT_CATEGORY as any,
        key: AI_CONSENT_KEY,
        valueJson: JSON.stringify(record),
        description: 'Consent to AI processing of calendar content (C6)',
      },
      update: { valueJson: JSON.stringify(record), deletedAt: null },
    });
    return this.getStatus(userId);
  }

  async revoke(userId: string): Promise<AiConsentStatus> {
    await this.prisma.preference.deleteMany({
      where: { userId, category: AI_CONSENT_CATEGORY as any, key: AI_CONSENT_KEY },
    });
    return this.getStatus(userId);
  }

  /** Audit trail for consent grants/revocations (C6 requires auditability). */
  async audit(userId: string, action: 'AI_CONSENT_GRANTED' | 'AI_CONSENT_REVOKED'): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          userId,
          action,
          entityType: 'User',
          details: `AI processing consent policy v${AI_CONSENT_POLICY_VERSION}`,
        },
      })
      .catch(() => undefined); // audit must never break the user flow
  }

  private async read(userId: string): Promise<ConsentRecord | null> {
    const pref = await this.prisma.preference.findUnique({
      where: {
        userId_category_key: {
          userId,
          category: AI_CONSENT_CATEGORY as any,
          key: AI_CONSENT_KEY,
        },
      },
    });
    if (!pref || pref.deletedAt) return null;
    try {
      const parsed = JSON.parse(pref.valueJson) as ConsentRecord;
      return parsed && typeof parsed.grantedAt === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
}
