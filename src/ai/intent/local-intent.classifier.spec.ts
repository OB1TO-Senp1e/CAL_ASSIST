import {
  classifyLocally,
  extractDurationMinutes,
  extractTitle,
  MAX_TITLE_LENGTH,
} from './local-intent.classifier';
import { INTENT_TYPES } from './interfaces/intent.interface';

/**
 * Stage 4 — intent routing and title extraction.
 *
 * Every case below encodes behaviour that was live-broken before this unit:
 * the whole prompt became the entity title, and "Create project ..." misrouted
 * to CREATE_TASK because no CREATE_PROJECT member existed.
 */
const TITLE_CASES: Array<[string, string]> = [
  ['Create task buy milk', 'buy milk'],
  ['Create goal learn spanish', 'learn spanish'],
  ['Create event design review', 'design review'],
  ['Create project redesign website', 'redesign website'],
  ['add a task book flights', 'book flights'],
  ['Please create the task submit expense report', 'submit expense report'],
  ['remind me to call the dentist', 'call the dentist'],
  ['Set up a goal run a marathon', 'run a marathon'],
  ['Create an event called Team Offsite', 'Team Offsite'],
];

describe('local-intent.classifier', () => {
  describe('INTENT_TYPES', () => {
    it('includes CREATE_PROJECT so the registered create_project tool is reachable', () => {
      expect(INTENT_TYPES).toContain('CREATE_PROJECT');
    });

    it('keeps the nine original members alongside the new one', () => {
      expect(INTENT_TYPES).toHaveLength(10);
      for (const legacy of [
        'CREATE_GOAL',
        'CREATE_TASK',
        'CREATE_EVENT',
        'SCHEDULE_TASK',
        'RESCHEDULE_EVENT',
        'CANCEL_EVENT',
        'QUERY_AVAILABILITY',
        'CHECK_CONFLICTS',
        'GET_RECOMMENDATIONS',
      ]) {
        expect(INTENT_TYPES).toContain(legacy);
      }
    });
  });

  describe('title extraction (bug: whole prompt became the title)', () => {
    it.each(TITLE_CASES)('strips the command prefix from %j', (input, expected) => {
      expect(classifyLocally(input).title).toBe(expected);
    });

    it('never returns the raw prompt as the title', () => {
      for (const [input] of TITLE_CASES) {
        expect(classifyLocally(input).title).not.toBe(input);
      }
    });

    it('caps the title at the tool schema limit so actions are not silently dropped', () => {
      const long = `Create task ${'a'.repeat(400)}`;
      const result = classifyLocally(long);
      expect(result.title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
      expect(result.title.length).toBeGreaterThan(0);
    });

    it('keeps a usable title when the prompt is only a command', () => {
      expect(classifyLocally('Create task').title.length).toBeGreaterThan(0);
    });

    it('does not treat the entity noun as the title', () => {
      expect(classifyLocally('Create task buy milk').title).not.toMatch(/^task/i);
    });
  });

  describe('routing (bug: substring matching, no project intent)', () => {
    it('routes project prompts to CREATE_PROJECT, not CREATE_TASK', () => {
      expect(classifyLocally('Create project redesign website').type).toBe('CREATE_PROJECT');
      expect(classifyLocally('add a new initiative for onboarding').type).toBe('CREATE_PROJECT');
    });

    it('routes the four creation intents correctly', () => {
      expect(classifyLocally('Create task buy milk').type).toBe('CREATE_TASK');
      expect(classifyLocally('Create goal learn spanish').type).toBe('CREATE_GOAL');
      expect(classifyLocally('Create event design review').type).toBe('CREATE_EVENT');
      expect(classifyLocally('Create project redesign website').type).toBe('CREATE_PROJECT');
    });

    it('routes query intents without a command verb', () => {
      expect(classifyLocally('When am I free tomorrow?').type).toBe('QUERY_AVAILABILITY');
      expect(classifyLocally('check for conflicts on friday').type).toBe('CHECK_CONFLICTS');
      expect(classifyLocally('cancel my 3pm meeting').type).toBe('CANCEL_EVENT');
      expect(classifyLocally('reschedule standup to Thursday').type).toBe('RESCHEDULE_EVENT');
      expect(classifyLocally('what should I prioritise today').type).toBe('GET_RECOMMENDATIONS');
    });

    it('treats scheduling verbs as a schedule request, not a creation', () => {
      expect(classifyLocally('schedule the task for tomorrow').type).toBe('SCHEDULE_TASK');
      expect(classifyLocally('plan my day').type).toBe('SCHEDULE_TASK');
    });

    it('still creates calendar events for book/plan + a calendar noun', () => {
      expect(classifyLocally('book a meeting with sam').type).toBe('CREATE_EVENT');
      expect(classifyLocally('plan an event for the launch').type).toBe('CREATE_EVENT');
    });

    it('does not misfire on substring noise (old includes("dr") / "aim")', () => {
      // "address" contained "dr" and "claim" contained "aim", so both of these
      // used to resolve to CREATE_EVENT / CREATE_GOAL.
      expect(classifyLocally('Create task draft the address').type).toBe('CREATE_TASK');
      expect(classifyLocally('Create task dispute the claim').type).toBe('CREATE_TASK');
    });

    it('is conflict-first when a prompt mentions conflicts and availability', () => {
      expect(classifyLocally('check for conflicts in my availability').type).toBe(
        'CHECK_CONFLICTS',
      );
    });

    it('defaults an ambiguous prompt to a low-confidence task', () => {
      const result = classifyLocally('milk');
      expect(result.type).toBe('CREATE_TASK');
      expect(result.confidence).toBeLessThan(0.6);
    });

    it('reports high confidence for explicit commands', () => {
      expect(classifyLocally('Create project redesign website').confidence).toBeGreaterThanOrEqual(
        0.9,
      );
    });
  });

  describe('duration extraction', () => {
    it('parses minutes and hours', () => {
      expect(extractDurationMinutes('write the report for 90 minutes')).toBe(90);
      expect(extractDurationMinutes('review PRs 45 mins')).toBe(45);
      expect(extractDurationMinutes('deep work 1.5 hours')).toBe(90);
    });

    it('returns undefined when no duration is stated', () => {
      expect(extractDurationMinutes('buy milk')).toBeUndefined();
    });

    it('surfaces duration on the intent and keeps it out of the title', () => {
      const result = classifyLocally('Create task write report for 90 minutes');
      expect(result.durationMinutes).toBe(90);
      expect(result.title).toBe('write report');
    });
  });

  describe('extractTitle contract', () => {
    it('reports the verb and noun it consumed', () => {
      const extraction = extractTitle('Create project redesign website');
      expect(extraction.verb).toBe('create');
      expect(extraction.noun).toBe('project');
      expect(extraction.title).toBe('redesign website');
    });

    it('handles plural nouns', () => {
      expect(extractTitle('Add tasks pay rent').noun).toBe('task');
      expect(extractTitle('Add projects warehouse migration').noun).toBe('project');
    });

    it('returns the input untouched when there is no command prefix', () => {
      const extraction = extractTitle('pay the electricity bill');
      expect(extraction.verb).toBeUndefined();
      expect(extraction.noun).toBeUndefined();
      expect(extraction.title).toBe('pay the electricity bill');
    });

    it('normalises whitespace', () => {
      expect(extractTitle('Create   task    buy    milk').title).toBe('buy milk');
    });

    it('tolerates empty and non-string input', () => {
      expect(classifyLocally('').title).toBe('Untitled');
      expect(classifyLocally(undefined as unknown as string).title).toBe('Untitled');
    });
  });
});
