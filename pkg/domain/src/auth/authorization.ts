import { type AppPermission, type AppRole, ContractingRole, EquipmentRole, type UserAccessSummary } from '@pkg/schema';

export const DEFAULT_APP_ROLE = 'sales' satisfies AppRole;

export const roleLabels = {
  admin: 'Administrator',
  'super-admin': 'Super Administrator',
  'bay-operator': 'Bay Operator',
  'job-manager': 'Job Manager',
  'job-viewer': 'Job Viewer',
  'procurement-manager': 'Procurement manager',
  sales: 'Sales',
  stores: 'Stores',
  'contracting-admin': 'Contracting Administrator',
  'contracting-manager': 'Contracting Manager',
  'workshop-manager': 'Workshop Manager',
  foreman: 'Foreman',
  'contracting-invoicing': 'Contracting Invoicing',
  driver: 'Driver',
  mechanic: 'Mechanic',
} as const satisfies Record<AppRole, string>;

export const roleDescriptions = {
  admin: 'Full workspace administration, including user management and cross-functional operations.',
  'super-admin': 'Administrator access plus exclusive Corrective Feedback review permissions.',
  'bay-operator': 'Shop-floor personnel record for Bay assignment; this role is not enabled for sign-in.',
  'job-manager': 'View and update production Jobs.',
  'job-viewer': 'Read-only access to production Jobs.',
  'procurement-manager': 'Manage procurement records and sales Quotes, and view production Jobs.',
  sales: 'Create, read, and update sales Quotes, and send assistant-authored email.',
  stores: 'Run physical stock flows without access to inventory costs.',
  'contracting-admin': 'Full Contracting access, without user administration or Equipment access.',
  'contracting-manager': 'Run Contracting operations and see amounts, without pricing or preset rates.',
  'workshop-manager': 'Read Contracting operations and manage breakdowns and servicing.',
  foreman: 'Run assigned jobs, capture readings, and report breakdowns without seeing money.',
  'contracting-invoicing': 'Read completed or priced Job Cards and stamp invoice numbers.',
  driver: 'Non-login Contracting personnel record available to assignment pickers.',
  mechanic: 'Non-login Contracting personnel record available to workshop pickers.',
} as const satisfies Record<AppRole, string>;

