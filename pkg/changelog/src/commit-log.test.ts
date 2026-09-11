import { describe, expect, it } from 'vitest';

import { formatReleaseCommitLog, parseNameOnlyLog, RECORD_SEPARATOR, UNIT_SEPARATOR } from './commit-log.js';

const record = (hash: string, subject: string, body: string, paths: string[]) =>
  `${RECORD_SEPARATOR}${hash}${UNIT_SEPARATOR}${subject}${UNIT_SEPARATOR}${body}${UNIT_SEPARATOR}\n${paths.join('\n')}\n`;

describe('parseNameOnlyLog', () => {
  it('splits git name-only output into commits with their touched paths', () => {
    const stdout =
      record('abc1234', 'feat(fleet): add drivers', 'Body line one.\n\nSecond paragraph.\n', [
        'pkg/core/src/contracting/fleet/fleet-service.ts',
      ]) + record('def5678', 'chore: bump deps', '', ['package.json', 'pnpm-lock.yaml']);

    expect(parseNameOnlyLog(stdout)).toEqual([
      {
        hash: 'abc1234',
        subject: 'feat(fleet): add drivers',
        body: 'Body line one.\n\nSecond paragraph.',
        paths: ['pkg/core/src/contracting/fleet/fleet-service.ts'],
      },
      { hash: 'def5678', subject: 'chore: bump deps', body: '', paths: ['package.json', 'pnpm-lock.yaml'] },
    ]);
  });

  it('returns no commits for empty output', () => {
    expect(parseNameOnlyLog('')).toEqual([]);
  });
});

describe('formatReleaseCommitLog', () => {
  it('writes one hinted subject line per commit with the body indented beneath', () => {
    const log = formatReleaseCommitLog([
      {
        hash: 'abc1234',
        subject: 'feat(fleet): add drivers',
        body: 'Drivers can be assigned.',
        paths: ['pkg/core/src/contracting/fleet/fleet-service.ts', 'pkg/api/src/trpc/init.ts'],
      },
      { hash: 'def5678', subject: 'docs: tidy', body: '', paths: ['README.md'] },
    ]);

    expect(log).toBe(
      [
        'abc1234 feat(fleet): add drivers [touches: contracting, shared]',
        '    Drivers can be assigned.',
        'def5678 docs: tidy [touches: none]',
      ].join('\n'),
    );
  });
});
