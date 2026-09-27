import { DateTime } from '../domain/calendar-event';

export interface TimeZoneInfo {
  id: string;
  name: string;
  offset: number;
  dstOffset: number;
  abbreviation: string;
  isDST: boolean;
}

export interface TimeZoneTransition {
  date: DateTime;
  offsetBefore: number;
  offsetAfter: number;
  isDSTStart: boolean;
}

export class TimeZoneEngine {
  private static timeZoneCache: Map<string, TimeZoneInfo> = new Map();
  private static transitionCache: Map<string, TimeZoneTransition[]> = new Map();

  static getTimeZoneInfo(timeZoneId: string, date: DateTime = DateTime.now()): TimeZoneInfo {
    const cacheKey = `${timeZoneId}:${date.toISOString().split('T')[0]}`;

    if (this.timeZoneCache.has(cacheKey)) {
      return this.timeZoneCache.get(cacheKey)!;
    }

    const info = this.computeTimeZoneInfo(timeZoneId, date);
    this.timeZoneCache.set(cacheKey, info);
    return info;
  }

  private static computeTimeZoneInfo(timeZoneId: string, date: DateTime): TimeZoneInfo {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZoneId,
        timeZoneName: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });

      const parts = formatter.formatToParts(date.toDate());
      const timeZoneName = parts.find((p) => p.type === 'timeZoneName')?.value || '';

      const jan = new Date(date.toDate().getFullYear(), 0, 1);
      const jul = new Date(date.toDate().getFullYear(), 6, 1);
      const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      const currentOffset = -date.toDate().getTimezoneOffset();
      const isDST = currentOffset !== stdOffset;

      return {
        id: timeZoneId,
        name: timeZoneId,
        offset: stdOffset,
        dstOffset: currentOffset,
        abbreviation: timeZoneName,
        isDST,
      };
    } catch {
      return {
        id: timeZoneId,
        name: timeZoneId,
        offset: 0,
        dstOffset: 0,
        abbreviation: 'UTC',
        isDST: false,
      };
    }
  }

  static getTransitions(timeZoneId: string, year: number): TimeZoneTransition[] {
    const cacheKey = `${timeZoneId}:${year}`;

    if (this.transitionCache.has(cacheKey)) {
      return this.transitionCache.get(cacheKey)!;
    }

    const transitions = this.computeTransitions(timeZoneId, year);
    this.transitionCache.set(cacheKey, transitions);
    return transitions;
  }

  private static computeTransitions(timeZoneId: string, year: number): TimeZoneTransition[] {
    const transitions: TimeZoneTransition[] = [];

    try {
      for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= 31; day++) {
          try {
            const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
            const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

            const offset1 = this.getOffsetAt(timeZoneId, date);
            const offset2 = this.getOffsetAt(timeZoneId, nextDate);

            if (offset1 !== offset2) {
              transitions.push({
                date: DateTime.fromISO(date.toISOString()),
                offsetBefore: offset1,
                offsetAfter: offset2,
                isDSTStart: offset2 < offset1,
              });
            }
          } catch {
            // Invalid date, continue
          }
        }
      }
    } catch {
      // Timezone not supported
    }

    return transitions;
  }

  private static getOffsetAt(timeZoneId: string, date: Date): number {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZoneId,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

      const utcHour = date.getUTCHours();
      const utcMinute = date.getUTCMinutes();

      let offset = (hour - utcHour) * 60 + (minute - utcMinute);

      // Adjust for day boundaries
      if (offset > 720) offset -= 1440;
      if (offset < -720) offset += 1440;

      return -offset; // Convert to standard offset (positive = ahead of UTC)
    } catch {
      return 0;
    }
  }

  static convertTime(dateTime: DateTime, fromTimeZone: string, toTimeZone: string): DateTime {
    const fromInfo = this.getTimeZoneInfo(fromTimeZone, dateTime);
    const toInfo = this.getTimeZoneInfo(toTimeZone, dateTime);

    const offsetDiff = toInfo.dstOffset - fromInfo.dstOffset;
    return dateTime.addMinutes(offsetDiff);
  }

  static convertToUTC(dateTime: DateTime): DateTime {
    const info = this.getTimeZoneInfo(dateTime.timeZone, dateTime);
    return dateTime.addMinutes(-info.dstOffset).withTimeZone('UTC');
  }

  static convertFromUTC(utcDateTime: DateTime, targetTimeZone: string): DateTime {
    const info = this.getTimeZoneInfo(targetTimeZone, utcDateTime);
    return utcDateTime.addMinutes(info.dstOffset).withTimeZone(targetTimeZone);
  }

  static isAmbiguous(timeZoneId: string, dateTime: DateTime): boolean {
    const transitions = this.getTransitions(timeZoneId, dateTime.toDate().getFullYear());
    const dateStr = dateTime.toISOString().split('T')[0];

    return transitions.some((t) => t.date.toISOString().split('T')[0] === dateStr);
  }

  static getAmbiguousTimes(timeZoneId: string, date: DateTime): DateTime[] {
    const transitions = this.getTransitions(timeZoneId, date.toDate().getFullYear());
    const dateStr = date.toISOString().split('T')[0];

    return transitions
      .filter((t) => t.date.toISOString().split('T')[0] === dateStr && t.isDSTStart)
      .map((t) => t.date);
  }

  static getSkippedTimes(timeZoneId: string, date: DateTime): DateTime[] {
    const transitions = this.getTransitions(timeZoneId, date.toDate().getFullYear());
    const dateStr = date.toISOString().split('T')[0];

    return transitions
      .filter((t) => t.date.toISOString().split('T')[0] === dateStr && !t.isDSTStart)
      .map((t) => t.date);
  }

  static getAllTimeZones(): string[] {
    return Intl.supportedValuesOf('timeZone');
  }

  static findTimeZone(query: string): string[] {
    const all = this.getAllTimeZones();
    const lower = query.toLowerCase();
    return all.filter((tz) => tz.toLowerCase().includes(lower));
  }
}
