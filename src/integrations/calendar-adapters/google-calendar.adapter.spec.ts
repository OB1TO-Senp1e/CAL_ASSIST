import { ConfigService } from '@nestjs/config';
import { GoogleCalendarAdapter } from './google-calendar.adapter';

/**
 * C1 guard tests: the Google calendar connection must request only the minimal
 * scope set, must send prompt=consent only when the caller says no refresh
 * token is stored, and must reject a partial scope grant with a clear,
 * user-facing error instead of persisting a half-connected account.
 */
describe('GoogleCalendarAdapter C1 scope minimization', () => {
  const REQUIRED = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];

  const makeAdapter = () => {
    const config = {
      get: (key: string, fallback?: string) =>
        (
          ({
            GOOGLE_CLIENT_ID: 'test-client-id',
            GOOGLE_CLIENT_SECRET: 'test-client-secret',
            GOOGLE_REDIRECT_URI: 'https://app.example.test/api/calendar/callback/google',
          }) as Record<string, string>
        )[key] ??
        fallback ??
        '',
    } as unknown as ConfigService;
    return new GoogleCalendarAdapter(config);
  };

  const json = (body: any, ok = true) =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests exactly the minimal scope set in the auth URL', () => {
    const url = new URL(
      makeAdapter().getAuthUrl('user-1', 'state-1', { requestConsentPrompt: true })
    );
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual([...REQUIRED].sort());
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('access_type')).toBe('offline');
  });

  it('omits prompt=consent when a refresh token is already stored', () => {
    const url = new URL(
      makeAdapter().getAuthUrl('user-1', 'state-1', { requestConsentPrompt: false })
    );
    expect(url.searchParams.get('prompt')).toBeNull();
    const urlNoOptions = new URL(makeAdapter().getAuthUrl('user-1', 'state-1'));
    expect(urlNoOptions.searchParams.get('prompt')).toBeNull();
  });

  it('returns granted scopes on a full grant', async () => {
    const adapter = makeAdapter();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input: any) => {
      if (String(input).endsWith('/token')) {
        return json({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          scope: REQUIRED.join(' '),
        });
      }
      return json({ email: 'user@gmail.com' });
    });

    const result = await adapter.handleCallback('code-1');
    expect(result.scopes.sort()).toEqual([...REQUIRED].sort());
    expect(result.externalUserId).toBe('user@gmail.com');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('throws a user-facing error when the calendar.events scope was not granted', async () => {
    const adapter = makeAdapter();
    jest.spyOn(global, 'fetch').mockImplementation((input: any) => {
      if (String(input).endsWith('/token')) {
        // Partial grant: identity scopes only.
        return json({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          scope: 'openid email',
        });
      }
      throw new Error('userinfo must not be called after a partial grant');
    });

    await expect(adapter.handleCallback('code-1')).rejects.toThrow(
      /did not grant the permissions[\s\S]*calendar\.events/
    );
  });

  it('throws when Google returns no scope field at all', async () => {
    const adapter = makeAdapter();
    jest.spyOn(global, 'fetch').mockImplementation((input: any) => {
      if (String(input).endsWith('/token')) {
        return json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
      }
      throw new Error('userinfo must not be called without granted scopes');
    });

    await expect(adapter.handleCallback('code-1')).rejects.toThrow(/did not grant the permissions/);
  });
});
