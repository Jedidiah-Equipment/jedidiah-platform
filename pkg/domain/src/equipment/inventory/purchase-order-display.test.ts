import { describe, expect, it } from 'vitest';

import { statusBadgeColorClassNames } from '../../theme/status-badge.js';
import { purchaseOrderStatusColorClassNames } from './purchase-order-display.js';

describe('purchase order status colours', () => {
  it('gives every status its own palette entry except Closed short, which settles as grey as Draft', () => {
    const { 'closed-short': closedShort, ...others } = purchaseOrderStatusColorClassNames;
    expect(closedShort).toBe(purchaseOrderStatusColorClassNames.draft);
    expect(new Set(Object.values(others)).size).toBe(Object.keys(others).length);
  });

  // #1778: Approved was teal beside Received's green, and the list read as one colour.
  it('keeps Approved out of the green family Received owns', () => {
    expect([statusBadgeColorClassNames.green, statusBadgeColorClassNames.teal]).not.toContain(
      purchaseOrderStatusColorClassNames.approved,
    );
  });
});
