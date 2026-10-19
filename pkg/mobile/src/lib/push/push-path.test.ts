import { expect, test } from 'vitest';
import { pushTargetFromData } from './push-path';

const data = (path: string, business: 'contracting' | 'equipment' = 'contracting') => ({
  business,
  kind: 'breakdown',
  id: 'b1',
  path,
});

test('follows only well-formed push data whose path is inside its business', () => {
  expect(pushTargetFromData(data('/contracting/workshop/b1'))).toEqual({
    href: '/contracting/workshop/b1',
    pathname: '/contracting/workshop/b1',
    kind: 'breakdown',
  });
  expect(pushTargetFromData({ ...data('/equipment/jobs/j1', 'equipment'), kind: 'job' })).toMatchObject({
    href: '/equipment/jobs/j1',
    kind: 'job',
  });
  expect(pushTargetFromData(data('https://evil.example/contracting/x'))).toBeNull();
  expect(pushTargetFromData(data('//evil.example/contracting/x'))).toBeNull();
  expect(pushTargetFromData(data('/contracting//x'))).toBeNull();
  expect(pushTargetFromData(data('/contracting/'))).toBeNull();
  expect(pushTargetFromData(data('/login'))).toBeNull();
  // A path inside the other business is not this push's to open.
  expect(pushTargetFromData(data('/equipment/jobs/j1'))).toBeNull();
  expect(pushTargetFromData({ ...data('/contracting/workshop/b1'), kind: 'invoice' })).toBeNull();
  expect(pushTargetFromData({ path: '/contracting/workshop/b1' })).toBeNull();
  expect(pushTargetFromData({ ...data('/contracting/workshop/b1'), path: 42 })).toBeNull();
  expect(pushTargetFromData(null)).toBeNull();
});

test('keeps the query in the path to open but not in the pathname it arrives at', () => {
  expect(pushTargetFromData({ ...data('/contracting/jobs/j1?tab=activity'), kind: 'job', id: 'j1' })).toEqual({
    href: '/contracting/jobs/j1?tab=activity',
    pathname: '/contracting/jobs/j1',
    kind: 'job',
  });
});
