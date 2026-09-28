import { AiConsentService, AI_CONSENT_POLICY_VERSION } from './ai-consent.service';

/**
 * C6 unit tests for the consent record itself: grant/revoke round-trip on the
 * Preference table, timestamp + policy version stored, stale version denied,
 * and the block-decision the AI gate consumes.
 */
describe('AiConsentService (C6)', () => {
  const make = () => {
    const rows = new Map<string, any>();
    const prisma = {
      preference: {
        findUnique: jest.fn(async ({ where }) => {
          const composite = where.userId_category_key ?? where;
          const key = `${composite.userId}|${composite.category}|${composite.key}`;
          return rows.get(key) ?? null;
        }),
        upsert: jest.fn(async ({ where, create, update }) => {
          const key = `${where.userId_category_key.userId}|${where.userId_category_key.category}|${where.userId_category_key.key}`;
          rows.set(key, { ...(rows.get(key) ?? create), ...update });
          return rows.get(key);
        }),
        deleteMany: jest.fn(async ({ where }) => {
          const key = `${where.userId}|${where.category}|${where.key}`;
          rows.delete(key);
          return { count: 1 };
        }),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    return { service: new AiConsentService(prisma as any), prisma };
  };

  it('has no consent by default and blocks AI calls', async () => {
    const { service } = make();
    expect(await service.hasConsent('u1')).toBe(false);
    const status = await service.getStatus('u1');
    expect(status.granted).toBe(false);
    expect(status.currentPolicyVersion).toBe(AI_CONSENT_POLICY_VERSION);
  });

  it('records grant with timestamp + policy version, and unblocks calls', async () => {
    const { service } = make();
    const status = await service.grant('u1');
    expect(status.granted).toBe(true);
    expect(status.policyVersion).toBe(AI_CONSENT_POLICY_VERSION);
    expect(Date.parse(status.grantedAt!)).not.toBeNaN();
    expect(await service.hasConsent('u1')).toBe(true);
  });

  it('rejects consent for a stale policy version', async () => {
    const { service } = make();
    await expect(service.grant('u1', '0.9-ancient')).rejects.toThrow(/current policy version/);
  });

  it('revoke removes the grant and blocks again', async () => {
    const { service } = make();
    await service.grant('u1');
    const status = await service.revoke('u1');
    expect(status.granted).toBe(false);
    expect(await service.hasConsent('u1')).toBe(false);
  });

  it('audit() writes grant/revoke events but never throws on failure', async () => {
    const { service, prisma } = make();
    prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.audit('u1', 'AI_CONSENT_GRANTED')).resolves.toBeUndefined();
    await service.audit('u1', 'AI_CONSENT_REVOKED');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
  });
});
