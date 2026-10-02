import { expect, test } from 'vitest';
import { deriveCapture } from './derive-capture';

const base = {
  value: '120,5',
  latest: { id: 'latest', value: 100 },
  disputedReadingId: null,
  comment: '',
  commentRequired: false,
  canCapture: true,
  machineKnown: true,
  cameraOpen: false,
  futureReadAt: false,
};

test('saves a parsed value at or above the latest reading, and nothing the form cannot stand behind', () => {
  expect(deriveCapture(base)).toMatchObject({ below: false, canSave: true });
  expect(deriveCapture({ ...base, latest: null, value: '3' }).canSave).toBe(true);
  expect(deriveCapture({ ...base, value: '  ' })).toMatchObject({ parsed: null, canSave: false });
  expect(deriveCapture({ ...base, value: '12.34' }).canSave).toBe(false);
  expect(deriveCapture({ ...base, machineKnown: false }).canSave).toBe(false);
  expect(deriveCapture({ ...base, canCapture: false }).canSave).toBe(false);
  expect(deriveCapture({ ...base, cameraOpen: true }).canSave).toBe(false);
  expect(deriveCapture({ ...base, futureReadAt: true }).canSave).toBe(false);
});

test('a value below the latest saves only once the Foreman disputes that very reading', () => {
  expect(deriveCapture({ ...base, value: '90' })).toMatchObject({
    below: true,
    disputeConfirmed: false,
    canSave: false,
  });
  const disputed = { ...base, value: '90', disputedReadingId: 'latest' };
  expect(deriveCapture(disputed)).toMatchObject({ below: true, disputeConfirmed: true, canSave: true });
  expect(deriveCapture({ ...disputed, latest: { id: 'newer', value: 100 } }).canSave).toBe(false);
});

test('a required comment gates Save until it is written', () => {
  expect(deriveCapture({ ...base, commentRequired: true }).canSave).toBe(false);
  expect(deriveCapture({ ...base, commentRequired: true, comment: 'Camera broken' }).canSave).toBe(true);
});
