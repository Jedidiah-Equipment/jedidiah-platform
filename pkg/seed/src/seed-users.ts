import { pathToFileURL } from 'node:url';
import './load-write-env.js';
import { account, closeDatabaseConnection, type Db, db, user, userDepartment } from '@pkg/db';
import { demoUsers } from '@pkg/domain';
import { hashPassword } from 'better-auth/crypto';
import { eq, or } from 'drizzle-orm';

export async function seedDemoUsers(database?: Db): Promise<void> {
  const activeDb = database ?? db;

  for (const demoUser of demoUsers) {
    const existingUsers = await activeDb
      .select({ id: user.id })
      .from(user)
      .where(or(eq(user.id, demoUser.id), eq(user.email, demoUser.email)))
      .limit(1);

    if (existingUsers.length > 0) {
      console.info(`[seed:users] Skipped existing demo user ${demoUser.email}`);
      continue;
    }

    const now = new Date();

    await activeDb.transaction(async (tx) => {
      await tx.insert(user).values({
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        emailVerified: true,
        image: null,
        role: demoUser.role,
        assistantEnabled: demoUser.role === 'admin' || demoUser.role === 'super-admin',
        banned: false,
        banReason: null,
        banExpires: null,
        createdAt: now,
        updatedAt: now,
      });

      if (demoUser.departments.length > 0) {
        await tx.insert(userDepartment).values(
          demoUser.departments.map((department) => ({
            department,
            userId: demoUser.id,
          })),
        );
      }

      await tx.insert(account).values({
        id: `${demoUser.id}-credential-account`,
        userId: demoUser.id,
        accountId: demoUser.id,
        providerId: 'credential',
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        idToken: null,
        password: await hashPassword(demoUser.password),
        createdAt: now,
        updatedAt: now,
      });
    });

    console.info(`[seed:users] Created demo user ${demoUser.email}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await seedDemoUsers();
  } finally {
    await closeDatabaseConnection();
  }
}
