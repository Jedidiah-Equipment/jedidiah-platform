import { type Db, user } from '@pkg/db';
import type { AppRole } from '@pkg/schema';

export async function createActorUser(db: Db, role: AppRole = 'admin') {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role,
    updatedAt: now,
  });
}
