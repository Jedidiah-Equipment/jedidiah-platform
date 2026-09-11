import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Changelog } from '@pkg/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { existingBasenames, listChangelogFiles, loadChangelogs, writeChangelogFile } from './files.js';

function changelog(business: Changelog['business'], releasedAt: string): Changelog {
  return {
    business,
    releasedAt,
    sections: [{ surface: 'app', entries: [{ title: 'Something', description: 'A visible change.' }] }],
  } as Changelog;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'changelogs-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('changelog files', () => {
  it('writes each changelog under its business directory and reads both back', () => {
    writeChangelogFile(root, '2026-09-09', changelog('equipment', '2026-09-09T10:00:00.000Z'));
    writeChangelogFile(root, '2026-09-09', changelog('contracting', '2026-09-09T10:00:00.000Z'));

    expect(loadChangelogs(root).map((entry) => entry.business)).toEqual(['equipment', 'contracting']);
    expect(listChangelogFiles(root).map((file) => file.path)).toEqual([
      join(root, 'equipment', '2026-09-09.json'),
      join(root, 'contracting', '2026-09-09.json'),
    ]);
  });

  it('skips a file whose business disagrees with the directory it sits in', () => {
    mkdirSync(join(root, 'equipment'), { recursive: true });
    writeFileSync(
      join(root, 'equipment', '2026-09-09.json'),
      JSON.stringify(changelog('contracting', '2026-09-09T10:00:00.000Z')),
    );

    expect(loadChangelogs(root)).toEqual([]);
  });

  it('disambiguates same-day filenames per business', () => {
    writeChangelogFile(root, '2026-09-09', changelog('equipment', '2026-09-09T10:00:00.000Z'));

    expect(existingBasenames(root, 'equipment')).toEqual(['2026-09-09']);
    expect(existingBasenames(root, 'contracting')).toEqual([]);
  });
});
