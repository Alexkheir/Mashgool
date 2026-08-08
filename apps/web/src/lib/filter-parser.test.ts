import { describe, it, expect } from 'vitest';
import {
  parseFilterQuery,
  filtersToQuery,
  filtersToSearchParams,
  hasActiveFilters,
  toChips
} from './filter-parser';

describe('parseFilterQuery — task key lookup', () => {
  it('recognises a bare key and upper-cases it', () => {
    expect(parseFilterQuery('bs-12')).toEqual({ filters: { taskKey: 'BS-12' }, errors: [] });
  });

  it('accepts a short code containing digits', () => {
    expect(parseFilterQuery('A1-3').filters.taskKey).toBe('A1-3');
  });

  it('does not treat a key as a key when it is part of a longer query', () => {
    expect(parseFilterQuery('status = todo').filters.taskKey).toBeUndefined();
  });

  it('rejects a malformed key with a helpful error rather than silence', () => {
    const { filters, errors } = parseFilterQuery('BS-');
    expect(filters).toEqual({});
    expect(errors).toHaveLength(1);
  });
});

describe('parseFilterQuery — structured fields', () => {
  it('parses a single field', () => {
    expect(parseFilterQuery('status = blocked').filters).toEqual({ status: ['BLOCKED'] });
  });

  it('combines multiple fields with AND', () => {
    const { filters, errors } = parseFilterQuery(
      'client = Brand status = todo,blocked priority = urgent'
    );
    expect(errors).toEqual([]);
    expect(filters).toEqual({
      client: 'Brand',
      status: ['TODO', 'BLOCKED'],
      priority: ['URGENT']
    });
  });

  it('keeps multi-word values intact', () => {
    // The tech-spec sample matched values with [^\s]+, which truncated both of
    // these at the first space.
    expect(parseFilterQuery('due = this week').filters.due).toBe('this-week');
    expect(parseFilterQuery('client = Brand Studio').filters.client).toBe('Brand Studio');
  });

  it('keeps a multi-word value bounded by the next field', () => {
    const { filters } = parseFilterQuery('client = Brand Studio status = done');
    expect(filters.client).toBe('Brand Studio');
    expect(filters.status).toEqual(['DONE']);
  });

  it('accepts loose spellings of a status', () => {
    for (const q of ['status = inprogress', 'status = in progress', 'status = IN-PROGRESS']) {
      expect(parseFilterQuery(q).filters.status).toEqual(['IN_PROGRESS']);
    }
  });

  it('tolerates spacing around the equals sign', () => {
    expect(parseFilterQuery('status=blocked').filters.status).toEqual(['BLOCKED']);
    expect(parseFilterQuery('status   =   blocked').filters.status).toEqual(['BLOCKED']);
  });

  it('de-duplicates repeated values', () => {
    expect(parseFilterQuery('status = todo,todo').filters.status).toEqual(['TODO']);
  });

  it('is empty for an empty query', () => {
    expect(parseFilterQuery('   ')).toEqual({ filters: {}, errors: [] });
  });
});

describe('parseFilterQuery — "and" as a connector', () => {
  it('handles a query written out in full sentences', () => {
    // Reported from real use: every value swallowed the trailing "and", so the
    // client filter silently searched for "tannourine roastry and".
    const { filters, errors } = parseFilterQuery(
      'client= tannourine roastry and status = in progress and priority = medium'
    );

    expect(errors).toEqual([]);
    expect(filters).toEqual({
      client: 'tannourine roastry',
      status: ['IN_PROGRESS'],
      priority: ['MEDIUM']
    });
  });

  it('accepts "and" between values of one field', () => {
    expect(parseFilterQuery('status = todo and blocked').filters.status).toEqual([
      'TODO',
      'BLOCKED'
    ]);
  });

  it('accepts & and + as connectors too', () => {
    expect(parseFilterQuery('status = todo & done').filters.status).toEqual(['TODO', 'DONE']);
    expect(parseFilterQuery('priority = low + high').filters.priority).toEqual(['LOW', 'HIGH']);
  });

  it('ignores a leading connector instead of calling it stray text', () => {
    expect(parseFilterQuery('and status = done').errors).toEqual([]);
  });

  it('keeps "and" when it is genuinely part of a client name', () => {
    // Only leading/trailing connectors are stripped — never one inside a value.
    expect(parseFilterQuery('client = Smith and Sons').filters.client).toBe('Smith and Sons');
  });

  it('does not mistake a status value ending in "and" for a connector-free value', () => {
    expect(parseFilterQuery('status = in progress and priority = low').filters.status).toEqual([
      'IN_PROGRESS'
    ]);
  });
});

