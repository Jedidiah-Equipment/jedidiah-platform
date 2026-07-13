import { describe, expect, it, vi } from 'vitest';

import { extractJson, generateChangelog } from './generate.js';

const now = new Date('2026-07-13T09:00:00.000Z');
const sections = [{ surface: 'app', entries: [{ title: 'Faster search', description: 'Instant results.' }] }];

const deps = (raw: string) => ({ runCodex: vi.fn(async () => raw), prompt: 'PROMPT', now });

describe('extractJson', () => {
  it('returns trimmed text when there is no code fence', () => {
    expect(extractJson('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('unwraps a ```json fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('unwraps a bare ``` fence', () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe('generateChangelog', () => {
  it('passes the prompt and commit log to the model', async () => {
    const d = deps(JSON.stringify({ sections }));
    await generateChangelog('abc123 feat: thing', d);
    expect(d.runCodex).toHaveBeenCalledWith({ prompt: 'PROMPT', commitLog: 'abc123 feat: thing' });
  });

  it('validates model output and stamps the release time from the clock, not the model', async () => {
    const withBogusTime = { releasedAt: '2000-01-01T00:00:00.000Z', sections };
    const result = await generateChangelog('log', deps(JSON.stringify(withBogusTime)));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.changelog.releasedAt).toBe('2026-07-13T09:00:00.000Z');
  });

  it('accepts model output wrapped in a code fence', async () => {
    const result = await generateChangelog('log', deps(`\`\`\`json\n${JSON.stringify({ sections })}\n\`\`\``));
    expect(result.status).toBe('ok');
  });

  it('treats an empty sections array as no user-visible changes', async () => {
    const result = await generateChangelog('log', deps(JSON.stringify({ sections: [] })));
    expect(result.status).toBe('empty');
  });

  it('blocks when the model returns non-JSON', async () => {
    const result = await generateChangelog('log', deps('I could not do it, sorry.'));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.raw).toBe('I could not do it, sorry.');
  });

  it('blocks when the model omits sections', async () => {
    const result = await generateChangelog('log', deps(JSON.stringify({ notes: 'oops' })));
    expect(result.status).toBe('invalid');
  });

  it('blocks when a section has no entries', async () => {
    const bad = { sections: [{ surface: 'app', entries: [] }] };
    const result = await generateChangelog('log', deps(JSON.stringify(bad)));
    expect(result.status).toBe('invalid');
  });
});
