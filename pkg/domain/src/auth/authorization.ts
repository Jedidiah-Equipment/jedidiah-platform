import type { AppPermission, AppRole, UserAccessSummary } from '@pkg/schema';

export const DEFAULT_APP_ROLE = 'sales' satisfies AppRole;

export const roleLabels = {
  admin: 'Administrator',
  'super-admin': 'Super Administrator',
  'bay-operator': 'Bay Operator',
  'job-viewer': 'Job Viewer',
  'procurement-manager': 'Procurement manager',
  sales: 'Sales',
  stores: 'Stores',
} as const satisfies Record<AppRole, string>;

export const roleDescriptions = {
  admin: 'Full workspace administration, including user management and cross-functional operations.',
  'super-admin': 'Administrator access plus exclusive Corrective Feedback review permissions.',
  'bay-operator': 'Shop-floor personnel record for Bay assignment; this role is not enabled for sign-in.',
  'job-viewer': 'Read-only access to production Jobs.',
  'procurement-manager': 'Manage procurement records and view production Jobs.',
  sales: 'Create, read, and update sales Quotes, and send assistant-authored email.',
  stores: 'Run physical stock flows without access to inventory costs.',
} as const satisfies Record<AppRole, string>;

export const permissionLabels = {
  'audit:read': 'View audit history',
  'customer:create': 'Create customers',
  'customer:read': 'View customers',
  'customer:update': 'Update customers',
  'email:send': 'Send email',
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
  'inventory:read': 'View inventory',
  'inventory:move': 'Move inventory',
  'inventory:adjust': 'Adjust inventory',
  'inventory:count': 'Count inventory',
  'inventory:build': 'Build inventory',
  'inventory:close-out': 'Close out inventory',
  'inventory_cost:read': 'View inventory costs',
  'inventory_cost:revalue': 'Revalue inventory',
  'product:create': 'Create products',
  'product:read': 'View products',
  'product:update': 'Update products',
  'product_range:create': 'Create product ranges',
  'product_range:read': 'View product ranges',
  'product_range:update': 'Update product ranges',
  'product_unit:read': 'View product units',
  'product_unit:update': 'Update product unit identity',
  'product_unit:transfer': 'Record product unit ownership transfers',
  'purchase_order:read': 'View purchase orders',
  'purchase_order:create': 'Create purchase orders',
  'purchase_order:send': 'Send purchase orders',
  'purchase_order:amend': 'Amend purchase orders',
  'purchase_order:receive': 'Receive purchase orders',
  'purchase_order:close': 'Close purchase orders',
  'quote:create': 'Create quotes',
  'quote:cancel': 'Cancel quotes',
  'quote:read': 'View quotes',
  'quote:update': 'Update quotes',
  'supplier:read': 'View suppliers',
  'supplier:update': 'Manage suppliers',
  'supplier:remove': 'Remove suppliers',
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
  'email:send': 'Send assistant-authored email to an explicitly chosen recipient.',
  'feedback:read': 'View all submitted Feedback records, including Corrective Feedback.',
  'feedback:update': 'Update any Feedback status and internal notes.',
  'part:read': 'View part records.',
  'part:update': 'Create and edit part records.',
  'job:create': 'Create new production jobs.',
  'job:read': 'View production jobs and their general feedback.',
  'job:schedule': 'Book, resize, and remove Bay Slots and manage Bay Calendar Exceptions.',
  'job:update': 'Update production job details and resolve general job feedback.',
  'job:update-calendar': 'Manage org-wide production Off-Days.',
  'job_bay:read': 'View durable production Bay configuration.',
  'job_bay:update': 'Create, rename, disable, and re-enable production Bays.',
  'inventory:read': 'View inventory quantities and movement history.',
  'inventory:move': 'Check stock out and record returns to Stores or suppliers.',
  'inventory:adjust': 'Post inventory quantity adjustments.',
  'inventory:count': 'Run stocktake sessions and post count results.',
  'inventory:build': 'Build finished Parts from component stock.',
  'inventory:close-out': 'Return Job leftovers and release remaining commitments.',
  'inventory_cost:read': 'View inventory costs and valuation data.',
  'inventory_cost:revalue': 'Revalue on-hand inventory.',
  'product:create': 'Add new product catalog records.',
  'product:read': 'View product catalog records.',
  'product:update': 'Edit existing product catalog records.',
  'product_range:create': 'Create new product catalog Range records.',
  'product_range:read': 'View the admin Product Range management list.',
  'product_range:update': 'Edit existing product catalog Range records.',
  'product_unit:read': 'View Product Units, their ownership history, and the Jobs that touched them.',
  'product_unit:update': "Edit a Product Unit's VIN, which identifies the machine for its whole life.",
  'product_unit:transfer':
    'Record an Ownership Transfer by hand, asserting who holds a machine with no Quote behind it.',
  'purchase_order:read': 'View supplier Purchase Orders.',
  'purchase_order:create': 'Create draft Purchase Orders.',
  'purchase_order:send': 'Send Purchase Orders to suppliers.',
  'purchase_order:amend': 'Amend Purchase Orders after they have been sent.',
  'purchase_order:receive': 'Receive stock against Purchase Orders.',
  'purchase_order:close': 'Close completed Purchase Orders.',
  'quote:create': 'Create new sales quotes.',
  'quote:cancel': 'Cancel locked quotes and cascade-cancel their job and future slots.',
  'quote:read': 'View sales quotes.',
  'quote:update': 'Update sales quote details and decisions.',
  'supplier:read': 'View supplier records.',
  'supplier:update': 'Create and edit supplier records.',
  'supplier:remove': 'Soft-delete supplier records.',
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
  email: ['send'],
  feedback: ['read', 'update'],
  job: ['read', 'create', 'update', 'schedule', 'update-calendar'],
  job_bay: ['read', 'update'],
  inventory: ['read', 'move', 'adjust', 'count', 'build', 'close-out'],
  inventory_cost: ['read', 'revalue'],
  part: ['read', 'update'],
  product: ['read', 'create', 'update'],
  product_range: ['read', 'create', 'update'],
  // No create action: Units are born from Job creation, never on their own.
  product_unit: ['read', 'update', 'transfer'],
  purchase_order: ['read', 'create', 'send', 'amend', 'receive', 'close'],
  quote: ['read', 'create', 'update', 'cancel'],
  supplier: ['read', 'update', 'remove'],
  user: ['list', 'create', 'update', 'set-email', 'set-role', 'set-password'],
} as const;

