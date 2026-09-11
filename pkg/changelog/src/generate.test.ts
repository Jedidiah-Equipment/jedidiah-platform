import { describe, expect, it, vi } from 'vitest';

import { extractJson, generateChangelogs } from './generate.js';

const now = new Date('2026-07-13T09:00:00.000Z');
const entry = (title: string) => ({ title, description: `${title} described.` });
const app = (...titles: string[]) => ({ surface: 'app', entries: titles.map(entry) });
const mobile = (...titles: string[]) => ({ surface: 'mobile', entries: titles.map(entry) });
const lander = (...titles: string[]) => ({ surface: 'lander', entries: titles.map(entry) });

const deps = (raw: string) => ({ runAgent: vi.fn(async () => raw), prompt: 'PROMPT', now });
const output = (value: unknown) => deps(JSON.stringify(value));

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

describe('generateChangelogs', () => {
  it('writes one changelog per business, each stamped with the release clock', async () => {
    const result = await generateChangelogs(
      'log',
      output({
        equipment: { sections: [app('Faster search')] },
        contracting: { sections: [mobile('Capture hours')] },
        shared: { sections: [] },
      }),
    );

    expect(result).toEqual({
      status: 'ok',
      changelogs: [
        { business: 'equipment', releasedAt: '2026-07-13T09:00:00.000Z', sections: [app('Faster search')] },
        { business: 'contracting', releasedAt: '2026-07-13T09:00:00.000Z', sections: [mobile('Capture hours')] },
      ],
    });
  });

  it('fans shared sections into both businesses, merged by surface after the business entries', async () => {
    const result = await generateChangelogs(
      'log',
      output({
        equipment: { sections: [app('Faster search')] },
        contracting: { sections: [] },
        shared: { sections: [app('Filter users by business'), mobile('Reset your password')] },
      }),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.changelogs.map((changelog) => [changelog.business, changelog.sections])).toEqual([
      ['equipment', [app('Faster search', 'Filter users by business'), mobile('Reset your password')]],
      ['contracting', [app('Filter users by business'), mobile('Reset your password')]],
    ]);
  });

  it('omits a business whose merged sections are empty', async () => {
    const result = await generateChangelogs('log', output({ equipment: { sections: [app('Only here')] } }));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.changelogs.map((changelog) => changelog.business)).toEqual(['equipment']);
  });

  it('treats all-empty output as no user-visible changes', async () => {
    const result = await generateChangelogs(
      'log',
      output({ equipment: { sections: [] }, contracting: { sections: [] }, shared: { sections: [] } }),
    );
    expect(result.status).toBe('empty');
  });

  it('ignores a releasedAt the model emits', async () => {
    const result = await generateChangelogs(
      'log',
      output({ releasedAt: '2000-01-01T00:00:00.000Z', equipment: { sections: [app('x')] } }),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.changelogs[0]?.releasedAt).toBe('2026-07-13T09:00:00.000Z');
  });

  it('accepts model output wrapped in a code fence', async () => {
    const raw = `\`\`\`json\n${JSON.stringify({ equipment: { sections: [app('x')] } })}\n\`\`\``;
    expect((await generateChangelogs('log', deps(raw))).status).toBe('ok');
  });

  it('blocks when the model returns non-JSON', async () => {
    const result = await generateChangelogs('log', deps('I could not do it, sorry.'));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.raw).toBe('I could not do it, sorry.');
  });

  it('blocks when the model emits none of the three keys', async () => {
    expect((await generateChangelogs('log', output({ sections: [app('x')] }))).status).toBe('invalid');
  });

  it('blocks, rather than reads as empty, a present key whose sections are not an array', async () => {
    const result = await generateChangelogs(
      'log',
      output({ equipment: { sections: 'oops' }, contracting: { sections: [] } }),
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.errors[0]).toContain('equipment.sections');
  });

  it('blocks a lander section under shared or contracting', async () => {
    const shared = await generateChangelogs('log', output({ shared: { sections: [lander('New pricing page')] } }));
    expect(shared.status).toBe('invalid');
    if (shared.status === 'invalid') expect(shared.errors[0]).toContain('shared');

    const contracting = await generateChangelogs('log', output({ contracting: { sections: [lander('x')] } }));
    expect(contracting.status).toBe('invalid');
  });

  it('blocks when a section has no entries', async () => {
    const result = await generateChangelogs(
      'log',
      output({ equipment: { sections: [{ surface: 'app', entries: [] }] } }),
    );
    expect(result.status).toBe('invalid');
  });
});
