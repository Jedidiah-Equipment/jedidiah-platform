import { accessForRole } from '@pkg/domain/testing';
import { describe, expect, it } from 'vitest';

import { counterMayOpen, storesSeat } from './stores-access';

const person = { id: 'manager-1', image: null, isDevice: false, name: 'Lerato Khumalo' };

describe('storesSeat', () => {
  it('seats someone who counts but cannot move stock as themselves', () => {
    expect(storesSeat({ access: accessForRole('job-manager', 'manager-1'), user: person })).toEqual({
      kind: 'counter',
      self: { id: 'manager-1', name: 'Lerato Khumalo', thumbnailDataUrl: null },
    });
  });

  it('gives anyone who can move stock the full Stores, with the Quick-switch', () => {
    expect(storesSeat({ access: accessForRole('admin', 'admin-1'), user: { ...person, id: 'admin-1' } })).toEqual({
      kind: 'tablet',
    });
  });

  // The Quick-switch list is a movement right, so a counting device would have nobody it could name.
  it('keeps out a Device Account that can count but not move', () => {
    expect(
      storesSeat({ access: accessForRole('job-manager', 'tablet-1'), user: { ...person, isDevice: true } }),
    ).toBeNull();
  });

  it('keeps out anyone who neither moves nor counts, and waits for access to resolve', () => {
    expect(storesSeat({ access: accessForRole('procurement-manager', 'buyer-1'), user: person })).toBeNull();
    expect(storesSeat({ access: undefined, user: person })).toBeNull();
  });
});

describe('counterMayOpen', () => {
  it('opens the Stores home and the stocktake walk to a counter', () => {
    expect(counterMayOpen(['(protected)', 'equipment', '(tabs)', 'stores'])).toBe(true);
    expect(counterMayOpen(['(protected)', 'equipment', '(tabs)', 'stores', 'stocktake', '[sessionId]'])).toBe(true);
  });

  it('closes the movement screens a deep link could reach', () => {
    expect(counterMayOpen(['(protected)', 'equipment', '(tabs)', 'stores', 'parts', '[partCode]'])).toBe(false);
    expect(counterMayOpen(['(protected)', 'equipment', '(tabs)', 'stores', 'close-out'])).toBe(false);
  });
});
