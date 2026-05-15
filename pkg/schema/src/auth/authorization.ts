import { z } from 'zod';

import { AuthId } from './auth-id.js';

export const APP_ROLES = [
  'admin',
  'product-editor',
  'product-viewer',
  'job-supervisor',
  'job-stage-editor',
  'job-viewer',
] as const;

export type AppRole = z.infer<typeof AppRole>;
export const AppRole = z.enum(APP_ROLES);

export const DEPARTMENTS = ['procurement', 'fabrication', 'assembly', 'paint', 'dispatch'] as const;

export type Department = z.infer<typeof Department>;
export const Department = z.enum(DEPARTMENTS);

export const APP_PERMISSIONS = [
  'audit:read',
  'job:read',
  'job:create',
  'job:update',
  'job-stage:read',
  'job-stage:update',
  'product:read',
  'product:create',
  'product:update',
  'user:list',
  'user:create',
  'user:update',
  'user:set-role',
  'user:set-password',
  'user:assign-departments',
] as const;

export type AppPermission = z.infer<typeof AppPermission>;
export const AppPermission = z.enum(APP_PERMISSIONS);

export type UserAccessSummary = z.infer<typeof UserAccessSummary>;
export const UserAccessSummary = z.object({
  departments: z.array(Department),
  permissions: z.array(AppPermission),
  role: AppRole,
  userId: AuthId,
});

export type UserSummary = z.infer<typeof UserSummary>;
export const UserSummary = z.object({
  departments: z.array(Department),
  emailVerified: z.boolean(),
  id: AuthId,
  name: z.string().trim().min(1),
  email: z.email(),
  role: AppRole,
});

export type UserListInput = z.infer<typeof UserListInput>;
export const UserListInput = z.object({});

export type UserPassword = z.infer<typeof UserPassword>;
export const UserPassword = z.string().min(1, 'Enter your password');

export type UserListResult = z.infer<typeof UserListResult>;
export const UserListResult = z.object({
  users: z.array(UserSummary),
});
