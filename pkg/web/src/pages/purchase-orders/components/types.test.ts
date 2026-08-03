import { PurchaseOrderView } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  PurchaseOrderCreateFormValues,
  PurchaseOrderDraftFormValues,
  toPurchaseOrderCreateInput,
  toPurchaseOrderDraftFormValues,
  toPurchaseOrderDraftInput,
} from './types.js';

const PART_ID = '4de0e2a1-2b2f-4b2e-9a5f-6a0d0a1b2c3d';
const JOB_ID = '9c9e8b7a-6d5c-4b3a-8291-0f1e2d3c4b5a';

const purchaseOrder = PurchaseOrderView.parse({
  code: 'PO-00001',
  createdAt: '2026-08-02T08:00:00.000Z',
  documentId: null,
  expectedDeliveryDate: '2026-08-20',
  id: 'f0e6a166-6958-46c0-a2e6-271bad486859',
  jobs: [{ code: 'JOB-00007', id: JOB_ID }],
  lines: [
    {
      partCode: 'P-100',
      partId: PART_ID,
      partName: 'Bearing',
      quantity: 4,
      standardPurchaseLengthMm: null,
      unitOfMeasure: 'piece',
      unitPrice: 125.5,
    },
  ],
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

describe('Purchase Order draft form values', () => {
  it('maps the whole editable order — header, lines, and Job links — into one set of values', () => {
    expect(toPurchaseOrderDraftFormValues(purchaseOrder)).toEqual({
      expectedDeliveryDate: '2026-08-20',
      jobIds: [JOB_ID],
      lines: [{ partId: PART_ID, quantity: 4, unitPrice: 125.5 }],
      supplierId: purchaseOrder.supplierId,
    });
  });

  it('maps an empty delivery date to null for the API', () => {
    const values = PurchaseOrderDraftFormValues.parse({
      expectedDeliveryDate: '',
      jobIds: [],
      lines: [],
      supplierId: purchaseOrder.supplierId,
    });

    expect(toPurchaseOrderDraftInput(purchaseOrder.id, values)).toEqual({
      expectedDeliveryDate: null,
      id: purchaseOrder.id,
      jobIds: [],
      lines: [],
      supplierId: purchaseOrder.supplierId,
    });
  });

  it('rejects a Part appearing on two lines, the same rule the save input enforces', () => {
    const duplicated = {
      expectedDeliveryDate: '',
      jobIds: [],
      lines: [
        { partId: PART_ID, quantity: 1, unitPrice: 10 },
        { partId: PART_ID, quantity: 2, unitPrice: 20 },
      ],
      supplierId: purchaseOrder.supplierId,
    };

    expect(PurchaseOrderDraftFormValues.safeParse(duplicated).success).toBe(false);
  });

  it('creates a draft from the supplier and expected date alone', () => {
    const values = PurchaseOrderCreateFormValues.parse({
      expectedDeliveryDate: '2026-08-20',
      supplierId: purchaseOrder.supplierId,
    });

    expect(toPurchaseOrderCreateInput(values)).toEqual({
      expectedDeliveryDate: '2026-08-20',
      supplierId: purchaseOrder.supplierId,
    });
  });
});
