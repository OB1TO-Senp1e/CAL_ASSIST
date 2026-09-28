import { CalendarConnectionService } from './calendar-connection.service';

/**
 * C3 guard: disconnect() must revoke the provider grant BEFORE the connection
 * row is deleted, and a revoke failure must be logged (without token material)
 * while still allowing the local rows to be removed.
 */
describe('CalendarConnectionService.disconnect (C3)', () => {
  const CALLS: string[] = [];

  const makeService = (googleDisconnect: jest.Mock) => {
    CALLS.length = 0;
    const prisma = {
      calendarConnection: {
        findFirst: jest.fn().mockImplementation(async () => {
          CALLS.push('read-connection');
          return {
            id: 'conn-1',
            accessToken: 'plain-access-token',
            refreshToken: 'plain-refresh-token',
          };
        }),
        deleteMany: jest.fn().mockImplementation(async () => {
          CALLS.push('delete-connection');
        }),
      },
      calendar: {
        deleteMany: jest.fn().mockImplementation(async () => {
          CALLS.push('delete-calendars');
        }),
      },
      auditLog: {
        create: jest.fn().mockImplementation(async () => {
          CALLS.push('audit');
        }),
      },
    };
    const googleAdapter = { disconnect: googleDisconnect };
    const crypto = { encrypt: (v: any) => v, decrypt: (v: any) => v };
    const service = new CalendarConnectionService(
      prisma as any,
      googleAdapter as any,
      {} as any,
      {} as any,
      { sign: () => 'jwt', verify: () => ({}) } as any,
      crypto as any,
    );
    return { service, prisma };
  };

  it('revokes before deleting the connection row, and passes both tokens', async () => {
    const googleDisconnect = jest.fn().mockImplementation(async () => {
      CALLS.push('revoke');
    });
    const { service } = makeService(googleDisconnect);

    await service.disconnect('user-1', 'GOOGLE');

    // revoke strictly precedes any deletion
    expect(CALLS).toEqual(['read-connection', 'revoke', 'delete-connection', 'delete-calendars', 'audit']);
    expect(googleDisconnect).toHaveBeenCalledTimes(1);
    expect(googleDisconnect).toHaveBeenCalledWith('plain-access-token', 'plain-refresh-token');
  });

  it('still deletes rows when revoke fails, and never logs the token', async () => {
    // Worst realistic case: the provider error echoes back a token the
    // service actually handed it. The log line must redact it.
    const secretToken = 'plain-refresh-token';
    const googleDisconnect = jest
      .fn()
      .mockRejectedValue(new Error(`revoke blew up for ${secretToken}`));
    const { service, prisma } = makeService(googleDisconnect);

    const warn = jest.fn();
    (service as any).logger = { warn, error: jest.fn(), log: jest.fn() };

    await expect(service.disconnect('user-1', 'GOOGLE')).resolves.toBeUndefined();

    // deletion still happened despite the revoke failure
    expect(prisma.calendarConnection.deleteMany).toHaveBeenCalled();
    expect(prisma.calendar.deleteMany).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    // The logged message must NOT contain the token material.
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).not.toContain(secretToken);
    expect(logged).not.toContain('plain-access-token');
    expect(logged).toContain('revocation failed');
  });
});
