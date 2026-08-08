import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  STATUS_META,
  PRIORITY_META,
  type TaskStatus,
  type TaskPriority
} from '@/dtos/task.dto';

// The filter bar's language. The user types free text like
//   client = Brand Studio status = blocked,todo priority = urgent due = this week
// or a bare task key like `BS-12`, and this turns it into a structured filter
// object plus a list of human-readable errors.
//
// Two deliberate departures from the tech-spec sample parser:
//
//  1. It matched values with `[^\s]+`, which stops at the first space — so
//     `due = this week` parsed as `due=this` and a multi-word client name lost
//     everything after the first word. The spec's *own examples* include
//     `due = this week`, so a value here runs until the next `field =` or the
//     end of the string.
//  2. Its task-key pattern was `[A-Z]{2,5}`, but a short code may contain digits
//     (see client.dto.ts), so `A1-3` is a legal key it would have rejected.

export interface TaskFilters {
  client?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  due?: 'today' | 'this-week';
  taskKey?: string;
}

export interface ParsedQuery {
  filters: TaskFilters;
  // Surfaced inline. Errors never discard the filters that *did* parse — the
  // spec is explicit that one bad field must not clear the rest of the query.
  errors: string[];
}

export const TASK_KEY_PATTERN = /^[A-Z0-9]{2,5}-\d+$/i;

const FILTER_FIELDS = ['client', 'status', 'priority', 'due'] as const;

// Values are matched loosely: case, spaces, hyphens and underscores are all
// ignored, so `in progress`, `in-progress` and `INPROGRESS` all land on
// IN_PROGRESS. Users type what they see on screen, not the enum spelling.
function loosen(value: string): string {
  return value.replace(/[\s_-]/g, '').toUpperCase();
}

function buildLookup<T extends string>(values: readonly T[]): Map<string, T> {
  return new Map(values.map((v) => [loosen(v), v]));
}

const STATUS_LOOKUP = buildLookup(TASK_STATUSES);
const PRIORITY_LOOKUP = buildLookup(TASK_PRIORITIES);
const DUE_LOOKUP = new Map<string, 'today' | 'this-week'>([
  ['TODAY', 'today'],
  ['THISWEEK', 'this-week'],
  ['WEEK', 'this-week']
]);

// What we offer back in an error message: the labels as they appear on screen,
// not the enum spellings — the user typed what they saw, so the correction
// should look like what they saw too.
const STATUS_OPTIONS = TASK_STATUSES.map((s) => STATUS_META[s].label.toLowerCase());
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => PRIORITY_META[p].label.toLowerCase());
const DUE_OPTIONS = ['today', 'this week'];

// People write the conjunction out — "status = todo and priority = high" — and
// the spec's own model is AND-by-default, so `and` (and `&`, `+`) between filters
// is a connector, not data. Without this the word is swallowed into whatever
// value precedes it: `client = Acme and status = todo` silently filtered for a
// client named "Acme and", with no error to explain the empty result.
const CONNECTOR = String.raw`and|&|\+`;
const TRAILING_CONNECTOR = new RegExp(String.raw`[\s,]+(?:${CONNECTOR})\s*$`, 'i');
const LEADING_CONNECTOR = new RegExp(String.raw`^(?:${CONNECTOR})[\s,]+`, 'i');
const ONLY_CONNECTOR = new RegExp(String.raw`^(?:${CONNECTOR})$`, 'i');

// Only ever *trailing* (or leading) — never inside a value — so a client
// genuinely called "Smith and Sons" keeps its name.
function stripConnectors(value: string): string {
  const trimmed = value.trim();
  if (ONLY_CONNECTOR.test(trimmed)) return ''; // e.g. "and status = done"
  return trimmed.replace(LEADING_CONNECTOR, '').replace(TRAILING_CONNECTOR, '').trim();
}

// Splits `a, b and c` into values, dropping the empties a trailing separator
// leaves. Multi-value fields accept `and` as a separator too, since that is how
// the same sentence reads out loud: `status = todo and blocked`.
function splitValues(value: string): string[] {
  return value
    .split(new RegExp(String.raw`\s*,\s*|\s+(?:${CONNECTOR})\s+|\s*[&+]\s*`, 'i'))
    .map((v) => v.trim())
    .filter(Boolean);
}

// Levenshtein distance, small and iterative — enough to turn "meduim" into a
// "did you mean medium?" instead of a dead end.
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }

  return prev[b.length]!;
}

// The closest option, if it's close enough to be worth suggesting. The threshold
// scales with length so short words don't match everything.
function suggest(value: string, options: readonly string[]): string | undefined {
  const target = loosen(value);
  const limit = Math.max(1, Math.floor(target.length / 3));

  let best: { option: string; distance: number } | undefined;
  for (const option of options) {
    const distance = editDistance(target, loosen(option));
    if (distance <= limit && (!best || distance < best.distance)) {
      best = { option, distance };
    }
  }

  return best?.option;
}

// "…isn’t a valid priority — did you mean “medium”?" beats "…isn’t valid" with
// no way forward. Falls back to listing what *is* accepted.
function invalidValueError(value: string, field: string, options: readonly string[]): string {
  const hint = suggest(value, options);
  return hint
    ? `“${value}” isn’t a valid ${field} — did you mean “${hint}”?`
    : `“${value}” isn’t a valid ${field}. Try ${options.join(', ')}.`;
}

function resolveList<T extends string>(
  raw: string,
  lookup: Map<string, T>,
  field: string,
  options: readonly string[],
  errors: string[]
): T[] | undefined {
  const resolved: T[] = [];

  for (const value of splitValues(raw)) {
    const match = lookup.get(loosen(value));
    if (!match) {
      errors.push(invalidValueError(value, field, options));
      continue;
    }
    if (!resolved.includes(match)) resolved.push(match); // `status = todo,todo`
  }

  return resolved.length > 0 ? resolved : undefined;
}

