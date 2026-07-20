import { describe, expect, it } from 'vitest';

import { stripOperatorSuffix } from './bay-name';

describe('stripOperatorSuffix', () => {
  it('strips an exact " - <operator>" suffix from the bay name', () => {
    expect(stripOperatorSuffix({ bayName: 'Fabrication 1 - Piet Pompies', operatorName: 'Piet Pompies' })).toBe(
      'Fabrication 1',
    );
  });

  it('leaves names without the exact suffix untouched', () => {
    expect(stripOperatorSuffix({ bayName: 'Fabrication 1', operatorName: 'Piet Pompies' })).toBe('Fabrication 1');
    expect(stripOperatorSuffix({ bayName: 'Fabrication 1 – Piet Pompies', operatorName: 'Piet Pompies' })).toBe(
      'Fabrication 1 – Piet Pompies',
    );
    expect(stripOperatorSuffix({ bayName: 'Piet Pompies Bay', operatorName: null })).toBe('Piet Pompies Bay');
  });
});