describe('parseFilterQuery — did you mean', () => {
  it('suggests the intended priority for a typo', () => {
    const { errors } = parseFilterQuery('priority = meduim');
    expect(errors[0]).toContain('medium');
  });

  it('suggests the intended status for a typo', () => {
    const { errors } = parseFilterQuery('status = blcoked');
    expect(errors[0]).toContain('blocked');
  });

  it('suggests the intended field name for a typo', () => {
    const { errors } = parseFilterQuery('stauts = done');
    expect(errors[0]).toContain('status');
  });

  it('lists the options when nothing is close enough to suggest', () => {
    const { errors } = parseFilterQuery('priority = banana');
    expect(errors[0]).toContain('low');
    expect(errors[0]).toContain('urgent');
    expect(errors[0]).not.toContain('did you mean');
  });
});

describe('parseFilterQuery — errors', () => {
  it('reports an unknown field but keeps the valid ones', () => {
    const { filters, errors } = parseFilterQuery('colour = red status = done');
    expect(filters.status).toEqual(['DONE']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('colour');
  });

  it('reports an invalid value but keeps the valid ones', () => {
    const { filters, errors } = parseFilterQuery('status = done,nonsense');
    expect(filters.status).toEqual(['DONE']);
    expect(errors[0]).toContain('nonsense');
  });

  it('reports a field with no value', () => {
    const { errors } = parseFilterQuery('status = priority = urgent');
    expect(errors).toHaveLength(1);
    expect(parseFilterQuery('status = priority = urgent').filters.priority).toEqual(['URGENT']);
  });

  it('flags stray text before the first field', () => {
    const { filters, errors } = parseFilterQuery('gibberish status = done');
    expect(filters.status).toEqual(['DONE']);
    expect(errors[0]).toContain('gibberish');
  });

  it('explains itself when nothing parses at all', () => {
    const { errors } = parseFilterQuery('just some words');
    expect(errors).toHaveLength(1);
  });
});

describe('filtersToQuery (the inverse)', () => {
  it('round-trips a combined query', () => {
    const query = 'client = Brand Studio status = todo,blocked priority = urgent due = this week';
    const { filters } = parseFilterQuery(query);
    expect(parseFilterQuery(filtersToQuery(filters)).filters).toEqual(filters);
  });

  it('round-trips a task key', () => {
    expect(filtersToQuery({ taskKey: 'BS-12' })).toBe('BS-12');
  });

  it('is empty when there is nothing to express', () => {
    expect(filtersToQuery({})).toBe('');
  });
});

describe('filtersToSearchParams', () => {
  it('joins multi-value filters with commas', () => {
    expect(filtersToSearchParams({ status: ['TODO', 'DONE'], due: 'today' })).toEqual({
      status: 'TODO,DONE',
      due: 'today'
    });
  });

  it('omits everything unset', () => {
    expect(filtersToSearchParams({})).toEqual({});
  });
});

describe('hasActiveFilters', () => {
  it('is false for nothing set and for an emptied list', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ status: [] })).toBe(false);
  });

  it('is true for any single filter', () => {
    expect(hasActiveFilters({ taskKey: 'BS-1' })).toBe(true);
    expect(hasActiveFilters({ due: 'today' })).toBe(true);
  });
});

describe('toChips', () => {
  it('makes one chip per value, each removable on its own', () => {
    const filters = { status: ['TODO' as const, 'DONE' as const], client: 'Brand' };
    const chips = toChips(filters);

    expect(chips.map((c) => c.id)).toEqual(['client', 'status:TODO', 'status:DONE']);
    // Dismissing one status leaves the other, and the client, in place.
    expect(chips[1]!.without).toEqual({ status: ['DONE'], client: 'Brand' });
  });

  it('clears everything when a task-key chip is dismissed', () => {
    expect(toChips({ taskKey: 'BS-12' })[0]!.without).toEqual({});
  });
});
