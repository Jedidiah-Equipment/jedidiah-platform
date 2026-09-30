import { describe, expect, it } from 'vitest';

import { getBayDisplayText } from './bay-display.js';

describe('getBayDisplayText', () => {
  it('promotes the full assigned Operator name ahead of the physical Bay', () => {
    expect(getBayDisplayText({ bayName: 'Supply 1', operatorName: '  Piet Pompies  ' })).toEqual({
      primaryText: 'Piet Pompies',
      secondaryText: 'Supply 1',
    });
  });
  it.each([null, '', '   '])('promotes the Bay when the Operator is %j', (operatorName) => {
    expect(getBayDisplayText({ bayName: 'Supply 1', operatorName })).toEqual({
      primaryText: 'Supply 1',
      secondaryText: 'No operator',
    });
  });

  it('removes one exact trailing full-name suffix', () => {
    expect(getBayDisplayText({ bayName: 'Fabrication 1 - Piet Pompies', operatorName: ' Piet Pompies ' })).toEqual({
      primaryText: 'Piet Pompies',
      secondaryText: 'Fabrication 1',
    });
    expect(
      getBayDisplayText({ bayName: 'Bay - Piet Pompies - Piet Pompies', operatorName: 'Piet Pompies' }).secondaryText,
    ).toBe('Bay - Piet Pompies');
  });
  it.each([
    'Fabrication 1',
    'Fabrication 1 – Piet Pompies',
    'Fabrication 1 - piet pompies',
    'Fabrication 1 - Someone Else',
    'Piet Pompies Bay',
    ' - Piet Pompies',
    '   - Piet Pompies',
  ])('preserves nonmatching suffixes and a Bay that would become blank: %s', (bayName) => {
    expect(getBayDisplayText({ bayName, operatorName: 'Piet Pompies' }).secondaryText).toBe(bayName);
  });

  it('does not infer an assignment from a legacy Bay name', () => {
    expect(getBayDisplayText({ bayName: 'Supply 1 - Piet Pompies', operatorName: null })).toEqual({
      primaryText: 'Supply 1 - Piet Pompies',
      secondaryText: 'No operator',
    });
  });
});
