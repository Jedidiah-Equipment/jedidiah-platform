import type { Bay } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { bayNameWithOperator, bayNameWithOperatorFirstName } from './bay-label.js';

const bay = (name: string, operatorName: string | null) =>
  ({
    currentOperator: operatorName ? { name: operatorName } : null,
    name,
  }) as Pick<Bay, 'currentOperator' | 'name'>;

describe('bayNameWithOperator', () => {
  it('shows the current Operator after the Bay name', () => {
    expect(bayNameWithOperator(bay('Fabrication Bay 2', 'Mkhukhu Dlamini'))).toBe(
      'Fabrication Bay 2 - Mkhukhu Dlamini',
    );
  });

  it('leaves an unassigned Bay name unchanged', () => {
    expect(bayNameWithOperator(bay('Supply', null))).toBe('Supply');
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
});
