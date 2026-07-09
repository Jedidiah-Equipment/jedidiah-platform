import * as core from '@pkg/core';
import { Customer, type UserAccessSummary } from '@pkg/schema';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AiContext } from '@/context.js';
import { createSilentLogger, mockSession } from '@/test/test-utils.js';
import { updateCustomerDefinition, updateCustomerTool } from './update-customer.js';

function createAiContext(access: UserAccessSummary | null = null): AiContext {
  return {
    access,
    brochureRenderer: vi.fn(async () => new Uint8Array()),
    db: {} as AiContext['db'],
    deliverQuoteDraftEmail: vi.fn(async () => ({ recipientEmail: 'test@example.com', warnings: [] })),
    log: createSilentLogger(),
    session: mockSession(access?.role ?? 'admin'),
    storage: {} as AiContext['storage'],
  };
}

function currentCustomer(): Customer {
  return Customer.parse({
    address: '1 Quarry Road',
    companyName: 'Acme Mining',
    contactPerson: 'Jane Buyer',
    createdAt: '2026-06-17T08:00:00.000Z',
    email: 'old@acme.example',
    id: '00000000-0000-4000-8000-000000000101',
    notes: 'Needs follow-up',
    phone: '+27123456789',
    thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    updatedAt: '2026-06-17T08:00:00.000Z',
    vatNumber: 'VAT-123',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateCustomerTool', () => {
  test('is a customer:update write tool', () => {
    expect(updateCustomerTool.requiredPermission).toBe('customer:update');
    expect(updateCustomerDefinition.kind).toBe('write');
  });

  test('merges the partial change over the current record and keeps other fields untouched', async () => {
    const current = currentCustomer();
    vi.spyOn(core, 'getCustomer').mockResolvedValue(current);
    const updateSpy = vi.spyOn(core, 'updateCustomer').mockResolvedValue({ ...current, email: 'new@acme.example' });

    await updateCustomerTool.handler({ id: current.id, email: 'new@acme.example' }, createAiContext());

    expect(updateSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: {
        id: current.id,
        address: '1 Quarry Road',
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        email: 'new@acme.example',
        notes: 'Needs follow-up',
        phone: '+27123456789',
        thumbnailDataUrl: 'data:image/webp;base64,aaaa',
        vatNumber: 'VAT-123',
      },
    });
  });

  test('can explicitly null a field without disturbing the rest', async () => {
    const current = currentCustomer();
    vi.spyOn(core, 'getCustomer').mockResolvedValue(current);
    const updateSpy = vi.spyOn(core, 'updateCustomer').mockResolvedValue(current);

    await updateCustomerTool.handler({ id: current.id, notes: null }, createAiContext());

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ notes: null, address: '1 Quarry Road', vatNumber: 'VAT-123' }),
      }),
    );
  });

  test('projects the updated Customer with a Customer link', () => {
    expect((updateCustomerDefinition.projectResult as (value: unknown) => unknown)(currentCustomer())).toMatchObject({
      links: [
        { entity: 'Customer', href: '/customers/00000000-0000-4000-8000-000000000101/edit', label: 'Acme Mining' },
      ],
    });
  });
});