type AuthorizationResource = keyof typeof authorizationStatement;

type RoleAccess = Partial<{
  [Resource in AuthorizationResource]: readonly (typeof authorizationStatement)[Resource][number][];
}>;

const adminAccess = {
  audit: ['read'],
  customer: ['read', 'create', 'update'],
  email: ['send'],
  job: ['read', 'create', 'update', 'schedule', 'update-calendar'],
  job_bay: ['read', 'update'],
  inventory: ['read', 'move', 'adjust', 'count', 'build', 'close-out'],
  inventory_cost: ['read', 'revalue'],
  part: ['read', 'update'],
  product: ['read', 'create', 'update'],
  product_range: ['read', 'create', 'update'],
  product_unit: ['read', 'update', 'transfer'],
  purchase_order: ['read', 'create', 'send', 'amend', 'receive', 'close'],
  quote: ['read', 'create', 'update', 'cancel'],
  supplier: ['read', 'update', 'remove'],
  user: ['list', 'create', 'update', 'set-email', 'set-role', 'set-password'],
} as const satisfies RoleAccess;

// Invariants: `job:create` implies `job:schedule`, because creation schedules Bay seeds;
// `purchase_order:receive` implies posting receipt movements, so receiving is never paper-only.
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
    inventory: ['read', 'adjust'],
    inventory_cost: ['read', 'revalue'],
    job: ['read'],
    part: ['read', 'update'],
    product: ['read', 'create', 'update'],
    product_unit: ['read'],
    purchase_order: ['read', 'create', 'send', 'amend', 'receive', 'close'],
    supplier: ['read', 'update'],
  },
  'job-viewer': {
    job: ['read'],
    product_unit: ['read'],
  },
  sales: {
    email: ['send'],
    // Sales reads Units because stock has to be selectable on a Quote.
    product_unit: ['read'],
    quote: ['read', 'create', 'update'],
  },
  stores: {
    inventory: ['read', 'move', 'adjust', 'count', 'build', 'close-out'],
    purchase_order: ['read', 'receive'],
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
