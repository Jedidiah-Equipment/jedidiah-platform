import type { Bay } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { bayNameWithOperator, bayNameWithOperatorFirstName } from './bay-label.js';

const bay = (name: string, operatorName: string | null) =>
  ({
    currentOperator: operatorName ? { name: operatorName } : null,
    name,
  }) as Pick<Bay, 'currentOperator' | 'name'>;

describe('bayNameWithOperator', () => {
  it('shows the current Operator after the Bay name', () => {
    expect(bayNameWithOperator(bay('Fabrication Bay 2', 'Mkhukhu'))).toBe('Fabrication Bay 2 - Mkhukhu');
  });

  it('leaves unassigned and already-suffixed Bay names unchanged', () => {
    expect(bayNameWithOperator(bay('Supply', null))).toBe('Supply');
    expect(bayNameWithOperator(bay('Fabrication Bay 2 - Mkhukhu', 'Mkhukhu'))).toBe('Fabrication Bay 2 - Mkhukhu');
  });
});

describe('bayNameWithOperatorFirstName', () => {
  it('names the Bay by its Operator’s first name', () => {
    expect(bayNameWithOperatorFirstName(bay('Fabrication Bay 2', 'Mkhukhu Dlamini'))).toBe(
      'Fabrication Bay 2 - Mkhukhu',
    );
  });

  it('falls back to the Bay name when no Operator is assigned', () => {
    expect(bayNameWithOperatorFirstName(bay('Supply', null))).toBe('Supply');
  });

  it('does not repeat a first name the Bay name already ends with, however it was typed', () => {
    expect(bayNameWithOperatorFirstName(bay('Fabrication Bay 1 - Ayanda', 'Ayanda Nkosi'))).toBe(
      'Fabrication Bay 1 - Ayanda',
    );
    // Hand-typed legacy Bay names are not consistent about the spacing around the dash.
    expect(bayNameWithOperatorFirstName(bay('Repairs- Mjabulisi', 'Mjabulisi Zulu'))).toBe('Repairs- Mjabulisi');
  });
});
