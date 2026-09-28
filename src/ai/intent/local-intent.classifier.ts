import { IntentType } from './interfaces/intent.interface';
import { parseDateTimePhrase, readOnlyIntentForQuery } from './date-time.parser';

/**
 * Deterministic, dependency-free intent classifier.
 *
 * This is the path that actually runs locally: `.env` ships a placeholder
 * `OPENAI_API_KEY`, so `AiProviderService` throws and `IntentParserService`
 * falls back here. It is therefore the only routing most users ever see, which
 * is why the Stage 4 bugs below were user-visible rather than theoretical.
 *
 * Two defects fixed here (both live-confirmed 2026-09-27):
 *
 * 1. **The whole prompt became the title.** `classifyLocally` returned
 *    `entities: { title: text }`, so "Create task buy milk" produced a task
 *    titled `Create task buy milk`. Extraction now strips the command prefix
 *    the same way the client mock always has
 *    (`client/src/lib/mock/assistant.ts:439,457,531`).
 *
 * 2. **Substring matching + wrong priority order.** The old code tested
 *    `lower.includes('create')` then scanned entity keywords in the order
 *    event -> task -> goal, with no word boundaries. Consequences:
 *    - "Create project redesign website" matched none of event/task/goal and
 *      fell through to the `CREATE_TASK` default (there was no `CREATE_PROJECT`
 *      member to reach).
 *    - `includes('dr')` matched "address", `includes('aim')` matched "claim",
 *      `includes('call')` matched "uncalled".
 *    Entity resolution is now driven by the noun *immediately following the
 *    command verb*, which is both more accurate and free of substring noise;
 *    a word-boundary keyword scan remains only as the secondary signal.
 */
export interface LocalIntent {
  type: IntentType;
  confidence: number;
  /** Extracted human title, never the raw prompt, always schema-safe length. */
  title: string;
  originalText: string;
  constraints: string[];
  /** Minutes, when the prompt stated them ("for 90 minutes", "30m"). */
  durationMinutes?: number;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  priority?: number;
}

/** Maximum length accepted by `Create*InputSchema.title` (`.min(1).max(200)`). */
export const MAX_TITLE_LENGTH = 200;

/**
 * Entity noun -> intent. A noun found directly after the command verb is the
 * strongest available signal, so it wins over any keyword scan.
 */
const NOUN_TO_INTENT: Record<string, IntentType> = {
  goal: 'CREATE_GOAL',
  objective: 'CREATE_GOAL',
  okr: 'CREATE_GOAL',
  project: 'CREATE_PROJECT',
  initiative: 'CREATE_PROJECT',
  task: 'CREATE_TASK',
  todo: 'CREATE_TASK',
  'to-do': 'CREATE_TASK',
  reminder: 'CREATE_TASK',
  event: 'CREATE_EVENT',
  meeting: 'CREATE_EVENT',
  appointment: 'CREATE_EVENT',
};

/** Verbs whose presence means "make a thing" rather than "query the plan". */
const CREATION_VERBS = new Set([
  'create',
  'make',
  'add',
  'set up',
  'setup',
  'new',
  'remind me to',
  'remind me',
  'todo',
]);

/**
 * Verbs that mean "find a slot for existing work". When one of these governs a
 * task/goal/project noun (not a meeting), the request is a scheduling ask.
 */
const SCHEDULING_VERBS = new Set(['schedule', 'plan', 'book', 'block']);

/** Text stripped from the front of the prompt before the entity noun. */
const LEAD_FILLER =
  /^(?:please|kindly|hey|hi|ok|okay|can you|could you|would you|want to|need to|i'?d like to|i want to|i need to|let'?s)\b[,:]?\s+/i;

/** Leading command verb. `remind me to` precedes `remind me` so it wins. */
const COMMAND_VERB =
  /^(create|make|add|set up|setup|schedule|book|plan|block(?:\s+off)?|remind me to|remind me|todo|task|new)\b[,:]?\s+/i;

/** Articles/fillers that may sit between the verb and the entity noun. */
const ARTICLE =
  /^(?:a|an|the|my|our|your|his|her|their|this|that|some|any|new|quick|brief|short|personal|work)\b[,:]?\s+/i;

