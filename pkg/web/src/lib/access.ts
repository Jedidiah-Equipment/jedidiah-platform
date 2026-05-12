import type { AppPermission, UserAccessSummary } from "@pkg/schema";

export function canAccess(
  access: Pick<UserAccessSummary, "permissions"> | null | undefined,
  permission: AppPermission,
): boolean {
  return access?.permissions.includes(permission) ?? false;
}
