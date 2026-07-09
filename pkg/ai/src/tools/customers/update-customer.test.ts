import * as core from '@pkg/core';
import { Customer, CustomerPatchInput, type UserAccessSummary } from '@pkg/schema';
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

function sampleCustomer(): Customer {
  return Customer.parse({
    address: '1 Quarry Road',
    companyName: 'Acme Mining',
    contactPerson: 'Jane Buyer',
    createdAt: '2026-06-17T08:00:00.000Z',
    email: 'new@acme.example',
    id: '00000000-0000-4000-8000-000000000101',
    notes: 'Needs follow-up',
    phone: '+27123456789',
    thumbnailDataUrl: null,
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

  test('exposes exactly the fields of the core CustomerPatchInput schema', () => {
    // The model-facing input schema is hand-duplicated (its transforms do not serialize to the OpenAI
    // strict subset), so guard against it drifting from the core patch schema it feeds.
    const exposedFields = Object.keys((updateCustomerTool.jsonSchema.properties as Record<string, unknown>) ?? {});
    expect(exposedFields.sort()).toEqual(Object.keys(CustomerPatchInput.shape).sort());
  });

  test('forwards only the named field so core keeps the rest under its row lock', async () => {
    const updateSpy = vi.spyOn(core, 'patchCustomer').mockResolvedValue(sampleCustomer());

    await updateCustomerTool.handler(
      { id: '00000000-0000-4000-8000-000000000101', email: 'new@acme.example' },
      createAiContext(),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: { id: '00000000-0000-4000-8000-000000000101', email: 'new@acme.example' },
    });
    // Omitted fields are absent, so the locked merge in core leaves them untouched.
    const passedInput = updateSpy.mock.calls[0]?.[0].input as Record<string, unknown>;
    expect(Object.keys(passedInput).sort()).toEqual(['email', 'id']);
  });

  test('forwards an explicit null to clear a nullable field', async () => {
    const updateSpy = vi.spyOn(core, 'patchCustomer').mockResolvedValue(sampleCustomer());

    await updateCustomerTool.handler({ id: '00000000-0000-4000-8000-000000000101', notes: null }, createAiContext());

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ input: { id: '00000000-0000-4000-8000-000000000101', notes: null } }),
    );
  });

  test('projects the updated Customer with a Customer link', () => {
    expect((updateCustomerDefinition.projectResult as (value: unknown) => unknown)(sampleCustomer())).toMatchObject({
      links: [
        { entity: 'Customer', href: '/customers/00000000-0000-4000-8000-000000000101/edit', label: 'Acme Mining' },
      ],
    });
  });
});
