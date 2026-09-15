import { expect, test } from 'vitest';
import { deriveCapture } from './derive-capture';

const base = {
  value: '120.5',
  latest: 100,
  latestId: 'server-1',
  disputePrevious: false,
  disputedReadingId: null,
  canCapture: true,
  machineKnown: true,
  cameraOpen: false,
};

test('a valid value at or above the latest reading can be saved, accepting a decimal comma', () => {
  expect(deriveCapture(base)).toMatchObject({ below: false, canSave: true });
  expect(deriveCapture({ ...base, value: '100,0' })).toMatchObject({ below: false, canSave: true });
  expect(deriveCapture({ ...base, latest: undefined, latestId: null })).toMatchObject({ canSave: true });
});

test('a blank or malformed value, a missing machine, no capture permission, or an open camera blocks saving', () => {
  expect(deriveCapture({ ...base, value: '  ' })).toMatchObject({ parsed: null, canSave: false });
  expect(deriveCapture({ ...base, value: '12.34' }).canSave).toBe(false);
  expect(deriveCapture({ ...base, machineKnown: false }).canSave).toBe(false);
  expect(deriveCapture({ ...base, canCapture: false }).canSave).toBe(false);
  expect(deriveCapture({ ...base, cameraOpen: true }).canSave).toBe(false);
});

test('a value below the latest reading saves only while the dispute targets that same latest reading', () => {
  expect(deriveCapture({ ...base, value: '90' })).toMatchObject({
    below: true,
    disputeConfirmed: false,
    canSave: false,
  });
  const disputed = { ...base, value: '90', disputePrevious: true, disputedReadingId: 'server-1' };
  expect(deriveCapture(disputed)).toMatchObject({ below: true, disputeConfirmed: true, canSave: true });
  expect(deriveCapture({ ...disputed, latestId: 'server-2' })).toMatchObject({
    disputeConfirmed: false,
    canSave: false,
  });
});
