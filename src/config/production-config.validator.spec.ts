import { ConfigService } from '@nestjs/config';
import { ProductionConfigValidator, validateRedirectUris } from './production-config.validator';

const PROD_VARS: Record<string, string> = {
  GOOGLE_REDIRECT_URI: 'https://app.example.com/api/calendar/callback/google',
  GOOGLE_LOGIN_CALLBACK_URL: 'https://app.example.com/auth/google/callback',
  MICROSOFT_REDIRECT_URI: 'https://app.example.com/api/calendar/callback/outlook',
  APPLE_REDIRECT_URI: 'https://app.example.com/api/calendar/callback/apple',
};

describe('validateRedirectUris (C9)', () => {
  it('passes production config with HTTPS redirect URIs', () => {
    const problems = validateRedirectUris((k) => PROD_VARS[k], true);
    expect(problems).toEqual([]);
  });

  it('rejects a missing redirect URI in production (localhost fallback)', () => {
    const get = (k: string) => (k === 'GOOGLE_REDIRECT_URI' ? undefined : PROD_VARS[k]);
    const problems = validateRedirectUris(get, true);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('GOOGLE_REDIRECT_URI');
    expect(problems[0]).toContain('not set');
  });

  it('rejects an http:// redirect URI in production', () => {
    const get = (k: string) =>
      k === 'GOOGLE_LOGIN_CALLBACK_URL'
        ? 'http://app.example.com/auth/google/callback'
        : PROD_VARS[k];
    const problems = validateRedirectUris(get, true);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('must be an https:// URL');
  });

  it('allows localhost http fallbacks outside production', () => {
    const problems = validateRedirectUris(() => undefined, false);
    expect(problems).toEqual([]);
  });
});

describe('ProductionConfigValidator (C9)', () => {
  const make = (env: Record<string, string | undefined>) => {
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    return new ProductionConfigValidator(config);
  };

  it('throws at boot when production redirect URIs are insecure', () => {
    const validator = make({ NODE_ENV: 'production' });
    expect(() => validator.onModuleInit()).toThrow(/Insecure OAuth redirect configuration/);
  });

  it('boots cleanly in production with HTTPS URIs set', () => {
    const validator = make({ NODE_ENV: 'production', ...PROD_VARS });
    expect(() => validator.onModuleInit()).not.toThrow();
  });

  it('boots cleanly in development with no redirect URIs set', () => {
    const validator = make({ NODE_ENV: 'development' });
    expect(() => validator.onModuleInit()).not.toThrow();
  });
});
