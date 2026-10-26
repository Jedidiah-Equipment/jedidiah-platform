import { expect, it } from 'vitest';
import { SettingsSearch } from './settings-tabs.js';

it('opens General by default and falls back from an unknown tab or result', () => {
  expect(SettingsSearch.parse({})).toEqual({ tab: 'general' });
  expect(SettingsSearch.parse({ tab: 'john-deere', result: 'connected' })).toEqual({
    tab: 'john-deere',
    result: 'connected',
  });
  expect(SettingsSearch.parse({ tab: 'billing', result: 'maybe' })).toEqual({ tab: 'general', result: undefined });
});
