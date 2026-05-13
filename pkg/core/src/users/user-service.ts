import type { Database } from "@pkg/db";
import { isUniqueViolation } from "@pkg/db/query-utils";
import { user } from "@pkg/db/schema";
import {
  AppRole,
  DEFAULT_APP_ROLE,
  type UserListResult,
  type UserSummary,
  type UserUpdateInput,
} from "@pkg/schema";
import { asc, eq } from "drizzle-orm";

import {
  CannotRemoveLastAdminError,
  EmailAlreadyInUseError,
  UserNotFoundError,
} from "./user-errors.js";

type UserRow = Pick<typeof user.$inferSelect, "email" | "emailVerified" | "id" | "name"> & {
  role?: unknown;
};

export function mapUser(row: UserRow): UserSummary {
  return {
    email: row.email,
    emailVerified: row.emailVerified,
    id: row.id,
    name: row.name,
    role: parseStoredAppRole(row.role),
  };
}

export async function listUsers(database: Database): Promise<UserListResult> {
  const rows = await database
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .orderBy(asc(user.email));

  return {
    users: rows.map(mapUser),
  };
}

export async function updateUser(database: Database, input: UserUpdateInput): Promise<UserSummary> {
  try {
    return await database.transaction(async (tx) => {
      const [existingUser] = await tx
        .select({
          id: user.id,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, input.userId))
        .for("update");

      if (!existingUser) {
        throw new UserNotFoundError(input.userId);
      }

      if (parseStoredAppRole(existingUser.role) !== input.role) {
        await assertCanAssignRole(tx, input);
      }

      const [row] = await tx
        .update(user)
        .set({
          email: input.email,
          emailVerified: input.emailVerified,
          name: input.name,
          role: input.role,
          updatedAt: new Date(),
        })
        .where(eq(user.id, input.userId))
        .returning({
          email: user.email,
          emailVerified: user.emailVerified,
          id: user.id,
          name: user.name,
          role: user.role,
        });

      if (!row) {
        throw new UserNotFoundError(input.userId);
      }

      return mapUser(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EmailAlreadyInUseError(input.email);
    }

    throw error;
  }
}

function parseStoredAppRole(role: unknown): AppRole {
  const parsedRole = AppRole.safeParse(role);

  return parsedRole.success ? parsedRole.data : DEFAULT_APP_ROLE;
}

async function assertCanAssignRole(
  database: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: Pick<UserUpdateInput, "role" | "userId">,
): Promise<void> {
  if (input.role === "admin") {
    return;
  }

  const adminRows = await database
    .select({
      id: user.id,
    })
    .from(user)
    .where(eq(user.role, "admin"))
    .orderBy(asc(user.id))
    .for("update");

  if (adminRows.length <= 1 && adminRows.some((adminUser) => adminUser.id === input.userId)) {
    throw new CannotRemoveLastAdminError();
  }
}
