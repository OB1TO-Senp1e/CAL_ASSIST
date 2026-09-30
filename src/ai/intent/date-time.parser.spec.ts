import {
  isScheduleQuery,
  mergeDateTimeIntoEntities,
  parseDateTimePhrase,
  parseDurationMinutes,
  parsePriority,
  readOnlyIntentForQuery,
} from './date-time.parser';
import { classifyLocally } from './local-intent.classifier';

const reference = new Date(2026, 8, 27, 8, 0, 0);

function localDate(daysAhead: number, hour: number, minute = 0): string {
  const date = new Date(reference);
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

describe('date-time.parser', () => {
  it('parses relative date, clock time, duration, and cleans the action title', () => {
    const parsed = parseDateTimePhrase(
      'Create event team sync tomorrow at 3pm for 45 minutes',
      reference
    );

    expect(parsed.startDate).toBe(localDate(1, 15));
    expect(parsed.endDate).toBe(localDate(1, 15, 45));
    expect(parsed.durationMinutes).toBe(45);
    expect(parsed.cleanTitle).toBe('Create event team sync');
    expect(classifyLocally('Create event team sync tomorrow at 3pm for 45 minutes').title).toBe(
      'team sync'
    );
  });

  it('parses an explicit deadline and numeric priority without inventing a start date', () => {
    const parsed = parseDateTimePhrase(
      'Create task submit report due October 2, 2026 high priority',
      reference
    );

    expect(parsed.startDate).toBeUndefined();
    expect(parsed.dueDate).toBe(new Date(2026, 9, 2, 9, 0, 0).toISOString());
    expect(parsed.priority).toBe(8);
    expect(parsed.cleanTitle).toBe('Create task submit report');
    expect(
      classifyLocally('Create task submit report due October 2, 2026 high priority')
    ).toMatchObject({
      title: 'submit report',
      dueDate: parsed.dueDate,
      priority: 8,
    });
  });

  it('handles date-only mentions at the default workday start', () => {
    expect(parseDateTimePhrase('Create task write proposal tomorrow', reference).startDate).toBe(
      localDate(1, 9)
    );
  });

  it('extracts supported durations and priority language', () => {
    expect(parseDurationMinutes('for 1.5 hours')).toBe(90);
    expect(parseDurationMinutes('for 0 minutes')).toBeUndefined();
    expect(parsePriority('normal priority')).toBe(5);
    expect(parsePriority('no rush')).toBe(2);
  });

  it('routes schedule questions to read-only intents', () => {
    const prompt = 'What do I have tomorrow?';
    expect(isScheduleQuery(prompt)).toBe(true);
    expect(readOnlyIntentForQuery(prompt)).toBe('GET_RECOMMENDATIONS');
    expect(classifyLocally(prompt).type).toBe('GET_RECOMMENDATIONS');
    expect(classifyLocally('What do I have tomorrow?', reference).startDate).toBe(localDate(1, 9));
    expect(isScheduleQuery('Create a task tomorrow')).toBe(false);
    expect(classifyLocally('Cancel what I have tomorrow', reference).type).toBe('CANCEL_EVENT');
  });

  it('prefers explicit local values when merging provider entities', () => {
    const result = mergeDateTimeIntoEntities(
      { title: 'Create task write report', priority: 3 },
      'Create task write report tomorrow high priority',
      reference
    );
    expect(result.entities).toMatchObject({
      title: 'write report',
      startDate: localDate(1, 9),
      priority: 8,
    });
  });
});
