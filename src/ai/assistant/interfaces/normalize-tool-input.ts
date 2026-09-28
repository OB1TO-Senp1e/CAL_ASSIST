/**
 * Coerces loosely-shaped LLM tool arguments into the exact shape each tool's
 * zod input schema demands.
 *
 * Why this exists (live-confirmed 2026-09-27): the orchestrator asks the model
 * for `{ toolName, input }` objects but never told it the real field names, and
 * it fed the raw object to `tool.inputSchema.safeParse` in
 * `validateAndPrepareActions`. `gpt-oss:20b` answered a "create task" request
 * with:
 *
 *   { title, description: "", startDate, endDate, durationMinutes: 45,
 *     priority: 0, dueDate: "" }
 *
 * which violates `CreateTaskInputSchema` twice:
 *   - `estimatedDurationMinutes` is required and the model said `durationMinutes`
 *   - `dueDate` must be an ISO datetime but the model sent `""`
 * `safeParse` therefore failed, the proposal was silently skipped, and the user
 * got "Executed 0 action(s): 0 succeeded" instead of a confirmation card.
 *
 * The function is intentionally pure and schema-agnostic apart from the field
 * name tables below, so it can be unit tested without Nest, Prisma or an LLM.
 */

/** Fields typed as `z.string().datetime()` across the registered tool schemas. */
const DATETIME_KEYS = new Set([
  'startDate',
  'endDate',
  'dueDate',
  'targetDate',
  'completedAt',
  'preferredTime',
  'newStartDate',
  'newEndDate',
  'start',
  'end',
]);

/** Integer fields, with the bounds declared by the tool schemas. */
const INTEGER_KEYS: Record<string, { min: number; max?: number }> = {
  priority: { min: 0, max: 10 },
  estimatedDurationMinutes: { min: 1 },
  actualDurationMinutes: { min: 0 },
  durationMinutes: { min: 1 },
  bufferMinutes: { min: 0 },
};

/** String fields that the schemas constrain to `z.enum([...])` of UPPER_CASE. */
const ENUM_KEYS = new Set([
  'status',
  'flexibility',
  'energyRequirement',
  'category',
  'taskOrderingStrategy',
]);

/**
 * The model consistently emits `durationMinutes` (the wording used by the
 * intent parser and by `find_availability`), but `create_task`/`update_task`
 * name the same concept `estimatedDurationMinutes`.
 */
const DURATION_ALIAS_KEYS = new Set(['create_task', 'update_task']);

const MAX_TITLE_LENGTH = 200;

function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Returns an ISO-8601 UTC string, or `undefined` when the value is unusable. */
function toIsoDateTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function toBoundedInt(value: unknown, bounds: { min: number; max?: number }): number | undefined {
  let numeric: number;
  if (typeof value === 'number') numeric = value;
  else if (typeof value === 'string' && value.trim() !== '') numeric = Number(value);
  else return undefined;
  if (!Number.isFinite(numeric)) return undefined;
  const rounded = Math.trunc(numeric);
  if (rounded < bounds.min) return undefined;
  if (bounds.max !== undefined && rounded > bounds.max) return undefined;
  return rounded;
}

/**
 * Normalises one tool call's `input` object.
 *
 * Guarantees for the caller:
 *  - blank-string optional fields (`dueDate: ""`, `description: ""`) are removed
 *    rather than being handed to a `.datetime()` validator;
 *  - datetime strings become `Z`-suffixed ISO values, accepting offsets and
 *    date-only input the model may return;
 *  - integer fields accept numeric strings and stay inside schema bounds;
 *  - enum fields are upper-cased;
 *  - `durationMinutes` becomes `estimatedDurationMinutes` for task tools;
 *  - `title` is trimmed/squashed and truncated to the 200-character schema cap.
 *
 * Fields that cannot be salvaged are deleted so a single bad optional value
 * cannot sink an otherwise valid proposal.
 */
export function normalizeToolInput(toolName: string, input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const source = input as Record<string, unknown>;
  const result: Record<string, any> = {};

  if (DURATION_ALIAS_KEYS.has(toolName)) {
    const duration = toBoundedInt(source.durationMinutes, INTEGER_KEYS.durationMinutes);
    if (duration !== undefined && source.estimatedDurationMinutes === undefined) {
      result.estimatedDurationMinutes = duration;
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (DURATION_ALIAS_KEYS.has(toolName) && key === 'durationMinutes') continue;

    if (key === 'title') {
      if (typeof value !== 'string') continue;
      const title = squash(value).slice(0, MAX_TITLE_LENGTH);
      if (!title) continue;
      result.title = title;
      continue;
    }

    if (key === 'timeRange' && value && typeof value === 'object') {
      const range = value as Record<string, unknown>;
      const start = toIsoDateTime(range.start);
      const end = toIsoDateTime(range.end);
      if (start && end) result.timeRange = { start, end };
      continue;
    }

    if (DATETIME_KEYS.has(key)) {
      // An empty string is the model's "no value", so it must not reach a
      // `.datetime()` validator — it has to disappear instead.
      const iso = toIsoDateTime(value);
      if (iso) result[key] = iso;
      continue;
    }

    if (INTEGER_KEYS[key]) {
      const numeric = toBoundedInt(value, INTEGER_KEYS[key]);
      if (numeric !== undefined) result[key] = numeric;
      continue;
    }

    if (ENUM_KEYS.has(key)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      result[key] = value.trim().toUpperCase();
      continue;
    }

    if (typeof value === 'string') {
      // Drop blank strings for every remaining optional string field.
      const trimmed = value.trim();
      if (!trimmed) continue;
      result[key] = trimmed;
      continue;
    }

    result[key] = value;
  }

  return result;
}

/** The 60-minute default already used by `mapIntentToActionsLocally`. */
export const DEFAULT_TASK_DURATION_MINUTES = 60;

/**
 * `create_task`/`update_task` treat the duration as required, so a proposal
 * missing it would still be dropped after normalisation. Mirrors the local
 * mapper's fallback instead of losing the user's request.
 */
export function applyRequiredDurationDefault(
  toolName: string,
  input: Record<string, any>
): Record<string, any> {
  if (!DURATION_ALIAS_KEYS.has(toolName)) return input;
  if (input.estimatedDurationMinutes !== undefined) return input;
  return { ...input, estimatedDurationMinutes: DEFAULT_TASK_DURATION_MINUTES };
}

/**
 * Renders the exact top-level keys a tool accepts (with `?` for optional ones)
 * so the orchestrator prompt can name them.
 *
 * The original prompt listed only `name`/`description`/`category`/
 * `confirmationLevel` and said `"input": { ... }`, which is why the model had to
 * guess and produced `durationMinutes`/`endDate` for `create_task`.
 *
 * Defensive by design: tool schemas are non-zod objects in unit tests
 * (`getTool` is stubbed), so anything unexpected degrades to `{}` rather than
 * throwing during prompt construction.
 */
export function describeToolInputSchema(schema: unknown): string {
  const shape = (schema as { shape?: Record<string, unknown> } | undefined)?.shape;
  if (!shape || typeof shape !== 'object') return '{}';

  return Object.entries(shape)
    .map(([key, field]: [string, any]) => {
      const optional = typeof field?.isOptional === 'function' ? field.isOptional() : false;
      return optional ? `${key}?` : key;
    })
    .join(', ');
}