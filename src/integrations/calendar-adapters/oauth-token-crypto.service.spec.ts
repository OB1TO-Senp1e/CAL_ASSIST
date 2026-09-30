import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { OAuthTokenCryptoService } from './oauth-token-crypto.service';

const b64Key = () => randomBytes(32).toString('base64');

const makeService = (key: string | undefined, nodeEnv = 'test', previousKeys?: string) => {
  const config = {
    get: (name: string) =>
      name === 'OAUTH_TOKEN_KEY'
        ? key
        : name === 'OAUTH_TOKEN_PREVIOUS_KEYS'
          ? previousKeys
          : name === 'NODE_ENV'
            ? nodeEnv
            : undefined,
  } as unknown as ConfigService;
  const svc = new OAuthTokenCryptoService(config);
  svc.onModuleInit();
  return svc;
};

/**
 * C2 acceptance: AES-256-GCM round-trip, tamper detection, wrong-key
 * rejection, idempotent encrypt, key validation with production fail-fast.
 */
describe('OAuthTokenCryptoService (C2)', () => {
  it('round-trips a token through encrypt/decrypt', () => {
    const svc = makeService(b64Key());
    const plaintext = 'ya29.a0B-token-value_123';
    const stored = svc.encrypt(plaintext)!;
    expect(stored).not.toContain(plaintext);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(svc.decrypt(stored)).toBe(plaintext);
  });

  it('uses a fresh IV per value (same plaintext => different ciphertext)', () => {
    const svc = makeService(b64Key());
    const a = svc.encrypt('same-token')!;
    const b = svc.encrypt('same-token')!;
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('same-token');
    expect(svc.decrypt(b)).toBe('same-token');
  });

  it('rejects tampered ciphertext with an error, not garbage', () => {
    const svc = makeService(b64Key());
    const stored = svc.encrypt('top-secret-token')!;
    const buf = Buffer.from(stored.slice('v1:'.length), 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    const tampered = 'v1:' + buf.toString('base64');
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('rejects a value encrypted under a different key', () => {
    const a = makeService(b64Key());
    const b = makeService(b64Key());
    const stored = a.encrypt('token-under-key-a')!;
    expect(() => b.decrypt(stored)).toThrow();
  });

  it('decrypts with a previous key and rotates ciphertext to the active key', () => {
    const oldKey = b64Key();
    const nextKey = b64Key();
    const oldService = makeService(oldKey);
    const stored = oldService.encrypt('calendar-refresh-token')!;
    const rotatingService = makeService(nextKey, 'test', oldKey);

    expect(rotatingService.decrypt(stored)).toBe('calendar-refresh-token');
    expect(rotatingService.needsReencryption(stored)).toBe(true);

    const rotated = rotatingService.reencrypt(stored)!;
    expect(rotated).not.toBe(stored);
    expect(rotatingService.decrypt(rotated)).toBe('calendar-refresh-token');
    expect(rotatingService.needsReencryption(rotated)).toBe(false);
  });

  it('rejects malformed previous-key configuration', () => {
    const service = new OAuthTokenCryptoService({
      get: (name: string) =>
        name === 'OAUTH_TOKEN_KEY'
          ? b64Key()
          : name === 'OAUTH_TOKEN_PREVIOUS_KEYS'
            ? 'bad'
            : 'test',
    } as unknown as ConfigService);
    expect(() => service.onModuleInit()).toThrow(/OAUTH_TOKEN_PREVIOUS_KEYS/);
  });

  it('is idempotent: encrypt skips values that already carry the v1: prefix', () => {
    const svc = makeService(b64Key());
    const once = svc.encrypt('t0ken')!;
    const twice = svc.encrypt(once)!;
    expect(twice).toBe(once);
  });

  it('passes through null/undefined and legacy plaintext reads unchanged', () => {
    const svc = makeService(b64Key());
    expect(svc.encrypt(null)).toBeNull();
    expect(svc.encrypt(undefined)).toBeUndefined();
    // Pre-migration rows: decrypt of raw plaintext returns it as-is so reads
    // keep working until the migration script runs.
    expect(svc.decrypt('legacy-plaintext-token')).toBe('legacy-plaintext-token');
    expect(OAuthTokenCryptoService.isEncrypted('v1:abc')).toBe(true);
    expect(OAuthTokenCryptoService.isEncrypted('plain')).toBe(false);
  });

  it('refuses to encrypt (throw) when no key is configured, in any env', () => {
    const svc = makeService(undefined);
    expect(svc.enabled).toBe(false);
    expect(() => svc.encrypt('t0ken')).toThrow(/encryption key is not configured/);
  });

  it('fails fast at boot in production when the key is missing or the wrong length', () => {
    expect(() => makeService(undefined, 'production')).toThrow(/OAUTH_TOKEN_KEY/);
    expect(() => makeService(randomBytes(16).toString('base64'), 'production')).toThrow(
      /OAUTH_TOKEN_KEY/
    );
    expect(() => makeService(b64Key(), 'production')).not.toThrow();
  });

  it('warns instead of failing at boot in development when the key is absent', () => {
    const svc = makeService(undefined, 'development');
    expect(svc.enabled).toBe(false);
  });

  it('rejects keys that are not 32 raw bytes even in dev (stays disabled)', () => {
    const svc = makeService(Buffer.from('too-short').toString('base64'), 'development');
    expect(svc.enabled).toBe(false);
  });
});