export const permissionLabels = {
  'equipment_audit:read': 'View audit history',
  'equipment_customer:create': 'Create customers',
  'equipment_customer:read': 'View customers',
  'equipment_customer:remove': 'Remove customers',
  'equipment_customer:update': 'Update customers',
  'equipment_email:send': 'Send email',
  'equipment_feedback:read': 'View feedback',
  'equipment_feedback:update': 'Manage feedback',
  'equipment_part:read': 'View parts',
  'equipment_part:update': 'Manage parts',
  'equipment_job:cancel': 'Cancel jobs',
  'equipment_job:create': 'Create jobs',
  'equipment_job:read': 'View jobs',
  'equipment_job:schedule': 'Schedule jobs',
  'equipment_job:update': 'Update jobs',
  'equipment_job:update-calendar': 'Manage job calendar',
  'equipment_job_bay:read': 'View Bays',
  'equipment_job_bay:update': 'Manage Bays',
  'equipment_job_metrics:read': 'View build-time metrics',
  'equipment_inventory:read': 'View inventory',
  'equipment_inventory:move': 'Move inventory',
  'equipment_inventory:adjust': 'Adjust inventory',
  'equipment_inventory:count': 'Count inventory',
  'equipment_inventory:build': 'Build inventory',
  'equipment_inventory:close-out': 'Close out inventory',
  'equipment_inventory_cost:read': 'View inventory costs',
  'equipment_inventory_cost:revalue': 'Revalue inventory',
  'equipment_product:create': 'Create products',
  'equipment_product:read': 'View products',
  'equipment_product:update': 'Update products',
  'equipment_product_range:create': 'Create product ranges',
  'equipment_product_range:read': 'View product ranges',
  'equipment_product_range:update': 'Update product ranges',
  'equipment_product_unit:read': 'View product units',
  'equipment_product_unit:update': 'Update product unit identity',
  'equipment_product_unit:transfer': 'Record product unit ownership transfers',
  'equipment_product_unit:reassign': 'Reassign product units between deals',
  'equipment_product_unit:remove': 'Remove product units',
  'equipment_purchase_order:read': 'View purchase orders',
  'equipment_purchase_order:create': 'Create purchase orders',
  'equipment_purchase_order:approve': 'Approve purchase orders',
  'equipment_purchase_order:send': 'Send purchase orders',
  'equipment_purchase_order:amend': 'Amend purchase orders',
  'equipment_purchase_order:receive': 'Receive purchase orders',
  'equipment_purchase_order:close': 'Close purchase orders',
  'equipment_quote:create': 'Create quotes',
  'equipment_quote:cancel': 'Cancel quotes',
  'equipment_quote:read': 'View quotes',
  'equipment_quote:update': 'Update quotes',
  'equipment_supplier:read': 'View suppliers',
  'equipment_supplier:update': 'Manage suppliers',
  'equipment_supplier:remove': 'Remove suppliers',
  'equipment_supplier:merge': 'Merge suppliers',
  'contracting_job:read': 'View all Contracting jobs',
  'contracting_job:read-own': 'View assigned Contracting jobs',
  'contracting_job:read-priced': 'View completed and priced Contracting Job Cards',
  'contracting_job:create': 'Create Contracting jobs',
  'contracting_job:update': 'Update Contracting jobs',
  'contracting_job:assign': 'Assign Contracting jobs and machines',
  'contracting_job:complete': 'Complete Contracting jobs',
  'contracting_job:cancel': 'Cancel Contracting jobs',
  'contracting_job:price': 'Price Contracting jobs',
  'contracting_assignment:update-own': 'Manage own machine assignments',
  'contracting_invoice:update': 'Stamp Contracting invoice numbers',
  'contracting_machine:read': 'View Contracting fleet',
  'contracting_machine:update': 'Manage Contracting fleet',
  'contracting_reading:capture': 'Capture machine hour readings',
  'contracting_reading:update': 'Amend machine hour readings',
  'contracting_gap:resolve': 'Resolve machine hour gaps',
  'contracting_breakdown:read': 'View breakdowns',
  'contracting_breakdown:report': 'Report breakdowns',
  'contracting_breakdown:update': 'Manage breakdowns',
  'contracting_service:read': 'View service records',
  'contracting_service:update': 'Manage service records',
  'contracting_rate:read': 'View preset rates',
  'contracting_rate:update': 'Manage preset rates',
  'contracting_report:read': 'View Contracting reports',
  'user:create': 'Add users',
  'user:list': 'View users',
  'user:set-email': 'Change user emails',
  'user:set-password': 'Reset user passwords',
  'user:set-role': 'Change user roles',
  'user:update': 'Update user details',
} as const satisfies Record<AppPermission, string>;

