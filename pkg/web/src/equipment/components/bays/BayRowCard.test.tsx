import type { Bay } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BayRowCard } from './BayRowCard.js';

const bay = {
  name: 'Supply 1',
  department: 'supply',
  currentOperator: null,
  disabledAt: null,
} as Bay;

function renderRow(value: Bay | undefined, showOperator: boolean) {
  return renderToStaticMarkup(
    <BayRowCard
      bay={value}
      onRemove={() => {}}
      removeLabel="Remove Bay"
      showOperator={showOperator}
      unavailableHint="Choose another Bay"
    >
      <span>3 working days</span>
    </BayRowCard>,
  );
}

describe('BayRowCard', () => {
  it('retains both the unassigned identity and Department in Job seeds, while Product defaults remain Bay-only', () => {
    const jobSeed = renderRow(bay, true);
    const productDefault = renderRow(bay, false);
    expect(jobSeed).toMatch(/font-medium[^>]*>Supply 1<\/span>/);
    expect(jobSeed).toMatch(/<p[^>]*>No operator<\/p>/);
    expect(jobSeed).toMatch(/font-mono[^>]*>Supply<\/p>/);
    expect(productDefault).not.toContain('No operator');
    expect(productDefault).toContain('Supply 1');
  });

  it('does not invent a Bay identity for an unavailable Job seed', () => {
    const html = renderRow(undefined, true);
    expect(html).toContain('Unavailable Bay');
    expect(html).toContain('Choose another Bay');
    expect(html).not.toMatch(/<p[^>]*>No operator<\/p>/);
  });
});
