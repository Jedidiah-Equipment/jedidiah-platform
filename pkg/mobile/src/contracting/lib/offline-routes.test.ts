import { expect, test } from 'vitest';
import { isOfflineCapableRoute, offlineCoverAction } from './offline-routes';

test('only the Field Note routes work offline', () => {
  expect(isOfflineCapableRoute('/contracting/field-notes')).toBe(true);
  expect(isOfflineCapableRoute('/contracting/field-notes/new')).toBe(true);
  expect(isOfflineCapableRoute('/contracting/field-notes/1f0c')).toBe(true);
  expect(isOfflineCapableRoute('/contracting/field-notesy')).toBe(false);
  expect(isOfflineCapableRoute('/contracting')).toBe(false);
  expect(isOfflineCapableRoute('/contracting/jobs')).toBe(false);
  expect(isOfflineCapableRoute('/equipment/jobs')).toBe(false);
});

test('the offline cover offers Field Notes on Contracting routes only', () => {
  expect(offlineCoverAction('/contracting')).toMatchObject({
    label: 'Open Field Notes',
    href: '/contracting/field-notes',
  });
  expect(offlineCoverAction('/contracting/machines/abc/capture')).not.toBeNull();
  expect(offlineCoverAction('/contractingx')).toBeNull();
  expect(offlineCoverAction('/equipment')).toBeNull();
  expect(offlineCoverAction('/login')).toBeNull();
});