export const permissionDescriptions = {
  'equipment_audit:read': 'View audit events across workspace records.',
  'equipment_customer:create': 'Add new customer directory records.',
  'equipment_customer:read': 'View customer directory records.',
  'equipment_customer:remove': 'Permanently remove unreferenced customer directory records.',
  'equipment_customer:update': 'Edit existing customer directory records.',
  'equipment_email:send': 'Send assistant-authored email to an explicitly chosen recipient.',
  'equipment_feedback:read': 'View all submitted Feedback records, including Corrective Feedback.',
  'equipment_feedback:update': 'Update any Feedback status and internal notes.',
  'equipment_part:read': 'View part records.',
  'equipment_part:update': 'Create and edit part records.',
  'equipment_job:cancel': 'Cancel a job outright and remove its future slots, without touching its quote.',
  'equipment_job:create': 'Create new production jobs.',
  'equipment_job:read': 'View production jobs and their general feedback.',
  'equipment_job:schedule': 'Book, resize, and remove Bay Slots and manage Bay Calendar Exceptions.',
  'equipment_job:update': 'Update production job details and resolve general job feedback.',
  'equipment_job:update-calendar': 'Manage org-wide production Off-Days.',
  'equipment_job_bay:read': 'View durable production Bay configuration.',
  'equipment_job_bay:update': 'Create, rename, disable, re-enable, and delete production Bays.',
  'equipment_job_metrics:read':
    'View per-product department build-time averages and the per-person ranking. Performance data about named people, so it sits apart from cost and day-to-day job access.',
  'equipment_inventory:read': 'View inventory quantities and movement history.',
  'equipment_inventory:move': 'Check stock out, return it to stock, or return it to a supplier.',
  'equipment_inventory:adjust': 'Post inventory quantity adjustments.',
  'equipment_inventory:count': 'Run stocktake sessions and post count results.',
  'equipment_inventory:build': 'Build finished Parts from component stock.',
  'equipment_inventory:close-out': 'Return Job leftovers and release remaining commitments.',
  'equipment_inventory_cost:read': 'View inventory costs and valuation data.',
  'equipment_inventory_cost:revalue': 'Revalue on-hand inventory.',
  'equipment_product:create': 'Add new product catalog records.',
  'equipment_product:read': 'View product catalog records.',
  'equipment_product:update': 'Edit existing product catalog records.',
  'equipment_product_range:create': 'Create new product catalog Range records.',
  'equipment_product_range:read': 'View the admin Product Range management list.',
  'equipment_product_range:update': 'Edit existing product catalog Range records.',
  'equipment_product_unit:read': 'View Product Units, their ownership history, and the Jobs that touched them.',
  'equipment_product_unit:update': "Edit a Product Unit's VIN, which identifies the machine for its whole life.",
  'equipment_product_unit:transfer':
    'Record an Ownership Transfer by hand, asserting who holds a machine with no Quote behind it.',
  'equipment_product_unit:reassign':
    "Move an un-invoiced Unit and its build Job to another accepted deal, displacing that deal's current Unit back to Stock.",
  'equipment_product_unit:remove':
    'Delete a Product Unit that was never built, once every Job on it is cancelled and nobody owns it.',
  'equipment_purchase_order:read': 'View supplier Purchase Orders.',
  'equipment_purchase_order:create': 'Create draft Purchase Orders.',
  'equipment_purchase_order:approve': 'Approve draft Purchase Orders for sending.',
  'equipment_purchase_order:send': 'Send approved Purchase Orders to suppliers.',
  'equipment_purchase_order:amend': 'Amend Purchase Orders after they have been sent.',
  'equipment_purchase_order:receive': 'Receive stock against Purchase Orders.',
  'equipment_purchase_order:close': 'Close completed Purchase Orders.',
  'equipment_quote:create': 'Create new sales quotes.',
  'equipment_quote:cancel': 'Cancel locked quotes and cascade-cancel their job and future slots.',
  'equipment_quote:read': 'View sales quotes.',
  'equipment_quote:update': 'Update sales quote details and decisions.',
  'equipment_supplier:read': 'View supplier records.',
  'equipment_supplier:update': 'Create and edit supplier records.',
  'equipment_supplier:remove': 'Soft-delete supplier records.',
  'equipment_supplier:merge': 'Merge a duplicate supplier into another, moving its parts and purchase orders.',
  'contracting_job:read': 'View every Contracting Job and its amounts.',
  'contracting_job:read-own': 'View Contracting Jobs assigned to the signed-in Foreman, without money.',
  'contracting_job:read-priced': 'View completed and priced Contracting Job Cards for invoicing.',
  'contracting_job:create': 'Create upcoming Contracting Jobs.',
  'contracting_job:update': 'Edit Contracting Job details and operational records.',
  'contracting_job:assign': 'Assign Foremen, Machines, Drivers, and Implements to Contracting Jobs.',
  'contracting_job:complete': 'Sign off and complete Contracting Jobs.',
  'contracting_job:cancel': 'Cancel Contracting Jobs before pricing.',
  'contracting_job:price': 'Apply rates and freeze priced Contracting Job amounts.',
  'contracting_assignment:update-own':
    'Start, update, and finish machine assignments on Contracting Jobs assigned to the signed-in Foreman.',
  'contracting_invoice:update': 'Stamp the external invoice number on a priced Contracting Job.',
  'contracting_machine:read': 'View the Contracting fleet and availability.',
  'contracting_machine:update': 'Create, edit, and retire Contracting fleet records.',
  'contracting_reading:capture': 'Capture arrival, departure, and spot hour readings.',
  'contracting_reading:update': 'Amend captured hour readings with a reason.',
  'contracting_gap:resolve': 'Split and resolve flagged machine-hour gaps.',
  'contracting_breakdown:read': 'View Contracting breakdown reports and notes.',
  'contracting_breakdown:report': 'Report a Contracting machine breakdown.',
  'contracting_breakdown:update': 'Assign mechanics and transition Contracting breakdowns.',
  'contracting_service:read': 'View Contracting service records and due state.',
  'contracting_service:update': 'Record services and manage service intervals.',
  'contracting_rate:read': 'View Contracting preset rates.',
  'contracting_rate:update': 'Create and edit Contracting preset rates.',
  'contracting_report:read': 'View Contracting utilisation and mechanic-performance reports.',
  'user:create': 'Add new application users.',
  'user:list': 'View application users.',
  'user:set-email': 'Change application user email addresses and verification state.',
  'user:set-password': 'Reset passwords for application users.',
  'user:set-role': 'Change application user roles.',
  'user:update': 'Update application user details.',
} as const satisfies Record<AppPermission, string>;

