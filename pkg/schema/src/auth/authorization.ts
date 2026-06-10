import { z } from 'zod';
import { Department } from '../common/departments.js';
import { NullablePhoneNumber } from '../common/phone-number.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { AuthId } from './auth-id.js';

export const APP_ROLES = ['admin', 'procurement-manager', 'job-viewer', 'sales'] as const;

export type AppRole = z.infer<typeof AppRole>;
export const AppRole = z.enum(APP_ROLES);

export const APP_PERMISSIONS = [
  'audit:read',
  'customer:read',
  'customer:create',
  'customer:update',
  'job:read',
  'job:create',
  'job:update',
  'job:schedule',
  'job:update-calendar',
  'job_bay:read',
  'job_bay:update',
  'part:read',
  'part:update',
  'product:read',
  'product:create',
  'product:update',
  'quote:read',
  'quote:create',
  'quote:update',
  'supplier:read',
  'supplier:update',
  'user:list',
  'user:create',
  'user:update',
  'user:set-role',
  'user:set-password',
] as const;

export type AppPermission = z.infer<typeof AppPermission>;
export const AppPermission = z.enum(APP_PERMISSIONS);

export type UserAccessSummary = z.infer<typeof UserAccessSummary>;
export const UserAccessSummary = z.object({
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
  phoneNumber: NullablePhoneNumber,
  role: AppRole,
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type UserSortBy = z.infer<typeof UserSortBy>;
export const UserSortBy = z.enum(['email', 'emailVerified', 'name', 'role']);

export type UserAccount = z.infer<typeof UserAccount>;
export const UserAccount = UserSummary.omit({
  departments: true,
});

export type UserListInput = z.infer<typeof UserListInput>;
export const UserListInput = z.object({});

export type UserPassword = z.infer<typeof UserPassword>;
export const UserPassword = z.string().min(1, 'Enter your password');

export type UserListResult = z.infer<typeof UserListResult>;
export const UserListResult = z.object({
  users: z.array(UserSummary),
});
