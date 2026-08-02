import { PurchaseOrder } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { PurchaseOrderHeaderFormValues, toPurchaseOrderHeaderFormValues, toPurchaseOrderHeaderInput } from './types.js';

const purchaseOrder = PurchaseOrder.parse({
  code: 'PO-00001',
  createdAt: '2026-08-02T08:00:00.000Z',
  documentId: null,
  expectedDeliveryDate: '2026-08-20',
  id: 'f0e6a166-6958-46c0-a2e6-271bad486859',
  jobs: [],
  lines: [],
  sentAt: null,
  status: 'draft',
  supplier: {
    address: null,
    companyName: 'Steel Supply Co',
    contactPerson: null,
    email: null,
    id: '762b0045-d030-4897-918d-dc50eea5469c',
    phone: null,
  },
  supplierId: '762b0045-d030-4897-918d-dc50eea5469c',
  updatedAt: '2026-08-02T08:00:00.000Z',
});

describe('Purchase Order header form values', () => {
  it('maps an existing Purchase Order into editable values', () => {
    expect(toPurchaseOrderHeaderFormValues(purchaseOrder)).toEqual({
      expectedDeliveryDate: '2026-08-20',
      supplierId: purchaseOrder.supplierId,
    });
  });

  it('maps an empty delivery date to null for the API', () => {
    const values = PurchaseOrderHeaderFormValues.parse({
      expectedDeliveryDate: '',
      supplierId: purchaseOrder.supplierId,
    });

    expect(toPurchaseOrderHeaderInput(purchaseOrder.id, values)).toEqual({
      expectedDeliveryDate: null,
      id: purchaseOrder.id,
      supplierId: purchaseOrder.supplierId,
    });
  });
});
