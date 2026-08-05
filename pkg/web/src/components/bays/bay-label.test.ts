import type { Bay } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { bayNameWithOperator } from './bay-label.js';

describe('bayNameWithOperator', () => {
  const bay = (name: string, operatorName: string | null) =>
    ({
      currentOperator: operatorName ? { name: operatorName } : null,
      name,
    }) as Pick<Bay, 'currentOperator' | 'name'>;

  it('shows the current Operator after the Bay name', () => {
    expect(bayNameWithOperator(bay('Fabrication Bay 2', 'Mkhukhu'))).toBe('Fabrication Bay 2 - Mkhukhu');
  });

  it('leaves unassigned and already-suffixed Bay names unchanged', () => {
    expect(bayNameWithOperator(bay('Supply', null))).toBe('Supply');
    expect(bayNameWithOperator(bay('Fabrication Bay 2 - Mkhukhu', 'Mkhukhu'))).toBe('Fabrication Bay 2 - Mkhukhu');
  });
});
