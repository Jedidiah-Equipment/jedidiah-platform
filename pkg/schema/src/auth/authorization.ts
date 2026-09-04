import { z } from 'zod';
import { Department } from '../common/departments.js';
import { NullablePhoneNumber } from '../common/phone-number.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { AuthId } from './auth-id.js';

export const EQUIPMENT_ROLES = [
  'admin',
  'super-admin',
  'procurement-manager',
  'job-manager',
  'job-viewer',
  'sales',
  'stores',
  'bay-operator',
] as const;

export type EquipmentRole = z.infer<typeof EquipmentRole>;
export const EquipmentRole = z.enum(EQUIPMENT_ROLES);

export const CONTRACTING_ROLES = [
  'super-admin',
  'contracting-admin',
  'contracting-manager',
  'workshop-manager',
  'foreman',
  'contracting-invoicing',
  'driver',
  'mechanic',
] as const;

export type ContractingRole = z.infer<typeof ContractingRole>;
export const ContractingRole = z.enum(CONTRACTING_ROLES);

export const APP_ROLES = [...EQUIPMENT_ROLES, ...CONTRACTING_ROLES.filter((role) => role !== 'super-admin')] as const;

export type AppRole = z.infer<typeof AppRole>;
export const AppRole = z.enum(APP_ROLES);

export const APP_PERMISSIONS = [
  'equipment_audit:read',
  'equipment_customer:read',
  'equipment_customer:create',
  'equipment_customer:update',
  'equipment_customer:remove',
  'equipment_email:send',
  'equipment_feedback:read',
  'equipment_feedback:update',
  'equipment_job:read',
  'equipment_job:create',
  'equipment_job:update',
  'equipment_job:schedule',
  'equipment_job:update-calendar',
  'equipment_job:cancel',
  'equipment_job_bay:read',
  'equipment_job_bay:update',
  'equipment_job_metrics:read',
  'equipment_inventory:read',
  'equipment_inventory:move',
  'equipment_inventory:adjust',
  'equipment_inventory:count',
  'equipment_inventory:build',
  'equipment_inventory:close-out',
  'equipment_inventory_cost:read',
  'equipment_inventory_cost:revalue',
  'equipment_part:read',
  'equipment_part:update',
  'equipment_product:read',
  'equipment_product:create',
  'equipment_product:update',
  'equipment_product_range:read',
  'equipment_product_range:create',
  'equipment_product_range:update',
  'equipment_product_unit:read',
  'equipment_product_unit:update',
  'equipment_product_unit:transfer',
  'equipment_product_unit:reassign',
  'equipment_product_unit:remove',
  'equipment_purchase_order:read',
  'equipment_purchase_order:create',
  'equipment_purchase_order:approve',
  'equipment_purchase_order:send',
  'equipment_purchase_order:amend',
  'equipment_purchase_order:receive',
  'equipment_purchase_order:close',
  'equipment_quote:read',
  'equipment_quote:create',
  'equipment_quote:update',
  'equipment_quote:cancel',
  'equipment_supplier:read',
  'equipment_supplier:update',
  'equipment_supplier:remove',
  'equipment_supplier:merge',
  'contracting_job:read',
  'contracting_job:read-own',
  'contracting_job:read-priced',
  'contracting_job:create',
  'contracting_job:update',
  'contracting_job:assign',
  'contracting_job:complete',
  'contracting_job:cancel',
  'contracting_job:price',
  'contracting_assignment:update-own',
  'contracting_invoice:update',
  'contracting_machine:read',
  'contracting_machine:update',
  'contracting_reading:capture',
  'contracting_reading:update',
  'contracting_gap:resolve',
  'contracting_breakdown:read',
  'contracting_breakdown:report',
  'contracting_breakdown:update',
  'contracting_service:read',
  'contracting_service:update',
  'contracting_rate:read',
  'contracting_rate:update',
  'contracting_report:read',
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
  equipmentRole: EquipmentRole.nullable(),
  contractingRole: ContractingRole.nullable(),
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
  equipmentRole: EquipmentRole.nullable(),
  contractingRole: ContractingRole.nullable(),
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type UserSortBy = z.infer<typeof UserSortBy>;
export const UserSortBy = z.enum(['email', 'emailVerified', 'name', 'equipmentRole', 'contractingRole']);

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