/** Entity noun, optionally followed by a linking word ("called", "for", ...). */
const ENTITY_NOUN =
  /^(goals?|objectives?|okrs?|projects?|initiatives?|to-?dos?|tasks?|events?|meetings?|appointments?|reminders?)\b[,:]?\s*(?:called|titled|named|entitled|for|to|that|which|is|as|:)?\s*/i;

const DURATION = /(\d+(?:\.\d+)?)\s*(minutes?|mins?|m\b|hours?|hrs?|h\b)/i;

/** Collapse internal whitespace so titles are stable for comparison/assertion. */
function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Word-boundary keyword scan used when no verb+noun pair was found. */
function matches(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

/**
 * Classifies a prompt without any LLM or database access.
 *
 * Order matters:
 *  1. verb + noun ("create project x") — unambiguous, wins outright.
 *  2. bare "remind me to ...".
 *  3. destructive verbs, before anything could re-route them.
 *  4. reschedule/move.
 *  5. read-only queries. Conflicts are tested before availability: "check for
 *     conflicts in my availability" is a conflict question, not a slot search.
 *  6. remaining creation verbs, resolved by first entity keyword found.
 *  7. scheduling language ("plan my day", "block time for study").
 *  8. recommendations / prioritisation.
 *  9. default to a task at reduced confidence, so the thread still proposes
 *     something actionable instead of 500-ing.
 */
export function classifyLocally(text: string, reference: Date = new Date()): LocalIntent {
  const originalText = String(text ?? '');
  const lower = originalText.toLowerCase().trim();

  const extraction = extractTitle(originalText);
  const { noun, verb } = extraction;
  const parsed = parseDateTimePhrase(originalText, reference);
  const durationMinutes = parsed.durationMinutes;

  // Title: everything the strip did not consume, with any stated duration
  // removed (it belongs in `durationMinutes`, not the name) and capped to the
  // tool schema's max length so `validateAndPrepareActions` cannot silently
  // discard the action on a `.max(200)` parse failure.
  let title = extractTitle(parsed.cleanTitle).title || extraction.title;
  if (durationMinutes) title = squash(title.replace(DURATION, '')).replace(/[,(]\s*$/, '');
  title = squash(title.replace(/\s+(?:for|in|of|lasting|approx(?:imately)?)$/i, ''));
  if (!title) title = squash(originalText) || 'Untitled';
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH).trim();
  }

  const build = (type: IntentType, confidence: number): LocalIntent => ({
    type,
    confidence,
    title,
    originalText,
    constraints: [],
    ...(durationMinutes ? { durationMinutes } : {}),
    ...(parsed.startDate ? { startDate: parsed.startDate } : {}),
    ...(parsed.endDate ? { endDate: parsed.endDate } : {}),
    ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
    ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
  });

  if (parsed.isQuery) {
    return build(readOnlyIntentForQuery(originalText), 0.9);
  }

  // 1. An entity noun sitting directly after the command verb.
  if (noun && NOUN_TO_INTENT[noun]) {
    const nounIntent = NOUN_TO_INTENT[noun];
    const schedulingVerb = !!verb && SCHEDULING_VERBS.has(verb);
    // "schedule the task" / "block a project" ask for time, not creation.
    // "book a meeting" / "plan an event" are still calendar writes.
    if (schedulingVerb && nounIntent !== 'CREATE_EVENT') {
      return build('SCHEDULE_TASK', 0.88);
    }
    return build(nounIntent, 0.92);
  }

  // 2. "remind me to call mum" has no noun but is always a task.
  if (verb && /remind/.test(verb)) return build('CREATE_TASK', 0.85);

  // 3. Destructive.
  if (matches(lower, /\b(cancel|cancels|cancelled|delete|deletes|deleted|remove|removes|drop)\b/)) {
    return build('CANCEL_EVENT', 0.85);
  }

  // 4. Movement.
  if (matches(lower, /\b(reschedul\w*|postpon\w*|move|moves|shift|push|slide)\b/)) {
    return build('RESCHEDULE_EVENT', 0.85);
  }

  // 5. Read-only queries.
  if (matches(lower, /\b(conflict\w*|double-?book\w*|overlap\w*)\b/)) {
    return build('CHECK_CONFLICTS', 0.9);
  }
  if (
    matches(
      lower,
      /\b(available|availability|free|open|opening|openings|slot|slots|when|whens|find time|make time)\b/
    )
  ) {
    return build('QUERY_AVAILABILITY', 0.88);
  }

  // 6. Creation verb without an adjacent noun — resolve on first entity keyword.
  if (verb && CREATION_VERBS.has(verb)) {
    if (matches(lower, /\b(project|initiative)\b/)) return build('CREATE_PROJECT', 0.86);
    if (matches(lower, /\b(goal|objective|okr)\b/)) return build('CREATE_GOAL', 0.86);
    if (
      matches(
        lower,
        /\b(event|meeting|appointment|lunch|dinner|coffee|call|sync|workshop|webinar)\b/
      )
    ) {
      return build('CREATE_EVENT', 0.86);
    }
    return build('CREATE_TASK', 0.8);
  }

  // 7. Scheduling language with no creation verb.
  if (
    matches(lower, /\b(schedule|scheduling|plan|planning|block|fit|slot)\b/) &&
    matches(lower, /\b(day|week|month|time|today|tomorrow|for)\b/)
  ) {
    return build('SCHEDULE_TASK', 0.8);
  }

  // 8. Recommendations / prioritisation.
  if (matches(lower, /\b(recommend\w*|suggest\w*|prioriti[sz]\w*|best|should)\b/)) {
    return build('GET_RECOMMENDATIONS', 0.7);
  }

  // 9. Default: treat as a task, at low confidence so the UI can surface doubt.
  return build('CREATE_TASK', 0.5);
}

