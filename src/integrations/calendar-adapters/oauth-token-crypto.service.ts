import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * C2 — OAuth token encryption at rest.
 *
 * Single repository-layer chokepoint for the `accessToken` / `refreshToken`
 * columns on CalendarConnection. Nothing outside CalendarConnectionService
 * should ever read or write those columns; it calls encrypt()/decrypt() here so
 * plaintext tokens exist only transiently in memory on the server.
 *
 * Format:  "v1:" + base64( iv(12) || authTag(16) || ciphertext )
 *   - AES-256-GCM, key from env OAUTH_TOKEN_KEY (base64, 32 raw bytes).
 *   - A fresh random 12-byte IV per value (never reused).
 *   - Auth tag is verified on decrypt; tampering/ciphertext mismatch/wrong key
 *     all throw and are surfaced as a service error, never silently ignored.
 *
 * Values already carrying the "v1:" prefix are treated as encrypted (so the
 * migration is idempotent); anything else is treated as legacy plaintext.
 */

const PREFIX = 'v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

@Injectable()
export class OAuthTokenCryptoService implements OnModuleInit {
  private readonly logger = new Logger(OAuthTokenCryptoService.name);
  private key: Buffer | null = null;
  private decryptionKeys: Buffer[] = [];
  private readonly isProduction: boolean;

  constructor(private readonly config: ConfigService) {
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
  }

  onModuleInit(): void {
    const raw = this.config.get<string>('OAUTH_TOKEN_KEY');
    this.key = this.parseKey(raw);
    const previousKeys = this.parsePreviousKeys(
      this.config.get<string>('OAUTH_TOKEN_PREVIOUS_KEYS')
    );
    this.decryptionKeys = this.key
      ? [this.key, ...previousKeys.filter((previous) => !previous.equals(this.key!))]
      : [];
    if (!this.key) {
      const message =
        'OAUTH_TOKEN_KEY is missing or not a base64-encoded 32-byte key. ' +
        (this.isProduction
          ? 'Refusing to start in production without a valid token encryption key.'
          : 'Token encryption is disabled for this dev boot; set OAUTH_TOKEN_KEY to enable it.');
      if (this.isProduction) {
        this.logger.error(message);
        throw new Error(message);
      }
      this.logger.warn(message);
    } else {
      this.logger.log('OAuth token encryption at rest is enabled (AES-256-GCM).');
    }
  }

  /** Returns a 32-byte key or null when absent/invalid. Never logs the key. */
  private parseKey(raw: string | undefined): Buffer | null {
    if (!raw) return null;
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      return null;
    }
    if (buf.length !== KEY_BYTES || buf.toString('base64') !== raw) return null;
    return buf;
  }

  private parsePreviousKeys(raw: string | undefined): Buffer[] {
    if (!raw?.trim()) return [];
    return raw.split(',').map((value) => {
      const key = this.parseKey(value.trim());
      if (!key) {
        throw new Error(
          'OAUTH_TOKEN_PREVIOUS_KEYS must be a comma-separated list of base64-encoded 32-byte keys'
        );
      }
      return key;
    });
  }

  /** True when this process has a usable key loaded. */
  get enabled(): boolean {
    return this.key !== null;
  }

  /** True for a value that this service produced (already encrypted). */
  static isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  /**
   * Encrypt a plaintext token. Idempotent: an already-encrypted value is
   * returned unchanged so re-running the migration or double-writes are safe.
   */
  encrypt(plaintext: string | null | undefined): string | null | undefined {
    if (plaintext === null || plaintext === undefined) return plaintext;
    if (OAuthTokenCryptoService.isEncrypted(plaintext)) return plaintext;
    if (!this.key) {
      throw new ServiceUnavailableException(
        'OAuth token encryption key is not configured; cannot store token securely.'
      );
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const packed = Buffer.concat([iv, authTag, ciphertext]);
    return PREFIX + packed.toString('base64');
  }

  /**
   * Decrypt a stored token. A value without the "v1:" prefix is assumed to be
   * legacy plaintext (pre-migration) and returned as-is so reads keep working
   * during the rollout window; the migration script closes that gap.
   */
  decrypt(stored: string | null | undefined): string | null | undefined {
    if (stored === null || stored === undefined) return stored;
    if (!OAuthTokenCryptoService.isEncrypted(stored)) return stored;
    if (this.decryptionKeys.length === 0) {
      throw new ServiceUnavailableException(
        'OAuth token encryption key is not configured; cannot decrypt stored token.'
      );
    }
    const packed = Buffer.from(stored.slice(PREFIX.length), 'base64');
    if (packed.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Stored OAuth token is malformed (too short).');
    }
    const iv = packed.subarray(0, IV_BYTES);
    const authTag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
    for (const key of this.decryptionKeys) {
      try {
        return this.decryptWithKey(key, iv, authTag, ciphertext);
      } catch {
        // Try the configured previous keys before surfacing a decryption error.
      }
    }
    throw new Error('Unable to decrypt stored OAuth token with configured key ring.');
  }

  private decryptWithKey(key: Buffer, iv: Buffer, authTag: Buffer, ciphertext: Buffer): string {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  needsReencryption(stored: string | null | undefined): boolean {
    if (stored === null || stored === undefined) return false;
    if (!OAuthTokenCryptoService.isEncrypted(stored)) return true;
    if (!this.key) {
      throw new ServiceUnavailableException(
        'OAuth token encryption key is not configured; cannot rotate stored token.'
      );
    }

    const packed = Buffer.from(stored.slice(PREFIX.length), 'base64');
    if (packed.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Stored OAuth token is malformed (too short).');
    }
    try {
      this.decryptWithKey(
        this.key,
        packed.subarray(0, IV_BYTES),
        packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES),
        packed.subarray(IV_BYTES + TAG_BYTES)
      );
      return false;
    } catch {
      this.decrypt(stored);
      return true;
    }
  }

  /** Re-encrypts a stored token with the active key; use only in controlled rotation. */
  reencrypt(stored: string | null | undefined): string | null | undefined {
    if (stored === null || stored === undefined) return stored;
    if (!this.needsReencryption(stored)) return stored;
    const plaintext = this.decrypt(stored);
    return this.encrypt(plaintext);
  }
}
