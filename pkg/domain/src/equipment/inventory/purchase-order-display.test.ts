import { describe, expect, it } from 'vitest';

import { purchaseOrderStatusColorClassNames } from './purchase-order-display.js';

describe('purchase order status colours', () => {
  // #1778: Approved was teal beside Received's green, and the list read as one colour.
  it('paints each live step of an order in its own hue', () => {
    const steps = ['draft', 'approved', 'partially-received', 'received', 'cancelled'] as const;
    const chips = steps.map((status) => purchaseOrderStatusColorClassNames[status].chip);
    expect(new Set(chips).size).toBe(steps.length);
  });

  it('keeps Approved away from the green family Received owns', () => {
    expect(purchaseOrderStatusColorClassNames.approved.chip).not.toMatch(/emerald|green|teal/);
  });
});
