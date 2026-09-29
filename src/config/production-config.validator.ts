import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * C9 — production OAuth configuration guard.
 *
 * Google requires production redirect URIs to be HTTPS. The adapters fall
 * back to http://localhost URIs when the env vars are unset, which is fine in
 * development but must never boot in production. This validator checks the
 * *effective* values (what the adapters would actually use) and fails fast.
 */

const REDIRECT_URI_VARS: ReadonlyArray<{ name: string; devDefault: string }> = [
  {
    name: 'GOOGLE_REDIRECT_URI',
    devDefault: 'http://localhost:3000/api/calendar/callback/google',
  },
  {
    name: 'GOOGLE_LOGIN_CALLBACK_URL',
    devDefault: 'http://localhost:3000/auth/google/callback',
  },
  {
    name: 'MICROSOFT_REDIRECT_URI',
    devDefault: 'http://localhost:3000/api/calendar/callback/outlook',
  },
  {
    name: 'APPLE_REDIRECT_URI',
    devDefault: 'http://localhost:3000/api/calendar/callback/apple',
  },
];

export function isHttpsUri(value: string): boolean {
  return /^https:\/\//i.test(value);
}

/** Returns the list of human-readable problems (empty = config is OK). */
export function validateRedirectUris(
  get: (name: string) => string | undefined,
  isProduction: boolean
): string[] {
  const problems: string[] = [];
  for (const { name, devDefault } of REDIRECT_URI_VARS) {
    const effective = get(name) ?? devDefault;
    if (!isProduction) continue; // dev may use http://localhost
    if (!get(name)) {
      problems.push(`${name} is not set (would fall back to insecure ${devDefault})`);
    } else if (!isHttpsUri(effective)) {
      problems.push(`${name} must be an https:// URL in production (got "${effective}")`);
    }
  }
  return problems;
}

export function validateProductionSecrets(
  get: (name: string) => string | undefined,
  isProduction: boolean
): string[] {
  if (!isProduction) return [];

  const problems: string[] = [];
  for (const name of ['JWT_SECRET', 'SESSION_SECRET']) {
    const value = get(name) ?? '';
    if (value.length < 32 || isPlaceholderSecret(value)) {
      problems.push(`${name} must be explicitly set to at least 32 characters`);
    }
  }

  if (get('SESSION_COOKIE_SECURE') !== 'true') {
    problems.push('SESSION_COOKIE_SECURE must be true in production');
  }

  const oauthKey = get('OAUTH_TOKEN_KEY') ?? '';
  const decodedKey = Buffer.from(oauthKey, 'base64');
  if (
    decodedKey.length !== 32 ||
    decodedKey.toString('base64') !== oauthKey ||
    decodedKey.every((byte) => byte === 0)
  ) {
    problems.push('OAUTH_TOKEN_KEY must be a base64-encoded 32-byte key in production');
  }

  return problems;
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.length < 32 ||
    /^(.)\1+$/.test(normalized) ||
    /(^|[-_\s])(your|change(?:[-_\s]?me)?|placeholder|example|sample|dummy|default|replace(?:[-_\s]?me)?|insert|test|password|secret|local-development)([-_\s]|$)/i.test(
      normalized
    )
  );
}

@Injectable()
export class ProductionConfigValidator implements OnModuleInit {
  private readonly logger = new Logger(ProductionConfigValidator.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const get = (name: string): string | undefined => this.config.get<string>(name);
    const problems = [
      ...validateRedirectUris(get, isProduction),
      ...validateProductionSecrets(get, isProduction),
    ];
    if (problems.length > 0) {
      const message = `Insecure OAuth redirect configuration for production: ${problems.join('; ')}`;
      this.logger.error(message);
      throw new Error(message);
    }
    if (isProduction) {
      this.logger.log('OAuth redirect URIs validated: HTTPS-only (production).');
    }
  }
}
