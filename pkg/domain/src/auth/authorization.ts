import {
  APP_ROLES,
  type AppPermission,
  type AppRole,
  AppRole as AppRoleSchema,
  DEPARTMENTS,
  type Department,
  Department as DepartmentSchema,
  type UserAccessSummary,
} from '@pkg/schema';

export const DEFAULT_APP_ROLE = 'product-viewer' satisfies AppRole;

// Only Job access can depend on department memberships, so request access summaries use this set
// to avoid reading user_department for roles whose authorization cannot be department-scoped.
export const DEPARTMENT_AWARE_ROLES = new Set<AppRole>(['job-stage-editor', 'job-supervisor', 'job-viewer']);

export const authorizationStatement = {
  audit: ['read'],
  job: ['read', 'create', 'update'],
  'job-stage': ['read', 'update'],
  product: ['read', 'create', 'update'],
  user: ['list', 'create', 'update', 'set-role', 'set-password', 'assign-departments'],
} as const;

type AuthorizationResource = keyof typeof authorizationStatement;
type RoleAccess = Partial<{
  [Resource in AuthorizationResource]: readonly (typeof authorizationStatement)[Resource][number][];
}>;

export const appRoleAccess = {
  admin: {
    audit: ['read'],
    job: ['read', 'create', 'update'],
    'job-stage': ['read', 'update'],
    product: ['read', 'create', 'update'],
    user: ['list', 'create', 'update', 'set-role', 'set-password', 'assign-departments'],
  },
  'product-editor': {
    product: ['read', 'create', 'update'],
  },
  'product-viewer': {
    product: ['read'],
  },
  'job-supervisor': {
    job: ['read', 'create', 'update'],
    'job-stage': ['read', 'update'],
  },
  'job-stage-editor': {
    job: ['read'],
    'job-stage': ['read', 'update'],
  },
  'job-viewer': {
    job: ['read'],
    'job-stage': ['read'],
  },
} as const satisfies Record<AppRole, RoleAccess>;

export function hasPermission(
  access: Pick<UserAccessSummary, 'permissions'> | null | undefined,
  permission: AppPermission,
): boolean {
  return access?.permissions.includes(permission) ?? false;
}

export function normalizeAppRoles(role: unknown): AppRole[] {
  if (Array.isArray(role)) {
    return uniqueRoles(role.flatMap((value) => normalizeAppRoles(value)));
  }

  if (typeof role !== 'string') {
    return [];
  }

  return uniqueRoles(
    role
      .split(',')
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
  departments?: readonly unknown[];
  role: unknown;
  userId: string;
}): UserAccessSummary {
  const roles = normalizeAppRoles(input.role);
  const role = getPublicRole(roles);

  return {
    departments: sortDepartments(input.departments ?? []),
    permissions: getRolePermissions(roles),
    role,
    userId: input.userId,
  };
}

function flattenRolePermissions(role: AppRole): AppPermission[] {
  const roleAccess = appRoleAccess[role];
  const permissions: AppPermission[] = [];

  for (const [resource, actions] of Object.entries(roleAccess) as [
    keyof typeof authorizationStatement,
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

export function sortDepartments(departments: readonly unknown[]): Department[] {
  // Ignore unknown stored values so stale DB text does not break access-summary reads.
  const selectedDepartments = new Set(
    departments.filter((value): value is Department => DepartmentSchema.safeParse(value).success),
  );

  return DEPARTMENTS.filter((department) => selectedDepartments.has(department));
}

const publicRolePriority = APP_ROLES;

function getPublicRole(roles: readonly AppRole[]): AppRole | null {
  for (const role of publicRolePriority) {
    if (roles.includes(role)) {
      return role;
    }
  }

  return null;
}
