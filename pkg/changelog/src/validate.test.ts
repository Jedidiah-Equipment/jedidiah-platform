import { describe, expect, it } from 'vitest';

import { validateChangelog, validateChangelogJson } from './validate.js';

const valid = {
  releasedAt: '2026-07-13T09:00:00.000Z',
  sections: [{ surface: 'app', entries: [{ title: 'x', description: 'y' }] }],
};

describe('validateChangelog', () => {
  it('accepts a well-formed changelog', () => {
    const result = validateChangelog(valid);
    expect(result.ok).toBe(true);
  });

  it('reports field paths for an invalid changelog', () => {
    const result = validateChangelog({ ...valid, sections: [{ surface: 'unknown', entries: [] }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('validateChangelogJson', () => {
  it('accepts a well-formed JSON string', () => {
    expect(validateChangelogJson(JSON.stringify(valid)).ok).toBe(true);
  });

  it('fails, rather than throws, on non-JSON input', () => {
    const result = validateChangelogJson('not json {');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('not valid JSON');
  });

  it('fails on JSON that violates the schema', () => {
    expect(validateChangelogJson(JSON.stringify({ sections: [] })).ok).toBe(false);
  });
});
