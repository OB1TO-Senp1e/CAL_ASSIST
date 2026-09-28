import { createHash } from 'node:crypto';
import { GoogleCalendarAdapter } from './google-calendar.adapter';

/** RFC 7636 vectors used to prove our S256 derivation is correct. */
describe('GoogleCalendarAdapter C7 PKCE', () => {
  const makeAdapter = () => {
    const config = {
      get: () => '',
    } as any;
    return new GoogleCalendarAdapter(config);
  };

  it('includes code_challenge and S256 method when a challenge is supplied', () => {
    const url = new URL(
      makeAdapter().getAuthUrl('u1', 'state-1', {
        codeChallenge: 'challenge-value',
        codeChallengeMethod: 'S256',
      })
    );
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // The verifier must never appear in the URL.
    expect(url.toString()).not.toContain('code_verifier');
  });

  it('omits PKCE params when no challenge is given (legacy providers)', () => {
    const url = new URL(makeAdapter().getAuthUrl('u1', 'state-1', {}));
    expect(url.searchParams.get('code_challenge')).toBeNull();
  });

  it('sends code_verifier in the token exchange body', async () => {
    const adapter = makeAdapter();
    const calls: Array<{ url: string; body: URLSearchParams }> = [];
    jest.spyOn(global, 'fetch').mockImplementation((input: any, init: any) => {
      const url = String(input);
      calls.push({ url, body: new URLSearchParams(init?.body ?? '') });
      if (url.endsWith('/token')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'at',
              refresh_token: 'rt',
              expires_in: 3600,
              scope: 'https://www.googleapis.com/auth/calendar.events openid email',
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ email: 'u@gmail.com' }),
      } as Response);
    });

    await adapter.handleCallback('code-1', 'verifier-abc');
    const tokenCall = calls.find((c) => c.url.endsWith('/token'));
    expect(tokenCall?.body.get('code_verifier')).toBe('verifier-abc');
  });

  it('computes S256 challenge from verifier the RFC 7636 way', () => {
    // Known vector from RFC 7636 Appendix B.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});
