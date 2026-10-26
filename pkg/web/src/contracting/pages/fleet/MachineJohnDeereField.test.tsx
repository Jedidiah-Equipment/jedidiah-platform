import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const access = { current: true };
vi.mock('@/hooks/use-access.js', () => ({
  useCan: (permission: string) => ({ can: permission === 'contracting_settings:update' && access.current }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, className }: ComponentProps<'a'> & { to: string; search: Record<string, string> }) => (
    <a href={`${to}?${new URLSearchParams(search)}`} className={className}>
      {children}
    </a>
  ),
}));

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

test('names the linked Deere machine and its PIN, badging a lost one, with no way to the Settings tab', () => {
  const linked = render({ johnDeere, serialNumber: 'PIN-1' });
  expect(linked).toContain('Big Green · PIN-1');
  expect(linked).not.toContain('Lost');
  expect(linked).not.toContain('Link in Settings');
  expect(render({ johnDeere: { ...johnDeere, lost: true }, serialNumber: 'PIN-1' })).toContain('Lost');
});

test('reads Not linked without a Link and offers the John Deere tab to whoever manages Settings', () => {
  const unlinked = render({ johnDeere: null, serialNumber: null });
  expect(unlinked).toContain('Not linked');
  expect(unlinked).toContain('Link in Settings');
  expect(unlinked).toContain('href="/contracting/settings?tab=john-deere"');
});

test('offers nothing to a reader who cannot open Settings', () => {
  access.current = false;
  const unlinked = render({ johnDeere: null, serialNumber: null });
  expect(unlinked).toContain('Not linked');
  expect(unlinked).not.toContain('Link in Settings');
  access.current = true;
});
