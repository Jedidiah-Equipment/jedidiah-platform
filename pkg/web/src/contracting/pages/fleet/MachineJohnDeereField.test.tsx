import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { MachineJohnDeereField } from './MachineJohnDeereField.js';

const johnDeere = {
  equipmentId: 'eq-1',
  principalId: 7,
  name: 'Big Green',
  lost: false,
  lastReportTime: null,
  lastValue: null,
};
const render = (machine: Parameters<typeof MachineJohnDeereField>[0]['machine']) =>
  renderToStaticMarkup(<MachineJohnDeereField machine={machine} />);

test('names the linked Deere machine and its PIN, badging a lost one', () => {
  const linked = render({ johnDeere, serialNumber: 'PIN-1' });
  expect(linked).toContain('Big Green · PIN-1');
  expect(linked).not.toContain('Lost');
  expect(linked).toContain('Linked on Settings → John Deere');
  expect(render({ johnDeere: { ...johnDeere, lost: true }, serialNumber: 'PIN-1' })).toContain('Lost');
});

test('reads Not linked without a Link', () => {
  expect(render({ johnDeere: null, serialNumber: null })).toContain('Not linked');
});
