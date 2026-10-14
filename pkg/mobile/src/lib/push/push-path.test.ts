import { expect, test } from 'vitest';
import { pushTargetFromData } from './push-path';

test('follows only a path inside one of the businesses', () => {
  expect(pushTargetFromData({ path: '/contracting/workshop/b1' })).toEqual({
    href: '/contracting/workshop/b1',
    pathname: '/contracting/workshop/b1',
  });
  expect(pushTargetFromData({ path: '/equipment/jobs/j1' })).toEqual({
    href: '/equipment/jobs/j1',
    pathname: '/equipment/jobs/j1',
  });
  expect(pushTargetFromData({ path: 'https://evil.example/contracting/x' })).toBeNull();
  expect(pushTargetFromData({ path: '//evil.example/contracting/x' })).toBeNull();
  expect(pushTargetFromData({ path: '/login' })).toBeNull();
  expect(pushTargetFromData({ path: 42 })).toBeNull();
  expect(pushTargetFromData(null)).toBeNull();
});

test('keeps the query in the path to open but not in the pathname it arrives at', () => {
  expect(pushTargetFromData({ path: '/contracting/jobs/j1?tab=activity' })).toEqual({
    href: '/contracting/jobs/j1?tab=activity',
    pathname: '/contracting/jobs/j1',
  });
});
