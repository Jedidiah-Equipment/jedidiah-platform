import type { AppPermission, AppRole, Department, UserAccessSummary } from '@pkg/schema';

export const DEFAULT_APP_ROLE = 'sales' satisfies AppRole;

// Only Job access can depend on department memberships, so request access summaries use this set
// to avoid reading user_department for roles whose authorization cannot be department-scoped.
export const DEPARTMENT_AWARE_ROLES = new Set<AppRole>(['job-department-manager']);

export const roleLabels = {
  admin: 'Administrator',
  'job-department-manager': 'Job Department Manager',
  'procurement-manager': 'Procurement manager',
  sales: 'Sales',
} as const satisfies Record<AppRole, string>;

export const permissionLabels = {
  'audit:read': 'View audit history',
  'customer:create': 'Create customers',
  'customer:read': 'View customers',
  'customer:update': 'Update customers',
  'part:read': 'View parts',
  'part:update': 'Manage parts',
  'job:create': 'Create jobs',
  'job:read': 'View jobs',
  'job:schedule': 'Schedule jobs',
  'job:update': 'Update jobs',
  'job:update-calendar': 'Manage job calendar',
  'job_bay:read': 'View Bays',
  'job_bay:update': 'Manage Bays',
  'product:create': 'Create products',
  'product:read': 'View products',
  'product:update': 'Update products',
  'quote:create': 'Create quotes',
  'quote:read': 'View quotes',
  'quote:update': 'Update quotes',
  'supplier:read': 'View suppliers',
  'supplier:update': 'Manage suppliers',
  'user:assign-departments': 'Assign departments',
  'user:create': 'Add users',
  'user:list': 'View users',
  'user:set-password': 'Reset user passwords',
  'user:set-role': 'Change user roles',
  'user:update': 'Update user details',
} as const satisfies Record<AppPermission, string>;

export const permissionDescriptions = {
  'audit:read': 'View audit events across workspace records.',
  'customer:create': 'Add new customer directory records.',
  'customer:read': 'View customer directory records.',
  'customer:update': 'Edit existing customer directory records.',
  'part:read': 'View part records.',
  'part:update': 'Create and edit part records.',
  'job:create': 'Create new production jobs.',
  'job:read': 'View production jobs.',
  'job:schedule': 'Book, resize, and remove Bay Slots and manage Bay Calendar Exceptions in Department scope.',
  'job:update': 'Update production job details.',
  'job:update-calendar': 'Manage org-wide production Off-Days.',
  'job_bay:read': 'View durable production Bay configuration.',
  'job_bay:update': 'Create, rename, disable, and re-enable production Bays.',
  'product:create': 'Add new product catalog records.',
  'product:read': 'View product catalog records.',
  'product:update': 'Edit existing product catalog records.',
  'quote:create': 'Create new sales quotes.',
  'quote:read': 'View sales quotes.',
  'quote:update': 'Update sales quote details and decisions.',
  'supplier:read': 'View supplier records.',
  'supplier:update': 'Create and edit supplier records.',
  'user:assign-departments': "Manage a user's department access.",
  'user:create': 'Add new application users.',
  'user:list': 'View application users.',
  'user:set-password': 'Reset passwords for application users.',
  'user:set-role': 'Change application user roles.',
  'user:update': 'Update application user details.',
} as const satisfies Record<AppPermission, string>;

export const authorizationStatement = {
  audit: ['read'],
  customer: ['read', 'create', 'update'],
  job: ['read', 'create', 'update', 'schedule', 'update-calendar'],
  job_bay: ['read', 'update'],
  part: ['read', 'update'],
  product: ['read', 'create', 'update'],
  quote: ['read', 'create', 'update'],
  supplier: ['read', 'update'],
  user: ['list', 'create', 'update', 'set-role', 'set-password', 'assign-departments'],
} as const;

type AuthorizationResource = keyof typeof authorizationStatement;

type RoleAccess = Partial<{
  [Resource in AuthorizationResource]: readonly (typeof authorizationStatement)[Resource][number][];
}>;

export const appRoleAccess = {
  admin: {
    audit: ['read'],
    customer: ['read', 'create', 'update'],
    job: ['read', 'create', 'update', 'schedule', 'update-calendar'],
    job_bay: ['read', 'update'],
    part: ['read', 'update'],
    product: ['read', 'create', 'update'],
    quote: ['read', 'create', 'update'],
    supplier: ['read', 'update'],
    user: ['list', 'create', 'update', 'set-role', 'set-password', 'assign-departments'],
  },
  'procurement-manager': {
    customer: ['read', 'create', 'update'],
    job: ['read'],
    part: ['read', 'update'],
    product: ['read', 'create', 'update'],
    supplier: ['read', 'update'],
  },
  'job-department-manager': {
    job: ['read', 'schedule'],
  },
  sales: {
    quote: ['read', 'create', 'update'],
  },
} as const satisfies Record<AppRole, RoleAccess>;

export function hasPermission(
  access: Pick<UserAccessSummary, 'permissions'> | null | undefined,
  permission: AppPermission,
): boolean {
  return access?.permissions.includes(permission) ?? false;
}

export function getRolePermissions(role: AppRole): AppPermission[] {
  const permissions = new Set<AppPermission>();

  for (const permission of flattenRolePermissions(role)) {
    permissions.add(permission);
  }

  return [...permissions].sort();
}

export function createUserAccessSummary(input: {
  departments?: readonly Department[];
  role: AppRole;
  userId: string;
}): UserAccessSummary {
  return {
    departments: [...(input.departments ?? [])],
    permissions: getRolePermissions(input.role),
    role: input.role,
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

export function canViewJob(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'job:read');
}

export function canScheduleBay(access: UserAccessSummary | null | undefined, department: Department): boolean {
  return hasPermission(access, 'job:schedule') && canAccessDepartment(access, department);
}

export function canViewQuote(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'quote:read');
}

export function canCreateQuote(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'quote:create');
}

export function canEditQuote(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'quote:update');
}

function canAccessDepartment(access: UserAccessSummary | null | undefined, department: Department): boolean {
  if (!access) return false;

  // For department-aware roles, an empty department list intentionally means unscoped scheduling.
  if (access.departments.length === 0) return true;

  return access.departments.includes(department);
}
