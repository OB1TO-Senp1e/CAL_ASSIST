import { z } from 'zod';
import { DateTime, RecurrenceRule } from '../domain/calendar-event';

export const CreateEventSchema = z.object({
  calendarId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  allDay: z.boolean().default(false),
  timeZone: z.string().optional(),
  recurrence: z
    .union([
      z.string(),
      z.object({
        frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
        interval: z.number().int().positive().default(1),
        byDay: z.array(z.number().int().min(0).max(6)).optional(),
        byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
        byMonth: z.array(z.number().int().min(1).max(12)).optional(),
        count: z.number().int().positive().optional(),
        until: z.string().datetime().optional(),
        weekStart: z.number().int().min(0).max(6).optional(),
      }),
    ])
    .optional(),
  category: z
    .enum([
      'PERSONAL',
      'WORK',
      'MEETING',
      'APPOINTMENT',
      'REMINDER',
      'HOLIDAY',
      'BIRTHDAY',
      'TRAVEL',
      'FOCUS_TIME',
      'CUSTOM',
    ])
    .default('PERSONAL'),
  color: z.string().optional(),
  participants: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        status: z
          .enum(['NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'DELEGATED'])
          .default('NEEDS_ACTION'),
        role: z.enum(['REQUIRED', 'OPTIONAL', 'ORGANIZER']).default('REQUIRED'),
      })
    )
    .optional(),
  reminders: z
    .array(
      z.object({
        minutesBefore: z.number().int().positive(),
        method: z.enum(['EMAIL', 'PUSH', 'SMS', 'POPUP']),
      })
    )
    .optional(),
});

export const UpdateEventSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  timeZone: z.string().optional(),
  recurrence: z
    .union([
      z.string(),
      z.object({
        frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
        interval: z.number().int().positive().default(1),
        byDay: z.array(z.number().int().min(0).max(6)).optional(),
        byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
        byMonth: z.array(z.number().int().min(1).max(12)).optional(),
        count: z.number().int().positive().optional(),
        until: z.string().datetime().optional(),
        weekStart: z.number().int().min(0).max(6).optional(),
      }),
      z.null(),
      z.undefined(),
    ])
    .optional(),
  category: z
    .enum([
      'PERSONAL',
      'WORK',
      'MEETING',
      'APPOINTMENT',
      'REMINDER',
      'HOLIDAY',
      'BIRTHDAY',
      'TRAVEL',
      'FOCUS_TIME',
      'CUSTOM',
    ])
    .optional(),
  color: z.string().optional(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED', 'NEEDS_ACTION']).optional(),
  participants: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        status: z
          .enum(['NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'DELEGATED'])
          .default('NEEDS_ACTION'),
        role: z.enum(['REQUIRED', 'OPTIONAL', 'ORGANIZER']).default('REQUIRED'),
      })
    )
    .optional(),
});

export const MoveEventSchema = z.object({
  newStart: z.string().datetime(),
  newEnd: z.string().datetime(),
  timeZone: z.string().optional(),
});

export const ResizeEventSchema = z.object({
  newEnd: z.string().datetime(),
  timeZone: z.string().optional(),
});

export const BulkEventSchema = z.object({
  eventIds: z.array(z.string().uuid()),
  action: z.enum(['delete', 'cancel', 'confirm', 'move', 'resize']),
  newStart: z.string().datetime().optional(),
  newEnd: z.string().datetime().optional(),
  timeZone: z.string().optional(),
});

export const CalendarQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.array(z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED', 'NEEDS_ACTION'])).optional(),
  category: z
    .array(
      z.enum([
        'PERSONAL',
        'WORK',
        'MEETING',
        'APPOINTMENT',
        'REMINDER',
        'HOLIDAY',
        'BIRTHDAY',
        'TRAVEL',
        'FOCUS_TIME',
        'CUSTOM',
      ])
    )
    .optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const AvailabilityQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  workingHours: z
    .object({
      start: z.number().int().min(0).max(23),
      end: z.number().int().min(0).max(23),
      days: z.array(z.number().int().min(0).max(6)),
    })
    .optional(),
  bufferMinutes: z.number().int().nonnegative().default(15),
});

export const ViewOptionsSchema = z.object({
  timeZone: z.string().optional(),
  workingHours: z
    .object({
      start: z.number().int().min(0).max(23),
      end: z.number().int().min(0).max(23),
      days: z.array(z.number().int().min(0).max(6)),
    })
    .optional(),
  showDeclined: z.boolean().optional(),
  showTentative: z.boolean().optional(),
  showCancelled: z.boolean().optional(),
});

export type CreateEventRequest = z.infer<typeof CreateEventSchema>;
export type UpdateEventRequest = Omit<z.infer<typeof UpdateEventSchema>, 'recurrence'> & {
  recurrence?: string | RecurrenceRule | null;
};
export type MoveEventRequest = z.infer<typeof MoveEventSchema>;
export type ResizeEventRequest = z.infer<typeof ResizeEventSchema>;
export type BulkEventRequest = z.infer<typeof BulkEventSchema>;
export type CalendarQueryOptions = z.infer<typeof CalendarQuerySchema>;
export type AvailabilityQueryOptions = z.infer<typeof AvailabilityQuerySchema>;
export type ViewOptions = z.infer<typeof ViewOptionsSchema>;
