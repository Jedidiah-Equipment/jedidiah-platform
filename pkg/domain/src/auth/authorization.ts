import type { AppPermission, AppRole, Department, JobStageName, UserAccessSummary } from '@pkg/schema';

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

export type JobStageResource = {
  stage: JobStageName;
};

export type JobResource = {
  stages: readonly JobStageResource[];
};

export function canViewJob(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'job:read');
}

export function canViewStage(access: UserAccessSummary | null | undefined, stage: JobStageResource): boolean {
  return hasPermission(access, 'job-stage:read') && canAccessStageDepartment(access, stage);
}

export function canEditStage(access: UserAccessSummary | null | undefined, stage: JobStageResource): boolean {
  return hasPermission(access, 'job-stage:update') && canAccessStageDepartment(access, stage);
}

function canAccessStageDepartment(access: UserAccessSummary | null | undefined, stage: JobStageResource): boolean {
  if (!access) return false;

  // If the user has no departments, they have cross-cutting access to all stages
  if (access.departments.length === 0) return true;

  return access.departments.includes(stage.stage);
}
