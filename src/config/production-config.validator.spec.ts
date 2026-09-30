import { ConfigService } from '@nestjs/config';
import {
  ProductionConfigValidator,
  validateProductionSecrets,
  validateRedirectUris,
} from './production-config.validator';

const PROD_VARS: Record<string, string> = {
  GOOGLE_REDIRECT_URI: 'https://app.example.com/api/calendar/callback/google',
  GOOGLE_LOGIN_CALLBACK_URL: 'https://app.example.com/auth/google/callback',
  MICROSOFT_REDIRECT_URI: 'https://app.example.com/api/calendar/callback/outlook',
  APPLE_REDIRECT_URI: 'https://app.example.com/api/calendar/callback/apple',
  JWT_SECRET: 'A7kQ2mV9pL4xR8cN3sF6yH1tD5bZ0wEgT',
  SESSION_SECRET: 's9D2fK6mR1vX8qB4nL7pC3yH5aW0eZgT',
  SESSION_COOKIE_SECURE: 'true',
  OAUTH_TOKEN_KEY: Buffer.alloc(32, 1).toString('base64'),
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

describe('validateProductionSecrets', () => {
  it('rejects short secrets, insecure cookies, and missing token encryption keys', () => {
    const problems = validateProductionSecrets(() => undefined, true);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('JWT_SECRET'),
        expect.stringContaining('SESSION_SECRET'),
        expect.stringContaining('SESSION_COOKIE_SECURE'),
        expect.stringContaining('OAUTH_TOKEN_KEY'),
      ])
    );
  });

  it('accepts secure cookies, strong secrets, and a 32-byte OAuth key', () => {
    expect(validateProductionSecrets((key) => PROD_VARS[key], true)).toEqual([]);
  });

  it('rejects an all-zero OAuth key and placeholder production secrets', () => {
    const placeholders: Record<string, string> = {
      JWT_SECRET: 'your-secure-jwt-secret-change-in-production',
      SESSION_SECRET: 'change-me-before-production-session-secret',
      OAUTH_TOKEN_KEY: Buffer.alloc(32).toString('base64'),
    };
    const get = (key: string) => placeholders[key] ?? PROD_VARS[key];

    const problems = validateProductionSecrets(get, true);

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('JWT_SECRET'),
        expect.stringContaining('SESSION_SECRET'),
        expect.stringContaining('OAUTH_TOKEN_KEY'),
      ])
    );
  });

  it('does not impose production secret rules in development', () => {
    expect(validateProductionSecrets(() => undefined, false)).toEqual([]);
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