export function parseFilterQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  const filters: TaskFilters = {};
  const errors: string[] = [];

  if (!trimmed) return { filters, errors };

  // A bare task key is its own kind of query — it surfaces one task, so it is
  // never combined with other filters.
  if (TASK_KEY_PATTERN.test(trimmed)) {
    return { filters: { taskKey: trimmed.toUpperCase() }, errors };
  }

  // Every `field =` in the string, with its position, so each value can run to
  // the start of the next field rather than to the next space.
  const heads = [...trimmed.matchAll(/([A-Za-z]+)\s*=\s*/g)];

  if (heads.length === 0) {
    errors.push(
      'Try a task key like BS-12, or a filter like “status = blocked”.'
    );
    return { filters, errors };
  }

  // Anything before the first `field =` is stray text the user probably meant
  // as a filter. Flag it, but keep parsing the rest. A bare connector there
  // ("and status = todo") is just phrasing, not a mistake.
  const preamble = stripConnectors(trimmed.slice(0, heads[0]!.index).trim());
  if (preamble) errors.push(`Couldn’t read “${preamble}”.`);

  heads.forEach((head, i) => {
    const field = head[1]!.toLowerCase();
    const valueStart = head.index + head[0].length;
    const valueEnd = heads[i + 1]?.index ?? trimmed.length;
    // The connector belongs to the *query*, not to this filter's value.
    const value = stripConnectors(trimmed.slice(valueStart, valueEnd).trim());

    if (!FILTER_FIELDS.includes(field as (typeof FILTER_FIELDS)[number])) {
      const hint = suggest(field, FILTER_FIELDS);
      errors.push(
        hint
          ? `Unknown filter “${field}” — did you mean “${hint}”?`
          : `Unknown filter “${field}”. Try ${FILTER_FIELDS.join(', ')}.`
      );
      return;
    }

    if (!value) {
      errors.push(`“${field}” needs a value.`);
      return;
    }

    switch (field) {
      case 'client':
        filters.client = value;
        break;
      case 'status':
        filters.status = resolveList(value, STATUS_LOOKUP, 'status', STATUS_OPTIONS, errors);
        break;
      case 'priority':
        filters.priority = resolveList(
          value,
          PRIORITY_LOOKUP,
          'priority',
          PRIORITY_OPTIONS,
          errors
        );
        break;
      case 'due': {
        const due = DUE_LOOKUP.get(loosen(value));
        if (!due) errors.push(invalidValueError(value, 'due filter', DUE_OPTIONS));
        else filters.due = due;
        break;
      }
    }
  });

  return { filters, errors };
}

// ─── The inverse: filters → query text ───────────────────────────────────────

// Dismissing a chip removes a value from the parsed filters and then rebuilds
// the query string from what's left. Going through the structured form (rather
// than splicing the user's raw text) means the bar always shows a query that
// parses back to exactly what is being applied.
export function filtersToQuery(filters: TaskFilters): string {
  if (filters.taskKey) return filters.taskKey;

  const parts: string[] = [];
  if (filters.client) parts.push(`client = ${filters.client}`);
  if (filters.status?.length) {
    parts.push(`status = ${filters.status.map((s) => loosen(s).toLowerCase()).join(',')}`);
  }
  if (filters.priority?.length) {
    parts.push(`priority = ${filters.priority.map((p) => p.toLowerCase()).join(',')}`);
  }
  if (filters.due) parts.push(`due = ${filters.due === 'this-week' ? 'this week' : 'today'}`);
  return parts.join(' ');
}

// ─── Helpers the UI needs ────────────────────────────────────────────────────

export function hasActiveFilters(filters: TaskFilters): boolean {
  return Boolean(
    filters.taskKey ||
      filters.client ||
      filters.due ||
      filters.status?.length ||
      filters.priority?.length
  );
}

// The query params the API expects. Multi-value filters travel comma-separated
// (a query string has no list type); this must mirror the API's BoardQueryDto.
export function filtersToSearchParams(filters: TaskFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.taskKey) params.taskKey = filters.taskKey;
  if (filters.client) params.client = filters.client;
  if (filters.status?.length) params.status = filters.status.join(',');
  if (filters.priority?.length) params.priority = filters.priority.join(',');
  if (filters.due) params.due = filters.due;
  return params;
}

// One dismissible chip per active filter *value*, so a two-status filter can be
// narrowed to one without retyping the query.
export interface FilterChip {
  id: string;
  label: string;
  // The filters that remain once this chip is dismissed.
  without: TaskFilters;
}

export function toChips(filters: TaskFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.taskKey) {
    chips.push({ id: 'taskKey', label: `Key: ${filters.taskKey}`, without: {} });
  }
  if (filters.client) {
    const { client: _client, ...without } = filters;
    chips.push({ id: 'client', label: `Client: ${filters.client}`, without });
  }
  for (const status of filters.status ?? []) {
    chips.push({
      id: `status:${status}`,
      label: `Status: ${STATUS_META[status].label}`,
      without: { ...filters, status: filters.status!.filter((s) => s !== status) }
    });
  }
  for (const priority of filters.priority ?? []) {
    chips.push({
      id: `priority:${priority}`,
      label: `Priority: ${PRIORITY_META[priority].label}`,
      without: { ...filters, priority: filters.priority!.filter((p) => p !== priority) }
    });
  }
  if (filters.due) {
    const { due: _due, ...without } = filters;
    chips.push({
      id: 'due',
      label: filters.due === 'today' ? 'Due: today' : 'Due: this week',
      without
    });
  }

  return chips;
}
