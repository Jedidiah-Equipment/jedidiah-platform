import { expect, test } from 'vitest';
import { deriveCapture } from './derive-capture';

const base = {
  value: '120,5',
  world: { latest: { id: 'server-1', value: 100 }, stint: null, onSite: [], management: false, hasPhoto: true },
  capture: {
    role: 'spot' as const,
    machineId: 'machine-1',
    implementId: null,
    disputePrevious: false,
    expectedPreviousId: null,
    comment: null,
  },
  canCapture: true,
  machineKnown: true,
  cameraOpen: false,
};

test('saves a parsed value the capture rules accept, and nothing the form itself cannot stand behind', () => {
  expect(deriveCapture(base)).toMatchObject({ verdict: { ok: true }, canSave: true });
  expect(deriveCapture({ ...base, value: '  ' })).toMatchObject({ parsed: null, verdict: null, canSave: false });
  expect(deriveCapture({ ...base, value: '12.34' })).toMatchObject({ verdict: null, canSave: false });
  expect(deriveCapture({ ...base, machineKnown: false }).canSave).toBe(false);
  expect(deriveCapture({ ...base, canCapture: false }).canSave).toBe(false);
  expect(deriveCapture({ ...base, cameraOpen: true }).canSave).toBe(false);
  expect(deriveCapture({ ...base, value: '90' })).toMatchObject({
    verdict: { ok: false, rule: 'below-latest' },
    canSave: false,
  });
});

test('warns without blocking when the phone believes the Machine is on site elsewhere, since that may be stale', () => {
  const busy = {
    ...base,
    world: {
      ...base.world,
      stint: 'planned' as const,
      onSite: [{ machineId: 'machine-1', implementId: null, jobNumber: 'CJOB-00041' }],
    },
    capture: { ...base.capture, role: 'arrival' as const },
  };
  expect(deriveCapture(busy)).toMatchObject({
    verdict: { ok: false, rule: 'machine-busy' },
    advisory: true,
    canSave: true,
  });
});