export const authorizationStatement = {
  equipment_audit: ['read'],
  equipment_customer: ['read', 'create', 'update', 'remove'],
  equipment_email: ['send'],
  equipment_feedback: ['read', 'update'],
  equipment_job: ['read', 'create', 'update', 'schedule', 'update-calendar', 'cancel'],
  equipment_job_bay: ['read', 'update'],
  equipment_job_metrics: ['read'],
  equipment_inventory: ['read', 'move', 'adjust', 'count', 'build', 'close-out'],
  equipment_inventory_cost: ['read', 'revalue'],
  equipment_part: ['read', 'update'],
  equipment_product: ['read', 'create', 'update'],
  equipment_product_range: ['read', 'create', 'update'],
  // No create action: Units are born from Job creation, never on their own. Removal is the one way out,
  // and it only ever reaches a machine that never came to exist.
  equipment_product_unit: ['read', 'update', 'transfer', 'reassign', 'remove'],
  equipment_purchase_order: ['read', 'create', 'approve', 'send', 'amend', 'receive', 'close'],
  equipment_quote: ['read', 'create', 'update', 'cancel'],
  equipment_supplier: ['read', 'update', 'remove', 'merge'],
  contracting_job: ['read', 'read-own', 'read-priced', 'create', 'update', 'assign', 'complete', 'cancel', 'price'],
  contracting_assignment: ['update-own'],
  contracting_invoice: ['update'],
  contracting_machine: ['read', 'update'],
  contracting_reading: ['capture', 'update'],
  contracting_gap: ['resolve'],
  contracting_breakdown: ['read', 'report', 'update'],
  contracting_service: ['read', 'update'],
  contracting_rate: ['read', 'update'],
  contracting_report: ['read'],
  user: ['list', 'create', 'update', 'set-email', 'set-role', 'set-password'],
} as const;

type AuthorizationResource = keyof typeof authorizationStatement;

type RoleAccess = Partial<{
  [Resource in AuthorizationResource]: readonly (typeof authorizationStatement)[Resource][number][];
}>;

const adminAccess = {
  equipment_audit: ['read'],
  equipment_customer: ['read', 'create', 'update', 'remove'],
  equipment_email: ['send'],
  equipment_job: ['read', 'create', 'update', 'schedule', 'update-calendar', 'cancel'],
  equipment_job_bay: ['read', 'update'],
  equipment_job_metrics: ['read'],
  equipment_inventory: ['read', 'move', 'adjust', 'count', 'build', 'close-out'],
  equipment_inventory_cost: ['read', 'revalue'],
  equipment_part: ['read', 'update'],
  equipment_product: ['read', 'create', 'update'],
  equipment_product_range: ['read', 'create', 'update'],
  equipment_product_unit: ['read', 'update', 'transfer', 'reassign', 'remove'],
  equipment_purchase_order: ['read', 'create', 'approve', 'send', 'amend', 'receive', 'close'],
  equipment_quote: ['read', 'create', 'update', 'cancel'],
  equipment_supplier: ['read', 'update', 'remove', 'merge'],
  user: ['list', 'create', 'update', 'set-email', 'set-role', 'set-password'],
} as const satisfies RoleAccess;

const contractingAdminAccess = {
  contracting_job: ['read', 'read-own', 'read-priced', 'create', 'update', 'assign', 'complete', 'cancel', 'price'],
  contracting_assignment: ['update-own'],
  contracting_invoice: ['update'],
  contracting_machine: ['read', 'update'],
  contracting_reading: ['capture', 'update'],
  contracting_gap: ['resolve'],
  contracting_breakdown: ['read', 'report', 'update'],
  contracting_service: ['read', 'update'],
  contracting_rate: ['read', 'update'],
  contracting_report: ['read'],
} as const satisfies RoleAccess;

