import { PermissionService } from './permission.service';
import {
  CheckPermissionInputSchema,
  GrantPermissionInputSchema,
  CreateAutonomyPolicyInputSchema,
  UpdateAutonomyPolicyInputSchema,
} from './permission.types';

/**
 * Stage 4k guard: the permissions/policies storage contract.
 *
 * Before 4k, explicit grants were URL-encoded JSON smuggled through the
 * Permission.scope string behind a `calassist.permission:` prefix, and
 * autonomy policies were JSON.stringify-ed into AutonomyRule.actionConfig
 * under a `calassistPolicy` marker. Both now use their own columns/tables, and
 * these tests pin that no compat format can come back.
 */
describe('permission storage (Stage 4k)', () => {
  const makeService = (prisma: any) => new PermissionService(prisma);

  it('grantPermission upserts structured columns, never an encoded scope', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      action: 'CREATE_EVENT',
      scope: 'CALENDAR',
      decision: 'ALLOW',
      conditions: {},
      grantedBy: 'USER',
      grantedAt: new Date(),
      expiresAt: null,
      isActive: true,
    });
    const service = makeService({ permission: { upsert } });

    await service.grantPermission('u1', {
      action: 'CREATE_EVENT',
      scope: 'CALENDAR',
      decision: 'ALLOW',
      conditions: {},
    });

    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      userId_action_scope: { userId: 'u1', action: 'CREATE_EVENT', scope: 'CALENDAR' },
    });
    expect(arg.create.scope).toBe('CALENDAR');
    expect(arg.create.decision).toBe('ALLOW');
    // Compat formats must not be written anywhere in the row payload.
    const serialized = JSON.stringify(arg);
    expect(serialized).not.toContain('calassist.permission:');
    expect(serialized).not.toContain('calassistPolicy');
    expect(serialized).not.toContain('EXECUTE');
  });

  it('getUserPermissions reads without the legacy scope prefix filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = makeService({ permission: { findMany } });

    await service.getUserPermissions('u1', 'CREATE_EVENT', 'CALENDAR');

    const where = findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('scope.startsWith');
    expect(where.userId).toBe('u1');
  });

  it('mapToUserPermission maps typed columns straight, no decode step', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        userId: 'u1',
        action: 'MOVE_EVENT',
        scope: 'CALENDAR',
        decision: 'ASK',
        conditions: { maxShiftMinutes: 30 },
        grantedBy: 'TEMPLATE',
        grantedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: null,
        isActive: true,
      },
    ]);
    const service = makeService({ permission: { findMany } });

    const rows = await service.getUserPermissions('u1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: 'p1',
      userId: 'u1',
      action: 'MOVE_EVENT',
      scope: 'CALENDAR',
      decision: 'ASK',
      conditions: { maxShiftMinutes: 30 },
      grantedAt: '2026-01-01T00:00:00.000Z',
      grantedBy: 'TEMPLATE',
      expiresAt: null,
      isActive: true,
    });
  });

  it('createAutonomyPolicy writes a typed AutonomyPolicy row, not a policy blob', async () => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'pol1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...data,
      }),
    );
    const service = makeService({ autonomyPolicy: { create } });

    const policy = await service.createAutonomyPolicy('u1', {
      name: 'Assistant',
      autonomyLevel: 'AUTO_EXECUTE_LOW_RISK',
      enabledScopes: ['CALENDAR'],
      allowedActions: ['CREATE_EVENT'],
      riskThreshold: 'LOW',
      requireConfirmationFor: [],
      protectedEntities: [{ type: 'EVENT', id: 'e1', reason: 'board meeting' }],
      timeRestrictions: [],
      isActive: true,
      priority: 0,
    });

    const data = create.mock.calls[0][0].data;
    expect(data.name).toBe('Assistant');
    expect(data.enabledScopes).toEqual(['CALENDAR']);
    expect(data.protectedEntities).toEqual([
      { type: 'EVENT', id: 'e1', reason: 'board meeting' },
    ]);
    expect(JSON.stringify(data)).not.toContain('calassistPolicy');
    expect(policy.id).toBe('pol1');
    expect(policy.autonomyLevel).toBe('AUTO_EXECUTE_LOW_RISK');
  });

  it('getActiveAutonomyPolicy reads the dedicated table', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = makeService({ autonomyPolicy: { findFirst } });

    const active = await service.getActiveAutonomyPolicy('u1');

    expect(active).toBeNull();
    expect(findFirst.mock.calls[0][0].where).toEqual({ userId: 'u1', isActive: true });
  });
});

/**
 * Stage 4k: the /api/permissions controller previously typed bodies with
 * compile-time-only zod types; every grant/check/policy route is now behind a
 * ZodValidationPipe. These cases pin the runtime contract the pipe enforces.
 */
describe('permission DTO contracts', () => {
  it('check input requires a known action/scope and rejects anything else', () => {
    expect(
      CheckPermissionInputSchema.safeParse({
        action: 'CREATE_EVENT',
        scope: 'CALENDAR',
      }).success,
    ).toBe(true);
    expect(
      CheckPermissionInputSchema.safeParse({ action: 'DROP_DATABASE', scope: 'CALENDAR' }).success,
    ).toBe(false);
    expect(CheckPermissionInputSchema.safeParse({ scope: 'CALENDAR' }).success).toBe(false);
  });

  it('grant input accepts the template payload shape and keeps conditions', () => {
    const parsed = GrantPermissionInputSchema.safeParse({
      action: 'CREATE_EVENT',
      scope: 'CALENDAR',
      decision: 'ALLOW',
      conditions: { maxDurationMinutes: 60 },
      grantedBy: 'TEMPLATE',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.conditions).toEqual({ maxDurationMinutes: 60 });
    }
  });

  it('grant input rejects a malformed expiry and an unknown decision', () => {
    expect(
      GrantPermissionInputSchema.safeParse({
        action: 'CREATE_EVENT',
        scope: 'CALENDAR',
        decision: 'ALLOW',
        expiresAt: 'next tuesday',
      }).success,
    ).toBe(false);
    expect(
      GrantPermissionInputSchema.safeParse({
        action: 'CREATE_EVENT',
        scope: 'CALENDAR',
        decision: 'MAYBE',
      }).success,
    ).toBe(false);
  });

  it('policy create applies schema defaults; update stays partial', () => {
    const created = CreateAutonomyPolicyInputSchema.safeParse({
      name: 'Observer',
      autonomyLevel: 'OBSERVE',
    });
    expect(created.success).toBe(true);
    if (created.success) {
      expect(created.data.enabledScopes).toEqual([]);
      expect(created.data.riskThreshold).toBe('LOW');
      expect(created.data.isActive).toBe(true);
    }

    expect(UpdateAutonomyPolicyInputSchema.safeParse({ priority: 3 }).success).toBe(true);
    expect(UpdateAutonomyPolicyInputSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('time restriction format is enforced at the boundary', () => {
    expect(
      CreateAutonomyPolicyInputSchema.safeParse({
        name: 'X',
        autonomyLevel: 'SUGGEST',
        timeRestrictions: [{ startTime: '25:00', endTime: '26:00', days: [8] }],
      }).success,
    ).toBe(false);
  });
});
