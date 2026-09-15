import { expect, test } from 'vitest';
import { contractingStorageKey } from './contracting-storage';

test('the reading queue key stays byte-identical so an installed build keeps its queued captures', () => {
  expect(contractingStorageKey('readings', 'v1', 'https://api.example.test:8443', 'user-1')).toBe(
    'contracting:readings:v1:https://api.example.test:8443:user-1',
  );
});
