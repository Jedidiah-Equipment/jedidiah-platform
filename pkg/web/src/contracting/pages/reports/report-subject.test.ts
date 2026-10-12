import { expect, test } from 'vitest';
import { formatReportSubject, parseReportSubject } from './report-subject.js';

const id = '9bd0c2cb-d97f-4b34-beba-c03e5541c96d';

test('round-trips a Category or Machine subject and reads anything else as the fleet', () => {
  for (const subject of [
    { kind: 'category', id },
    { kind: 'machine', id },
  ] as const)
    expect(parseReportSubject(formatReportSubject(subject))).toEqual(subject);
  expect(formatReportSubject({ kind: 'fleet' })).toBeUndefined();
  for (const value of [undefined, '', 'fleet', `job:${id}`, 'machine:not-a-uuid'])
    expect(parseReportSubject(value)).toEqual({ kind: 'fleet' });
});
