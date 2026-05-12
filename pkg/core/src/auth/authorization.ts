import {
  type AppPermission,
  type AppRole,
  AppRole as AppRoleSchema,
  type UserAccessSummary,
} from "@pkg/schema";

export const authorizationStatement = {
  product: ["read", "create", "update"],
  user: ["list", "edit"],
} as const;

type AuthorizationResource = keyof typeof authorizationStatement;
type RoleAccess = Partial<Record<AuthorizationResource, readonly string[]>>;

export const appRoleAccess = {
  admin: {
    product: ["read", "create", "update"],
    user: ["list", "edit"],
  },
  "product-editor": {
    product: ["read", "create", "update"],
  },
  "product-viewer": {
    product: ["read"],
  },
} as const satisfies Record<AppRole, RoleAccess>;

export function normalizeAppRoles(role: unknown): AppRole[] {
  if (Array.isArray(role)) {
    return uniqueRoles(role.flatMap((value) => normalizeAppRoles(value)));
  }

  if (typeof role !== "string") {
    return [];
  }

  return uniqueRoles(
    role
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is AppRole => AppRoleSchema.safeParse(value).success),
  );
}

export function getRolePermissions(roles: readonly AppRole[]): AppPermission[] {
  const permissions = new Set<AppPermission>();

  for (const role of roles) {
    for (const permission of flattenRolePermissions(role)) {
      permissions.add(permission);
    }
  }

  return [...permissions].sort();
}

export function createUserAccessSummary(input: {
  role: unknown;
  userId: string;
}): UserAccessSummary {
  const roles = normalizeAppRoles(input.role);
  const role = roles[0] ?? null;

  return {
    permissions: getRolePermissions(roles),
    role,
    userId: input.userId,
  };
}

export function hasPermission(
  access: Pick<UserAccessSummary, "permissions"> | null | undefined,
  permission: AppPermission,
): boolean {
  return access?.permissions.includes(permission) ?? false;
}

function flattenRolePermissions(role: AppRole): AppPermission[] {
  const roleAccess = appRoleAccess[role];
  const permissions: AppPermission[] = [];

  for (const [resource, actions] of Object.entries(roleAccess) as [
    AuthorizationResource,
    readonly string[],
  ][]) {
    for (const action of actions) {
      permissions.push(`${resource}:${action}` as AppPermission);
    }
  }

  return permissions;
}

function uniqueRoles(roles: readonly AppRole[]): AppRole[] {
  return [...new Set(roles)];
}
