import { z } from 'zod';

import { AuthId } from '../../auth/auth-id.js';
import { ContractingRole, EquipmentRole } from '../../auth/authorization.js';
import { NullablePhoneNumber } from '../../common/phone-number.js';
import { NullableThumbnailDataUrl } from '../../common/thumbnail.js';
import { Department } from '../common/departments.js';

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
