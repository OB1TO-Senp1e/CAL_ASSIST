import { UnauthorizedException } from '@nestjs/common';
import { CalendarWebhookService } from './calendar-webhook.service';

/**
 * C8 acceptance: Google push notifications are validated by channel token +
 * channel/resource ids (no HMAC). Valid token → dispatch re-fetch; invalid
 * token → reject; unknown channel → reject. Body is never trusted.
 */
describe('CalendarWebhookService (C8)', () => {
  const CHANNEL = {
    id: 'row-1',
    userId: 'user-1',
    provider: 'GOOGLE',
    channelId: 'chan-1',
    resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    channelToken: 'super-secret-token',
  };

  const make = (findUnique: jest.Mock, sync = jest.fn().mockResolvedValue({})) => {
    const prisma = { calendarPushChannel: { findUnique } };
    const connectionService = { getValidAccessToken: jest.fn() } as any;
    const adapter = { getWebhookConfig: jest.fn(), registerWebhook: jest.fn() } as any;
    const service = new CalendarWebhookService(
      prisma as any,
      connectionService,
      { syncCalendars: sync } as any,
      adapter
    );
    return { service, sync };
  };

  const headers = (over: Partial<Record<string, string>> = {}) => ({
    channelToken: 'super-secret-token',
    channelId: 'chan-1',
    resourceId: 'opaque-resource-hash',
    resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    resourceState: 'sync',
    ...over,
  });

  it('accepts a notification whose channel token matches, and re-fetches changes', async () => {
    const findUnique = jest.fn(async () => CHANNEL);
    const { service, sync } = make(findUnique);

    const result = await service.verifyAndDispatch('user-1', headers({ resourceState: 'update' }));
    expect(result).toEqual({ userId: 'user-1', synced: true });
    // Changes are re-fetched with stored credentials, not read from the body.
    expect(sync).toHaveBeenCalledWith('user-1', 'GOOGLE');
  });

  it('acknowledges the initial sync probe (no token required) and re-fetches', async () => {
    const findUnique = jest.fn(async () => CHANNEL);
    const { service, sync } = make(findUnique);

    const result = await service.verifyAndDispatch(
      'user-1',
      headers({ resourceState: 'sync', channelToken: undefined })
    );
    expect(result.synced).toBe(true);
  });

  it('rejects a wrong channel token and never syncs', async () => {
    const findUnique = jest.fn(async () => CHANNEL);
    const { service, sync } = make(findUnique);

    await expect(
      service.verifyAndDispatch(
        'user-1',
        headers({ channelToken: 'guessed-token', resourceState: 'update' })
      )
    ).rejects.toThrow(UnauthorizedException);
    expect(sync).not.toHaveBeenCalled();
  });

  it('rejects a missing token on a change notification', async () => {
    const findUnique = jest.fn(async () => CHANNEL);
    const { service } = make(findUnique);

    await expect(
      service.verifyAndDispatch(
        'user-1',
        headers({ channelToken: undefined, resourceState: 'update' })
      )
    ).rejects.toThrow(/invalid channel token/);
  });

  it('rejects an unknown channel id', async () => {
    const findUnique = jest.fn(async () => null);
    const { service, sync } = make(findUnique);

    await expect(service.verifyAndDispatch('user-1', headers())).rejects.toThrow(/unknown channel/);
    expect(sync).not.toHaveBeenCalled();
  });

  it('rejects a channel owned by a different user (path/channel mismatch)', async () => {
    const findUnique = jest.fn(async () => CHANNEL);
    const { service, sync } = make(findUnique);

    await expect(service.verifyAndDispatch('attacker-1', headers())).rejects.toThrow(
      UnauthorizedException
    );
    expect(sync).not.toHaveBeenCalled();
  });

  it('rejects a resource URI that does not match the stored channel', async () => {
    const findUnique = jest.fn(async () => CHANNEL);
    const { service, sync } = make(findUnique);

    await expect(
      service.verifyAndDispatch(
        'user-1',
        headers({
          resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/other/events',
          resourceState: 'update',
        })
      )
    ).rejects.toThrow(/unknown channel/);
    expect(sync).not.toHaveBeenCalled();
  });

  it('a failed re-fetch still acknowledges the notification without leaking errors', async () => {
    const findUnique = jest.fn(async () => CHANNEL);
    const { service } = make(findUnique, jest.fn().mockRejectedValue(new Error('provider down')));

    await expect(service.verifyAndDispatch('user-1', headers())).resolves.toEqual({
      userId: 'user-1',
      synced: false,
    });
  });
});