// Invariant: any role granted `equipment_job:create` must also hold `equipment_job:schedule` — creating a
// Job inherently schedules its Bay seeds (picked start dates, ghost previews), so the
// create surfaces assume scheduling authority rather than gating seed dates separately.
// Invariant: `equipment_purchase_order:receive` implies posting receipt movements, so receiving
// is never a paper-only action.
export const appRoleAccess = {
  admin: adminAccess,
  // super-admin is admin plus exclusive Feedback review. Composed by spread so the two can never
  // drift: any permission added to admin is inherited here, while feedback stays admin-exclusive.
  // This is still a fully explicit static declaration (resolved at module load), not the runtime
  // role inheritance ADR 0017 rules out.
  'super-admin': {
    ...adminAccess,
    ...contractingAdminAccess,
    equipment_feedback: ['read', 'update'],
  },
  'procurement-manager': {
    equipment_customer: ['read', 'create', 'update', 'remove'],
    equipment_inventory: ['read', 'adjust'],
    equipment_inventory_cost: ['read', 'revalue'],
    equipment_job: ['read'],
    equipment_part: ['read', 'update'],
    equipment_product: ['read', 'create', 'update'],
    equipment_product_unit: ['read'],
    // No `approve`: procurement drafts and sends, an admin signs off in between. Handing the
    // approval right to the role that drafts would be the gate approving itself.
    equipment_purchase_order: ['read', 'create', 'send', 'amend', 'receive', 'close'],
    // The same Quote set sales holds, and no `cancel`: unwinding a Locked Quote's sale or build stays
    // with the roles that own the cascade.
    equipment_quote: ['read', 'create', 'update'],
    equipment_supplier: ['read', 'update', 'merge'],
  },
  'job-viewer': {
    equipment_job: ['read'],
    equipment_product_unit: ['read'],
  },
  'job-manager': {
    equipment_job: ['read', 'update'],
    equipment_product_unit: ['read'],
  },
  sales: {
    equipment_email: ['send'],
    // Sales reads Units because stock has to be selectable on a Quote.
    equipment_product_unit: ['read'],
    equipment_quote: ['read', 'create', 'update'],
  },
  stores: {
    equipment_inventory: ['read', 'move', 'adjust', 'count', 'build', 'close-out'],
    equipment_purchase_order: ['read', 'receive'],
  },
  'bay-operator': {},
  'contracting-admin': contractingAdminAccess,
  'contracting-manager': {
    contracting_job: ['read', 'create', 'update', 'assign', 'complete', 'cancel'],
    contracting_machine: ['read', 'update'],
    contracting_reading: ['capture', 'update'],
    contracting_gap: ['resolve'],
    contracting_breakdown: ['read', 'report', 'update'],
    contracting_service: ['read', 'update'],
    contracting_report: ['read'],
  },
  'workshop-manager': {
    contracting_job: ['read'],
    contracting_machine: ['read'],
    contracting_breakdown: ['read', 'report', 'update'],
    contracting_service: ['read', 'update'],
    contracting_report: ['read'],
  },
  foreman: {
    contracting_job: ['read-own'],
    contracting_assignment: ['update-own'],
    contracting_reading: ['capture'],
    contracting_breakdown: ['report'],
  },
  'contracting-invoicing': {
    contracting_job: ['read-priced'],
    contracting_invoice: ['update'],
  },
  driver: {},
  mechanic: {},
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

export function isRoleSlotsSignInEligible(input: {
  contractingRole: ContractingRole | null;
  equipmentRole: EquipmentRole | null;
}): boolean {
  return isPermissionSetSignInEligible(getRoleSlotsPermissions(input));
}

export type RoleSlots = {
  contractingRole: ContractingRole | null;
  equipmentRole: EquipmentRole | null;
};

export function normalizeRoleSlots(input: RoleSlots): RoleSlots {
  if (input.equipmentRole === 'super-admin' || input.contractingRole === 'super-admin') {
    return { contractingRole: 'super-admin', equipmentRole: 'super-admin' };
  }

  return input;
}

export function getRoleSlotsPermissions(input: RoleSlots): AppPermission[] {
  const slots = normalizeRoleSlots(input);
  const roles = new Set<AppRole>();

  if (slots.equipmentRole) roles.add(slots.equipmentRole);
  if (slots.contractingRole) roles.add(slots.contractingRole);

  return [...new Set([...roles].flatMap((role) => getRolePermissions(role)))].sort();
}

export function createUserAccessSummary(
  input:
    | { contractingRole: ContractingRole | null; equipmentRole: EquipmentRole | null; userId: string }
    | { role: AppRole; userId: string },
): UserAccessSummary {
  const slots = normalizeRoleSlots(
    'role' in input
      ? {
          contractingRole: ContractingRole.safeParse(input.role).success ? ContractingRole.parse(input.role) : null,
          equipmentRole: EquipmentRole.safeParse(input.role).success ? EquipmentRole.parse(input.role) : null,
        }
      : input,
  );

  return {
    contractingRole: slots.contractingRole,
    equipmentRole: slots.equipmentRole,
    permissions: getRoleSlotsPermissions(slots),
    userId: input.userId,
  };
}

export function hasBusinessAccess(
  access: Pick<UserAccessSummary, 'contractingRole' | 'equipmentRole'> | null | undefined,
  business: 'contracting' | 'equipment',
): boolean {
  return business === 'equipment' ? access?.equipmentRole != null : access?.contractingRole != null;
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
