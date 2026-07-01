import type { AppPermission, AppRole, UserAccessSummary } from '@pkg/schema';

export const DEFAULT_APP_ROLE = 'sales' satisfies AppRole;

export const roleLabels = {
  admin: 'Administrator',
  'super-admin': 'Super Administrator',
  'bay-operator': 'Bay Operator',
  'job-viewer': 'Job Viewer',
  'procurement-manager': 'Procurement manager',
  sales: 'Sales',
} as const satisfies Record<AppRole, string>;

export const roleDescriptions = {
  admin: 'Full workspace administration, including user management and cross-functional operations.',
  'super-admin': 'Administrator access plus exclusive Feedback review permissions.',
  'bay-operator': 'Shop-floor personnel record for Bay assignment; this role is not enabled for sign-in.',
  'job-viewer': 'Read-only access to production Jobs.',
  'procurement-manager': 'Manage procurement records and view production Jobs.',
  sales: 'Create, read, and update sales Quotes.',
} as const satisfies Record<AppRole, string>;

export const permissionLabels = {
  'audit:read': 'View audit history',
  'customer:create': 'Create customers',
  'customer:read': 'View customers',
  'customer:update': 'Update customers',
  'feedback:read': 'View feedback',
  'feedback:update': 'Manage feedback',
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
  'product_range:create': 'Create product ranges',
  'product_range:read': 'View product ranges',
  'product_range:update': 'Update product ranges',
  'quote:create': 'Create quotes',
  'quote:read': 'View quotes',
  'quote:update': 'Update quotes',
  'supplier:read': 'View suppliers',
  'supplier:update': 'Manage suppliers',
  'user:create': 'Add users',
  'user:list': 'View users',
  'user:set-email': 'Change user emails',
  'user:set-password': 'Reset user passwords',
  'user:set-role': 'Change user roles',
  'user:update': 'Update user details',
} as const satisfies Record<AppPermission, string>;

export const permissionDescriptions = {
  'audit:read': 'View audit events across workspace records.',
  'customer:create': 'Add new customer directory records.',
  'customer:read': 'View customer directory records.',
  'customer:update': 'Edit existing customer directory records.',
  'feedback:read': 'View submitted Feedback records.',
  'feedback:update': 'Update Feedback status and internal notes.',
  'part:read': 'View part records.',
  'part:update': 'Create and edit part records.',
  'job:create': 'Create new production jobs.',
  'job:read': 'View production jobs.',
  'job:schedule': 'Book, resize, and remove Bay Slots and manage Bay Calendar Exceptions.',
  'job:update': 'Update production job details.',
  'job:update-calendar': 'Manage org-wide production Off-Days.',
  'job_bay:read': 'View durable production Bay configuration.',
  'job_bay:update': 'Create, rename, disable, and re-enable production Bays.',
  'product:create': 'Add new product catalog records.',
  'product:read': 'View product catalog records.',
  'product:update': 'Edit existing product catalog records.',
  'product_range:create': 'Create new product catalog Range records.',
  'product_range:read': 'View the admin Product Range management list.',
  'product_range:update': 'Edit existing product catalog Range records.',
  'quote:create': 'Create new sales quotes.',
  'quote:read': 'View sales quotes.',
  'quote:update': 'Update sales quote details and decisions.',
  'supplier:read': 'View supplier records.',
  'supplier:update': 'Create and edit supplier records.',
  'user:create': 'Add new application users.',
  'user:list': 'View application users.',
  'user:set-email': 'Change application user email addresses and verification state.',
  'user:set-password': 'Reset passwords for application users.',
  'user:set-role': 'Change application user roles.',
  'user:update': 'Update application user details.',
} as const satisfies Record<AppPermission, string>;

export const authorizationStatement = {
  audit: ['read'],
  customer: ['read', 'create', 'update'],
  feedback: ['read', 'update'],
  job: ['read', 'create', 'update', 'schedule', 'update-calendar'],
  job_bay: ['read', 'update'],
  part: ['read', 'update'],
  product: ['read', 'create', 'update'],
  product_range: ['read', 'create', 'update'],
  quote: ['read', 'create', 'update'],
  supplier: ['read', 'update'],
  user: ['list', 'create', 'update', 'set-email', 'set-role', 'set-password'],
} as const;

type AuthorizationResource = keyof typeof authorizationStatement;

type RoleAccess = Partial<{
  [Resource in AuthorizationResource]: readonly (typeof authorizationStatement)[Resource][number][];
}>;

const adminAccess = {
  audit: ['read'],
  customer: ['read', 'create', 'update'],
  job: ['read', 'create', 'update', 'schedule', 'update-calendar'],
  job_bay: ['read', 'update'],
  part: ['read', 'update'],
  product: ['read', 'create', 'update'],
  product_range: ['read', 'create', 'update'],
  quote: ['read', 'create', 'update'],
  supplier: ['read', 'update'],
  user: ['list', 'create', 'update', 'set-email', 'set-role', 'set-password'],
} as const satisfies RoleAccess;

// Invariant: any role granted `job:create` must also hold `job:schedule` — creating a
// Job inherently schedules its Bay seeds (picked start dates, ghost previews), so the
// create surfaces assume scheduling authority rather than gating seed dates separately.
export const appRoleAccess = {
  admin: adminAccess,
  // super-admin is admin plus exclusive Feedback review. Composed by spread so the two can never
  // drift: any permission added to admin is inherited here, while feedback stays admin-exclusive.
  // This is still a fully explicit static declaration (resolved at module load), not the runtime
  // role inheritance ADR 0001 rules out.
  'super-admin': {
    ...adminAccess,
    feedback: ['read', 'update'],
  },
  'procurement-manager': {
    customer: ['read', 'create', 'update'],
    job: ['read'],
    part: ['read', 'update'],
    product: ['read', 'create', 'update'],
    supplier: ['read', 'update'],
  },
  'job-viewer': {
    job: ['read'],
  },
  sales: {
    quote: ['read', 'create', 'update'],
  },
  'bay-operator': {},
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

export function isPermissionSetSignInEligible(permissions: readonly AppPermission[]): boolean {
  return permissions.length > 0;
}

export function isRoleSignInEligible(role: AppRole): boolean {
  return isPermissionSetSignInEligible(getRolePermissions(role));
}

export function createUserAccessSummary(input: { role: AppRole; userId: string }): UserAccessSummary {
  return {
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
