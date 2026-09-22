import type { UserAccount } from '@pkg/schema';

import type { UserEditFormValues } from './UserEditForm.js';

type ProfileUpdateData = Partial<
  Pick<
    UserEditFormValues,
    'assistantEnabled' | 'contractingRole' | 'email' | 'emailVerified' | 'equipmentRole' | 'name' | 'phoneNumber'
  >
>;

export function buildProfileUpdateData({
  baselineUser,
  canSetEmail,
  canSetRole,
  canUpdateProfile,
  value,
}: {
  baselineUser: UserAccount;
  canSetEmail: boolean;
  canSetRole: boolean;
  canUpdateProfile: boolean;
  value: UserEditFormValues;
}): ProfileUpdateData {
  const data: ProfileUpdateData = {};

  // Better Auth protects email under `user:set-email`; unchanged sensitive fields must stay out of
  // ordinary name/phone saves so those edits only require `user:update`.
  if (canSetEmail && value.email !== baselineUser.email) {
    data.email = value.email;
  }
  if (canSetEmail && value.emailVerified !== baselineUser.emailVerified) {
    data.emailVerified = value.emailVerified;
  }
  if (canUpdateProfile && value.name !== baselineUser.name) {
    data.name = value.name;
  }
  if (canUpdateProfile && value.phoneNumber !== baselineUser.phoneNumber) {
    data.phoneNumber = value.phoneNumber;
  }
  if (canUpdateProfile && value.assistantEnabled !== baselineUser.assistantEnabled) {
    data.assistantEnabled = value.assistantEnabled;
  }
  // Only the slot of the business this dialog stands in is shown, so at most one of these moves.
  if (canSetRole && value.equipmentRole !== baselineUser.equipmentRole) {
    data.equipmentRole = value.equipmentRole;
  }
  if (canSetRole && value.contractingRole !== baselineUser.contractingRole) {
    data.contractingRole = value.contractingRole;
  }

  return data;
}
