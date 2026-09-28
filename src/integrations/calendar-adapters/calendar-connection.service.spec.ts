import { CalendarConnectionService } from './calendar-connection.service';

/**
 * Stage 4i guard: OAuth material and provider delta tokens must never appear
 * in the shape returned by the public connection endpoints
 * (GET /api/calendar/connections, GET /api/calendar/connections/:provider).
 */
describe('CalendarConnectionService public shape', () => {
  const makeService = (prisma: any) =>
    new CalendarConnectionService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      { sign: () => 'jwt', verify: () => ({}) } as any,
    );

  const collectKeys = (node: any): Set<string> => {
    const keys = new Set<string>();
    const walk = (value: any) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) {
          keys.add(k);
          walk(value[k]);
        }
      }
    };
    walk(node);
    return keys;
  };

  const FORBIDDEN = ['accessToken', 'refreshToken', 'syncToken'];

  it('getPublicConnections selects no token fields, incl. nested calendars', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = makeService({ calendarConnection: { findMany } });

    await service.getPublicConnections('user-1');

    const select = findMany.mock.calls[0][0].select;
    const keys = collectKeys(select);
    for (const forbidden of FORBIDDEN) {
      expect(keys.has(forbidden)).toBe(false);
    }
    // The UI still needs reconnection/health state.
    expect(keys.has('tokenExpiresAt')).toBe(true);
    expect(keys.has('syncError')).toBe(true);
    expect(keys.has('isActive')).toBe(true);
  });

  it('getPublicConnection selects no token fields', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = makeService({ calendarConnection: { findFirst } });

    await service.getPublicConnection('user-1', 'google');

    const select = findFirst.mock.calls[0][0].select;
    const keys = collectKeys(select);
    for (const forbidden of FORBIDDEN) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});
