import { auditEvents, type Db, user } from '@pkg/db';
import type { ContractingRole, EquipmentRole } from '@pkg/schema';
import { beforeEach, describe, expect } from 'vitest';
import { clearMockEmailMessages, getMockEmailMessages } from '@/email/mock-email.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ auth, db }) => ({ auth, db }));

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,aaaa';

describe('users.list', () => {
  test('rejects unauthenticated user lists', async ({ context }) => {
    await expect(context.createAnonCaller().users.list({ business: 'equipment' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('allows admins to list safe user summaries', async ({ context }) => {
    await createUser(context.db, {
      email: 'viewer@example.com',
      emailVerified: true,
      id: 'viewer-user-id',
      name: 'Viewer User',
      role: 'sales',
    });

    const result = await context.createCaller().users.list({ business: 'equipment' });

    expect(result.users).toEqual([
      {
        assistantEnabled: false,
        contractingRole: null,
        email: 'viewer@example.com',
        emailVerified: true,
        equipmentRole: 'sales',
        id: 'viewer-user-id',
        isDevice: false,
        name: 'Viewer User',
        phoneNumber: null,
        thumbnailDataUrl: null,
      },
    ]);
  });

  test('returns stored phone numbers in list responses', async ({ context }) => {
    await createUser(context.db, {
      email: 'caller@example.com',
      id: 'phone-user-id',
      name: 'Phone User',
      phoneNumber: '+27821234567',
      role: 'sales',
    });

    await expect(context.createCaller().users.list({ business: 'equipment' })).resolves.toMatchObject({
      users: [{ id: 'phone-user-id', phoneNumber: '+27821234567' }],
    });
  });

  test('maps user image storage to thumbnailDataUrl in list responses', async ({ context }) => {
    await createUser(context.db, {
      email: 'thumbnail@example.com',
      id: 'thumbnail-user-id',
      image: THUMBNAIL_DATA_URL,
      name: 'Thumbnail User',
      role: 'sales',
    });

    await expect(context.createCaller().users.list({ business: 'equipment' })).resolves.toMatchObject({
      users: [
        {
          id: 'thumbnail-user-id',
          thumbnailDataUrl: THUMBNAIL_DATA_URL,
        },
      ],
    });
  });

  test('rejects unknown stored roles in list responses', async ({ context }) => {
    await createUser(context.db, {
      email: 'legacy@example.com',
      emailVerified: false,
      id: 'legacy-user-id',
      name: 'Legacy User',
      role: 'user',
    });

    await expect(context.createCaller().users.list({ business: 'equipment' })).rejects.toThrow();
  });

  test('lists each business its own people, super-admins and the unassigned in both', async ({ context }) => {
    const people: Array<[id: string, role: EquipmentRole | null, contractingRole: ContractingRole | null]> = [
      ['both-slots', 'sales', 'foreman'],
      ['contracting-only', null, 'driver'],
      ['equipment-only', 'bay-operator', null],
      ['spanning', 'super-admin', null],
      ['unassigned', null, null],
    ];
    for (const [id, role, contractingRole] of people) {
      await createUser(context.db, { contractingRole, email: `${id}@example.com`, id, name: id, role });
    }

    const equipment = await context.createCaller().users.list({ business: 'equipment' });
    const contracting = await context.createCaller().users.list({ business: 'contracting' });

    expect(equipment.users.map((listed) => listed.id)).toEqual([
      'both-slots',
      'equipment-only',
      'spanning',
      'unassigned',
    ]);
    expect(contracting.users.map((listed) => listed.id)).toEqual([
      'both-slots',
      'contracting-only',
      'spanning',
      'unassigned',
    ]);
  });

  test('rejects procurement managers', async ({ context }) => {
    const caller = context.createCaller(mockSession('procurement-manager'));

    await expect(caller.users.list({ business: 'equipment' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('users.updateThumbnail', () => {
  test('updates and removes user thumbnails with audit changes', async ({ context }) => {
    await createUser(context.db, {
      email: 'admin@example.com',
      id: 'test-user-id',
      name: 'Test User',
      role: 'admin',
    });
    await createUser(context.db, {
      email: 'thumbnail-target@example.com',
      id: 'thumbnail-target-user-id',
      image: THUMBNAIL_DATA_URL,
      name: 'Thumbnail Target',
      role: 'sales',
    });

    const updated = await context.createCaller().users.updateThumbnail({
      thumbnailDataUrl: null,
      userId: 'thumbnail-target-user-id',
    });

    expect(updated.thumbnailDataUrl).toBeNull();

    const events = await context.db.select().from(auditEvents);
    expect(events).toMatchObject([
      {
        action: 'updated',
        changes: {
          thumbnailDataUrl: {
            from: THUMBNAIL_DATA_URL,
            to: null,
          },
        },
        entityId: 'thumbnail-target-user-id',
        entityType: 'user',
      },
    ]);
  });
});

describe('users.setDevice', () => {
  test('persists the shared-device setting in subsequent user lists', async ({ context }) => {
    await createUser(context.db, {
      email: 'admin@example.com',
      id: 'test-user-id',
      name: 'Test User',
      role: 'admin',
    });
    await createUser(context.db, {
      email: 'device-target@example.com',
      id: 'device-target-user-id',
      name: 'Device Target',
      role: 'stores',
    });

    await context.createCaller().users.setDevice({
      isDevice: true,
      userId: 'device-target-user-id',
    });

    const listedUsers = await context.createCaller().users.list({ business: 'equipment' });

    expect(listedUsers.users.find((userSummary) => userSummary.id === 'device-target-user-id')).toMatchObject({
      isDevice: true,
    });
  });
});

describe('users.sendVerificationEmail', () => {
  beforeEach(() => {
    clearMockEmailMessages();
  });

  test('rejects unauthenticated callers', async ({ context }) => {
    await expect(
      context.createAnonCaller().users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000099' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('rejects non-admin roles', async ({ context }) => {
    await expect(
      context
        .createCaller(mockSession('sales'))
        .users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000099' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('returns NOT_FOUND for unknown userId', async ({ context }) => {
    await expect(
      context.createCaller().users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000099' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('returns BAD_REQUEST when user email is already verified', async ({ context }) => {
    await createUser(context.db, {
      email: 'verified@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Verified User',
      role: 'sales',
    });

    await expect(
      context.createCaller().users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000010' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('sends mock verification email for unverified user', async ({ context }) => {
    await createUser(context.db, {
      email: 'unverified@example.com',
      emailVerified: false,
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Unverified User',
      role: 'sales',
    });

    await context.createCaller().users.sendVerificationEmail({
      userId: '00000000-0000-4000-8000-000000000011',
    });

    const messages = getMockEmailMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ to: 'unverified@example.com', type: 'email-verification' });
    expect(messages[0]?.url).toContain('/verify-email?token=');
  });
});

async function createUser(
  db: Db,
  input: {
    assistantEnabled?: boolean;
    contractingRole?: ContractingRole | null;
    email: string;
    emailVerified?: boolean;
    id: string;
    image?: string | null;
    name: string;
    phoneNumber?: string | null;
    role: EquipmentRole | string | null;
  },
) {
  const now = new Date();

  await db
    .insert(user)
    .values({
      assistantEnabled: input.assistantEnabled ?? false,
      contractingRole: input.contractingRole ?? null,
      email: input.email,
      emailVerified: input.emailVerified ?? true,
      id: input.id,
      image: input.image ?? null,
      name: input.name,
      phoneNumber: input.phoneNumber ?? null,
      role: input.role as EquipmentRole | null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
