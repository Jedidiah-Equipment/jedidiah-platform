import { z } from 'zod';
import { Department } from '../common/departments.js';
import { NullablePhoneNumber } from '../common/phone-number.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { AuthId } from './auth-id.js';

export const APP_ROLES = [
  'admin',
  'super-admin',
  'procurement-manager',
  'job-viewer',
  'sales',
  'stores',
  'bay-operator',
] as const;

export type AppRole = z.infer<typeof AppRole>;
export const AppRole = z.enum(APP_ROLES);

export const APP_PERMISSIONS = [
  'audit:read',
  'customer:read',
  'customer:create',
  'customer:update',
  'email:send',
  'feedback:read',
  'feedback:update',
  'job:read',
  'job:create',
  'job:update',
  'job:schedule',
  'job:update-calendar',
  'job_bay:read',
  'job_bay:update',
  'inventory:read',
  'inventory:move',
  'inventory:adjust',
  'inventory:count',
  'inventory:build',
  'inventory:close-out',
  'inventory_cost:read',
  'inventory_cost:revalue',
  'part:read',
  'part:update',
  'product:read',
  'product:create',
  'product:update',
  'product_range:read',
  'product_range:create',
  'product_range:update',
  'product_unit:read',
  'product_unit:update',
  'product_unit:transfer',
  'purchase_order:read',
  'purchase_order:create',
  'purchase_order:send',
  'purchase_order:amend',
  'purchase_order:receive',
  'purchase_order:close',
  'quote:read',
  'quote:create',
  'quote:update',
  'quote:cancel',
  'quote:discount',
  'supplier:read',
  'supplier:update',
  'supplier:remove',
  'user:list',
  'user:create',
  'user:update',
  'user:set-email',
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
  assistantEnabled: z.boolean(),
  departments: z.array(Department),
  emailVerified: z.boolean(),
  id: AuthId,
  /**
   * A shared device rather than a person — today the stores tablet. Distinct from role, which still
   * says what the account may *do*: this says that nobody in particular is behind it, which is why
   * a device must name a person before it may move stock and may never be named as one itself.
   */
  isDevice: z.boolean(),
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

/**
 * What a stores badge card carries: the person's name to read, and their id inside the Code 128 the
 * tablet's scan field resolves (spec §11). No role, no email, nothing else — the card is dropped on
 * a bench beside the scanner all shift, and it identifies rather than authenticates. Losing one
 * means someone else can sign for stock under that name, which is exactly the exposure a PIN would
 * close and v1 deliberately does not (spec §13).
 */
export type UserBadgePdfModel = z.infer<typeof UserBadgePdfModel>;
export const UserBadgePdfModel = UserSummary.pick({ id: true, name: true });

export type UserBadgePdfRenderer = (input: { document: UserBadgePdfModel[]; filename: string }) => Promise<Uint8Array>;
