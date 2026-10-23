import { expect, test } from 'vitest';
import { textChange } from './text-change.js';

test('marks the words a person removed and added, keeping what stayed', () => {
  expect(textChange('The gate at Rooi Kraal is open.', 'The gate at Rooikraal is open.')).toEqual([
    { kind: 'same', text: 'The gate at ' },
    { kind: 'removed', text: 'Rooi Kraal' },
    { kind: 'added', text: 'Rooikraal' },
    { kind: 'same', text: ' is open.' },
  ]);
});

test('an unchanged or emptied text reads as one segment', () => {
  expect(textChange('Gate open.', 'Gate open.')).toEqual([{ kind: 'same', text: 'Gate open.' }]);
  expect(textChange('Gate open.', '')).toEqual([{ kind: 'removed', text: 'Gate open.' }]);
});
