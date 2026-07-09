import { user } from '@pkg/db';
import { CustomerCreateInput } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createCustomer, mapCustomer, patchCustomer } from './customer-service.js';

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: 'actor@example.com',
    emailVerified: true,
    id: 'actor-user-id',
    name: 'Actor User',
    role: 'admin',
    updatedAt: now,
  });

  return { db };
});

describe('patchCustomer', () => {
  test('changes only the named field and leaves the rest untouched', async ({ context }) => {
    const created = await createCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: CustomerCreateInput.parse({
        address: '1 Quarry Road',
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        email: 'old@acme.example',
        notes: 'Needs follow-up',
        phone: '+27123456789',
        vatNumber: 'VAT-123',
      }),
    });

    const updated = await patchCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: { id: created.id, email: 'new@acme.example' },
    });

    expect(updated.email).toBe('new@acme.example');
    expect(updated.address).toBe('1 Quarry Road');
    expect(updated.contactPerson).toBe('Jane Buyer');
    expect(updated.phone).toBe('+27123456789');
    expect(updated.notes).toBe('Needs follow-up');
    expect(updated.vatNumber).toBe('VAT-123');
    expect(updated.companyName).toBe('Acme Mining');
  });

  test('clears a nullable field on an explicit null', async ({ context }) => {
    const created = await createCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: CustomerCreateInput.parse({ companyName: 'Acme Mining', notes: 'Remove me' }),
    });

    const updated = await patchCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: { id: created.id, notes: null },
    });

    expect(updated.notes).toBeNull();
    expect(updated.companyName).toBe('Acme Mining');
  });
});

describe('mapCustomer', () => {
  it('maps customer rows to customer DTOs', () => {
    const createdAt = new Date('2026-05-17T10:00:00.000Z');
    const updatedAt = new Date('2026-05-17T11:00:00.000Z');

    expect(
      mapCustomer({
        address: '12 Main Road',
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        createdAt,
        email: 'sales@acme.example',
        id: '00000000-0000-4000-8000-000000000001',
        notes: null,
        phone: '+27 11 555 0100',
        thumbnailDataUrl: null,
        updatedAt,
        vatNumber: 'VAT-123456',
      }),
    ).toEqual({
      address: '12 Main Road',
      companyName: 'Acme Mining',
      contactPerson: 'Jane Buyer',
      createdAt: createdAt.toISOString(),
      email: 'sales@acme.example',
      id: '00000000-0000-4000-8000-000000000001',
      notes: null,
      phone: '+27 11 555 0100',
      thumbnailDataUrl: null,
      updatedAt: updatedAt.toISOString(),
      vatNumber: 'VAT-123456',
    });
  });
});
