import type { Database } from "@pkg/db";
import { user } from "@pkg/db/schema";
import { AppRole, type UserListResult, type UserSetRoleInput, type UserSummary } from "@pkg/schema";
import { asc, eq } from "drizzle-orm";

import { UserNotFoundError } from "./user-errors.js";

type UserRow = Pick<typeof user.$inferSelect, "email" | "id" | "name" | "role">;

export function mapUser(row: UserRow): UserSummary {
  return {
    email: row.email,
    id: row.id,
    name: row.name,
    role: AppRole.parse(row.role),
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
  const [row] = await database
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
}
