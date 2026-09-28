import { mergePreferences, normalisePreferencesUpdate } from './notification.service';
import { NotificationPreferencesSchema } from './notification.interface';

/**
 * Stage 4 — notification preferences contract.
 *
 * `POST /api/notifications/preferences` used to take `@Body() body: any` and
 * write it straight over the stored blob, and `GET` returned a redirect message
 * pointing at a route that does not exist.
 */
describe('notification preferences', () => {
  describe('NotificationPreferencesSchema', () => {
    it('accepts a partial channel update', () => {
      const parsed = NotificationPreferencesSchema.safeParse({
        push: { enabled: true, deviceTokens: ['tok-1'] },
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts toggling workingHours.enabled alone', () => {
      const parsed = NotificationPreferencesSchema.safeParse({
        workingHours: { enabled: false },
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects a non-boolean channel flag', () => {
      expect(NotificationPreferencesSchema.safeParse({ email: { enabled: 'yes' } }).success).toBe(
        false,
      );
    });

    it('rejects a malformed email address', () => {
      expect(
        NotificationPreferencesSchema.safeParse({
          email: { enabled: true, address: 'nope' },
        }).success,
      ).toBe(false);
    });

    it('rejects an out-of-range weekday', () => {
      expect(
        NotificationPreferencesSchema.safeParse({
          workingHours: { enabled: true, days: [9] },
        }).success,
      ).toBe(false);
    });

    it('rejects a muteUntil that is neither ISO nor epoch', () => {
      expect(NotificationPreferencesSchema.safeParse({ muteUntil: 'soon' }).success).toBe(false);
    });
  });

  describe('mergePreferences (bug: partial update wiped other channels)', () => {
    const stored = {
      email: { enabled: true, address: 'user@example.com' },
      sms: { enabled: false },
      push: { enabled: false },
      workingHours: { enabled: true, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
      timezone: 'UTC',
    };

    it('keeps untouched channels', () => {
      const merged = mergePreferences(stored, { push: { enabled: true } });
      expect(merged.email).toEqual(stored.email);
      expect(merged.sms).toEqual(stored.sms);
      expect(merged.timezone).toBe('UTC');
    });

    it('keeps sibling fields inside an updated channel', () => {
      const merged = mergePreferences(stored, { email: { enabled: false } });
      expect(merged.email).toEqual({ enabled: false, address: 'user@example.com' });
    });

    it('overwrites arrays wholesale rather than merging indexes', () => {
      const merged = mergePreferences(stored, { workingHours: { days: [0, 6] } });
      expect(merged.workingHours.days).toEqual([0, 6]);
      expect(merged.workingHours.start).toBe('09:00');
    });

    it('adds new channels', () => {
      const merged = mergePreferences(stored, { muteUntil: '2026-10-01T00:00:00.000Z' });
      expect(merged.muteUntil).toBe('2026-10-01T00:00:00.000Z');
    });

    it('deletes a channel when the patch sends null', () => {
      const merged = mergePreferences(stored, { sms: null });
      expect('sms' in merged).toBe(false);
    });

    it('does not mutate the base object', () => {
      const snapshot = JSON.parse(JSON.stringify(stored));
      mergePreferences(stored, { email: { enabled: false } });
      expect(stored).toEqual(snapshot);
    });
  });

  describe('normalisePreferencesUpdate', () => {
    it('keeps muteUntil as a stable ISO string', () => {
      expect(normalisePreferencesUpdate({ muteUntil: '2026-10-01T00:00:00Z' }).muteUntil).toBe(
        '2026-10-01T00:00:00.000Z',
      );
    });

    it('accepts epoch milliseconds', () => {
      const epoch = Date.UTC(2026, 9, 1);
      expect(normalisePreferencesUpdate({ muteUntil: epoch }).muteUntil).toBe(
        '2026-10-01T00:00:00.000Z',
      );
    });

    it('reduces an unparseable date to null (which deletes the key on merge)', () => {
      expect(normalisePreferencesUpdate({ muteUntil: 'not-a-date' }).muteUntil).toBeNull();
    });
  });
});
