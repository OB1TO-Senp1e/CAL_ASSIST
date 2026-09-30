import { ConfigService } from '@nestjs/config';
import {
  EmailNotificationProvider,
  EMAIL_NOT_CONFIGURED,
  EMAIL_TRANSPORT_NOT_IMPLEMENTED,
} from './email-notification.provider';
import { NotificationPayload } from './notification.interface';

/**
 * R3 — the email provider must never invent a `messageId`.
 *
 * It used to answer an unconfigured SMTP server with
 * `{ success: true, messageId: 'sim_<epoch>' }` and, when SMTP *was* configured,
 * with `{ success: true, messageId: 'email_<epoch>' }` — despite `nodemailer`
 * not being a dependency and the `sendMail` call being commented out. Because
 * `NotificationService` writes a `NOTIFICATION_SENT` audit row keyed off
 * `result.success`, a totally undelivered email was recorded as sent.
 *
 * These tests fail if *any* fabricated id is ever returned again.
 */

const payload: NotificationPayload = {
  type: 'REMINDER',
  priority: 'NORMAL',
  title: 'Standup in 10 minutes',
  message: 'Your standup starts soon.',
  channel: 'EMAIL',
};

/**
 * Matches the shapes the provider used to fabricate: `sim_<epoch>`,
 * `email_<epoch>` and `sim_sms_<epoch>`. A real transport's id (a provider UUID,
 * an RFC 5322 Message-ID, a SendGrid/Twilio id) does not look like this.
 */
const FABRICATED_ID = /(^|_)(sim|email|mock|fake|test|dummy)_?\d{10,}/i;

const preferencesFor = (address?: string, enabled = true) => ({
  email: { enabled, address },
});

describe('EmailNotificationProvider (R3 — no fabricated success)', () => {
  describe('with no SMTP credentials configured', () => {
    const provider = new EmailNotificationProvider(
      new ConfigService({ SMTP_HOST: 'smtp.example.com' })
    );

    it('reports failure instead of a simulated success', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      expect(result.success).toBe(false);
      expect(result.channel).toBe('EMAIL');
    });

    it('fails with the explicit not-configured code', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      expect(result.error).toContain(EMAIL_NOT_CONFIGURED);
    });

    it('returns no messageId at all', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      expect(result.messageId).toBeUndefined();
    });

    it('never returns an id matching the fabricated patterns', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      expect(result.messageId).not.toBeDefined();
      expect(String(result.messageId ?? '')).not.toMatch(FABRICATED_ID);
    });

    it('does not claim success even if a transport is later wired up', async () => {
      // Guards the whole class of bug: `success: true` must always come with a
      // real id, and `success: false` must never come with one.
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      if (result.success) {
        expect(result.messageId).toBeDefined();
        expect(result.messageId).not.toMatch(FABRICATED_ID);
      } else {
        expect(result.messageId).toBeUndefined();
      }
    });
  });

  describe('with SMTP credentials configured but no transport implemented', () => {
    const provider = new EmailNotificationProvider(
      new ConfigService({
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'smtp-user',
        SMTP_PASS: 'smtp-pass',
      })
    );

    it('still reports failure, because nothing was sent', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      expect(result.success).toBe(false);
    });

    it('fails with the transport-not-implemented code, not the not-configured code', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      expect(result.error).toContain(EMAIL_TRANSPORT_NOT_IMPLEMENTED);
      expect(result.error).not.toContain(EMAIL_NOT_CONFIGURED);
    });

    it('does not fabricate an `email_<epoch>` id', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));

      expect(result.messageId).toBeUndefined();
    });
  });

  describe('with email disabled or no address', () => {
    const provider = new EmailNotificationProvider(new ConfigService({}));

    it('reports failure when the channel is disabled', async () => {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com', false));

      expect(result.success).toBe(false);
      expect(result.messageId).toBeUndefined();
    });

    it('reports failure when no address is set', async () => {
      const result = await provider.send('user-1', payload, preferencesFor(undefined));

      expect(result.success).toBe(false);
      expect(result.error).toContain('no address');
    });
  });

  it('can never produce a result that is both successful and undelivered', async () => {
    const configured = new EmailNotificationProvider(
      new ConfigService({ SMTP_USER: 'u', SMTP_PASS: 'p' })
    );

    for (const provider of [configured, new EmailNotificationProvider(new ConfigService({}))]) {
      const result = await provider.send('user-1', payload, preferencesFor('a@b.com'));
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.messageId).toBeUndefined();
    }
  });
});
