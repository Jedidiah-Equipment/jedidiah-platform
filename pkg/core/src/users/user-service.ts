import type { Database } from "@pkg/db";
import { user } from "@pkg/db/schema";
import {
  AppRole,
  DEFAULT_APP_ROLE,
  type UserListResult,
  type UserSetRoleInput,
  type UserSummary,
} from "@pkg/schema";
import { asc, eq } from "drizzle-orm";

import { CannotRemoveLastAdminError, UserNotFoundError } from "./user-errors.js";

type UserRow = Pick<typeof user.$inferSelect, "email" | "id" | "name" | "role">;

export function mapUser(row: UserRow): UserSummary {
  return {
    email: row.email,
    id: row.id,
    name: row.name,
    role: parseStoredAppRole(row.role),
  };
}

export async function listUsers(database: Database): Promise<UserListResult> {
  const rows = await database
    .select({
      email: user.email,
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

export async function setUserRole(
  database: Database,
  input: UserSetRoleInput,
): Promise<UserSummary> {
  return database.transaction(async (tx) => {
    await assertCanAssignRole(tx, input);

    const [row] = await tx
      .update(user)
      .set({
        role: input.role,
        updatedAt: new Date(),
      })
      .where(eq(user.id, input.userId))
      .returning({
        email: user.email,
        id: user.id,
        name: user.name,
        role: user.role,
      });

    if (!row) {
      throw new UserNotFoundError(input.userId);
    }

    return mapUser(row);
  });
}

function parseStoredAppRole(role: unknown): AppRole {
  const parsedRole = AppRole.safeParse(role);

  return parsedRole.success ? parsedRole.data : DEFAULT_APP_ROLE;
}

async function assertCanAssignRole(
  database: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: UserSetRoleInput,
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
