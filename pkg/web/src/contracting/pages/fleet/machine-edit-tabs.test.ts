import { describe, expect, test } from 'vitest';
import { resolveMachineEditTab } from './machine-edit-tabs.js';

describe('resolveMachineEditTab', () => {
  const all = { jobs: true, workshop: true, service: true };

  test('keeps a tab the reader may open', () => {
    expect(resolveMachineEditTab('workshop', all)).toBe('workshop');
    expect(resolveMachineEditTab('details', { jobs: false, workshop: false, service: false })).toBe('details');
  });

  test('falls back to Details for a tab the reader may not open', () => {
    expect(resolveMachineEditTab('workshop', { ...all, workshop: false })).toBe('details');
    expect(resolveMachineEditTab('jobs', { ...all, jobs: false })).toBe('details');
    expect(resolveMachineEditTab('service', { ...all, service: false })).toBe('details');
  });
});