/** "tasks"/"to-dos" -> "task"/"to-do" so one noun map covers plurals. */
function singular(noun: string): string {
  const lowered = noun.toLowerCase();
  if (lowered === 'to-do' || lowered === 'to-dos') return 'to-do';
  return lowered.replace(/s$/, '');
}

/**
 * Pulls `for 90 minutes` / `45 mins` / `1.5 hours` out of the prompt.
 * Returns undefined when no duration is stated so tool defaults still apply.
 */
export function extractDurationMinutes(text: string): number | undefined {
  const match = DURATION.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = match[2].toLowerCase();
  const minutes = /h/.test(unit) ? value * 60 : value;
  const rounded = Math.round(minutes);
  return rounded > 0 ? Math.min(rounded, 24 * 60) : undefined;
}

export interface TitleExtraction {
  title: string;
  /** Entity noun consumed while stripping, if one was present. */
  noun?: string;
  /** Command verb consumed while stripping, if one was present. */
  verb?: string;
}

/**
 * Removes politeness, the command verb, articles and the entity noun from the
 * front of a prompt, returning what is left as the title.
 *
 * Exported on its own so `IntentParserService` can reuse it to clean up titles
 * coming back from an LLM, which sometimes echo the whole request.
 */
export function extractTitle(text: string): TitleExtraction {
  let rest = squash(text);
  let noun: string | undefined;
  let verb: string | undefined;

  // Politeness/filler can stack ("please can you create ..."), so loop a few times.
  for (let i = 0; i < 3; i += 1) {
    const stripped = squash(rest.replace(LEAD_FILLER, ''));
    if (stripped === rest) break;
    rest = stripped;
  }

  const verbMatch = COMMAND_VERB.exec(rest);
  if (verbMatch) {
    verb = verbMatch[1].toLowerCase();
    rest = squash(rest.slice(verbMatch[0].length));
  }

  // Articles can stack too ("add a new task ...").
  for (let i = 0; i < 3; i += 1) {
    const stripped = squash(rest.replace(ARTICLE, ''));
    if (stripped === rest) break;
    rest = stripped;
  }

  const nounMatch = ENTITY_NOUN.exec(rest);
  if (nounMatch) {
    noun = singular(nounMatch[1]);
    rest = squash(rest.slice(nounMatch[0].length));
  }

  return { title: squash(rest), noun, verb };
}
