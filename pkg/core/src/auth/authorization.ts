import {
  type AppPermission,
  type AppRole,
  AppRole as AppRoleSchema,
  type UserAccessSummary,
} from "@pkg/schema";

export const authorizationStatement = {
  audit: ["read"],
  product: ["read", "create", "update"],
  user: ["list", "create", "update", "set-role", "set-password"],
} as const;

type AuthorizationResource = keyof typeof authorizationStatement;
type RoleAccess = Partial<Record<AuthorizationResource, readonly string[]>>;

export const appRoleAccess = {
  admin: {
    audit: ["read"],
    product: ["read", "create", "update"],
    user: ["list", "create", "update", "set-role", "set-password"],
  },
  "product-editor": {
    product: ["read", "create", "update"],
  },
  "product-viewer": {
    product: ["read"],
  },
} as const satisfies Record<AppRole, RoleAccess>;

const publicRolePriority = [
  "admin",
  "product-editor",
  "product-viewer",
] as const satisfies AppRole[];

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
  const role = getPublicRole(roles);

  return {
    permissions: getRolePermissions(roles),
    role,
    userId: input.userId,
  };
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

function getPublicRole(roles: readonly AppRole[]): AppRole | null {
  for (const role of publicRolePriority) {
    if (roles.includes(role)) {
      return role;
    }
  }

  return null;
}
