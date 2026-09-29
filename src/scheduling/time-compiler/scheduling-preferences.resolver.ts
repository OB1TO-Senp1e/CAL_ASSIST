import { Injectable, Logger } from '@nestjs/common';
import { SchedulingPreferences } from './domain/time-compiler.types';
import { CompileScheduleRequest } from './interfaces/time-compiler.interface';

/** Tasks with no explicit estimate get a single default focus block. */
export const DEFAULT_TASK_DURATION_MIN = 60;

/**
 * Preference precedence: explicit request > stored user preferences > defaults.
 *
 * The previous controller only ever used an inline default block, so a user who
 * had told the app they work 07:00-15:00 was still scheduled 09:00-17:00.
 */
@Injectable()
export class SchedulingPreferencesResolver {
  private readonly logger = new Logger(SchedulingPreferencesResolver.name);

  defaults(): SchedulingPreferences {
    return {
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      preferredFocusBlockDuration: DEFAULT_TASK_DURATION_MIN,
      maxFocusBlockDuration: 180,
      minBreakDuration: 15,
      maxDailyHours: 8,
      preferredBreakInterval: 90,
      energyPeakHours: [
        { start: '09:00', end: '11:00' },
        { start: '14:00', end: '16:00' },
      ],
      bufferBetweenTasks: 10,
      travelBufferDefault: 15,
      protectFocusTime: true,
      allowWeekendScheduling: false,
      taskOrderingStrategy: 'BALANCED',
    };
  }

  resolve(
    request: CompileScheduleRequest,
    rows: Array<{ key: string; valueJson: string }>
  ): SchedulingPreferences {
    return { ...this.defaults(), ...this.fromStored(rows), ...(request.preferences ?? {}) };
  }

  /**
   * `context-engine` stores working hours as `working_hours: { start, end, days }`
   * and everything else under `scheduling_preferences`. Read both shapes.
   */
  private fromStored(
    rows: Array<{ key: string; valueJson: string }>
  ): Partial<SchedulingPreferences> {
    const out: Partial<SchedulingPreferences> = {};

    for (const row of rows) {
      let value: any;
      try {
        value = JSON.parse(row.valueJson);
      } catch {
        this.logger.warn(`Preference "${row.key}" is not valid JSON; ignoring`);
        continue;
      }
      if (value === null || typeof value !== 'object') continue;

      if (row.key === 'working_hours') {
        if (typeof value.start === 'string') out.workingHoursStart = value.start;
        if (typeof value.end === 'string') out.workingHoursEnd = value.end;
        if (Array.isArray(value.days)) {
          out.allowWeekendScheduling = value.days.some((d: number) => d === 0 || d === 6);
        }
        continue;
      }

      if (row.key === 'scheduling_preferences') {
        const allowed: Array<keyof SchedulingPreferences> = [
          'workingHoursStart',
          'workingHoursEnd',
          'preferredFocusBlockDuration',
          'maxFocusBlockDuration',
          'minBreakDuration',
          'maxDailyHours',
          'preferredBreakInterval',
          'energyPeakHours',
          'bufferBetweenTasks',
          'travelBufferDefault',
          'protectFocusTime',
          'allowWeekendScheduling',
          'taskOrderingStrategy',
        ];
        for (const key of allowed) {
          if (value[key] !== undefined) (out as any)[key] = value[key];
        }
      }
    }

    return out;
  }
}
