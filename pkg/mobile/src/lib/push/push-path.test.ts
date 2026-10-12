import { expect, test } from 'vitest';
import { pushPathFromData } from './push-path';

test('follows only a path inside one of the businesses', () => {
  expect(pushPathFromData({ path: '/contracting/workshop/b1' })).toBe('/contracting/workshop/b1');
  expect(pushPathFromData({ path: '/equipment/jobs/j1' })).toBe('/equipment/jobs/j1');
  expect(pushPathFromData({ path: 'https://evil.example/contracting/x' })).toBeNull();
  expect(pushPathFromData({ path: '//evil.example/contracting/x' })).toBeNull();
  expect(pushPathFromData({ path: '/login' })).toBeNull();
  expect(pushPathFromData({ path: 42 })).toBeNull();
  expect(pushPathFromData(null)).toBeNull();
});
