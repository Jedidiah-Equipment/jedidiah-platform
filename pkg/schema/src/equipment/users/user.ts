import { z } from 'zod';

import { AuthId } from '../../auth/auth-id.js';
import { UserAccount } from '../../users/user.js';
import { Department } from '../common/departments.js';

/** Department Membership is descriptive only (ADR 0017): which plant departments a User belongs to. */
export type UserDepartmentMembership = z.infer<typeof UserDepartmentMembership>;
export const UserDepartmentMembership = z.object({
  departments: z.array(Department),
  userId: AuthId,
});

export type UserDepartmentListResult = z.infer<typeof UserDepartmentListResult>;
export const UserDepartmentListResult = z.object({
  memberships: z.array(UserDepartmentMembership),
});

/**
 * What a stores badge card carries: the person's name to read, and their id inside the Code 128 the
 * tablet's scan field resolves (spec §11). No role, no email, nothing else — the card is dropped on
 * a bench beside the scanner all shift, and it identifies rather than authenticates. Losing one
 * means someone else can sign for stock under that name, which is exactly the exposure a PIN would
 * close and v1 deliberately does not (spec §13).
 */
export type UserBadgePdfModel = z.infer<typeof UserBadgePdfModel>;
export const UserBadgePdfModel = UserAccount.pick({ id: true, name: true });

export type UserBadgePdfRenderer = (input: { document: UserBadgePdfModel[]; filename: string }) => Promise<Uint8Array>;
