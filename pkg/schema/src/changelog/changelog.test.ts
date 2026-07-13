import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Changelog } from './changelog.js';

const validChangelog = {
  releasedAt: '2026-07-13T09:00:00.000Z',
  sections: [
    {
      surface: 'app',
      entries: [{ title: 'Faster job search', description: 'Search results now load instantly.' }],
    },
    {
      surface: 'lander',
      entries: [{ title: 'New pricing page', description: 'Clearer plan comparison.' }],
    },
  ],
};

describe('Changelog', () => {
  it('parses a well-formed changelog', () => {
    expect(Changelog.parse(validChangelog)).toMatchObject({ sections: [{ surface: 'app' }, { surface: 'lander' }] });
  });

  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Changelog)).not.toThrow();
  });

  it('rejects a missing releasedAt', () => {
    const { releasedAt: _releasedAt, ...withoutReleasedAt } = validChangelog;
    expect(Changelog.safeParse(withoutReleasedAt).success).toBe(false);
  });

  it('rejects an entry missing its description', () => {
    const invalid = {
      ...validChangelog,
      sections: [{ surface: 'app', entries: [{ title: 'Only a title' }] }],
    };
    expect(Changelog.safeParse(invalid).success).toBe(false);
  });

  it('rejects an unknown surface', () => {
    const invalid = {
      ...validChangelog,
      sections: [{ surface: 'api', entries: [{ title: 'x', description: 'y' }] }],
    };
    expect(Changelog.safeParse(invalid).success).toBe(false);
  });

  it('rejects a section with no entries', () => {
    const invalid = { ...validChangelog, sections: [{ surface: 'app', entries: [] }] };
    expect(Changelog.safeParse(invalid).success).toBe(false);
  });

  it('rejects a changelog with no sections', () => {
    const invalid = { ...validChangelog, sections: [] };
    expect(Changelog.safeParse(invalid).success).toBe(false);
  });

  it('rejects a duplicated surface', () => {
    const invalid = {
      ...validChangelog,
      sections: [
        { surface: 'app', entries: [{ title: 'a', description: 'b' }] },
        { surface: 'app', entries: [{ title: 'c', description: 'd' }] },
      ],
    };
    expect(Changelog.safeParse(invalid).success).toBe(false);
  });
});
