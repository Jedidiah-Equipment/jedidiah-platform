import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { ContractingRole, EquipmentRole } from '../auth/authorization.js';
import { Business } from '../common/business.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../common/pagination.js';
import { NullablePhoneNumber } from '../common/phone-number.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';

/** A User as user admin sees it: the sign-in account and both role slots, with nothing a business owns. */
export type UserAccount = z.infer<typeof UserAccount>;
export const UserAccount = z.object({
  assistantEnabled: z.boolean(),
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
export const UserSortBy = z.enum(['email', 'emailVerified', 'name', 'role']);

/**
 * User admin is per Business: a list that names the Business it stands in gets the users who hold a
 * role there — super-admin in both, since it spans the split (ADR 0017) — plus users holding no role
 * at all, so nobody an administrator has removed from every business drops out of reach. A list
 * naming no Business includes everyone. Pickers request limit: 0 to read the full list.
 */
export type UserListInput = z.infer<typeof UserListInput>;
export const UserListInput = createSearchedSortedCursorQueryInput({
  shape: {
    business: Business.optional(),
    columnFilters: z
      .object({
        name: z.string().trim().optional(),
        role: z.string().trim().optional(),
        emailVerified: z.string().trim().optional(),
      })
      .default({}),
  },
  sortBy: UserSortBy.default('name'),
});

export type UserListResult = z.infer<typeof UserListResult>;
export const UserListResult = createCursorQueryResult(UserAccount);
