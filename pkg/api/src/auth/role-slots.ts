import type { RoleSlots } from '@pkg/domain';
import { ContractingRole, EquipmentRole } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { z } from 'zod';

// How the two role slots travel through Better Auth's admin endpoints, read in one place for every
// hook that cares: `data.equipmentRole` / `data.contractingRole` on create-user and update-user
// (Better Auth's own `role` cannot carry null), and `role` on set-role, its native single-slot
// endpoint. Update hooks receive the original request, never another hook's output, so a hook that
// needs the intended slots must read them from the transport through {@link getRoleChange}.

export const INVALID_ROLE_ERROR = {
  code: 'INVALID_ROLE',
  message: 'The requested role is invalid.',
} as const;

const ROLE_SPELLING_ERROR = {
  code: 'INVALID_ROLE',
  message: 'Send the equipment role as `data.equipmentRole`.',
} as const;

// A slot left out is a slot left untouched.
export type RoleChange = Partial<RoleSlots> & { userId?: string };

export function changesSlots(current: RoleSlots, change: RoleChange): boolean {
  return (
    (change.equipmentRole !== undefined && change.equipmentRole !== current.equipmentRole) ||
    (change.contractingRole !== undefined && change.contractingRole !== current.contractingRole)
  );
}

/** super-admin is stored once, in the equipment slot, and spans both businesses (ADR 0017). */
export const spansBothBusinesses = (equipmentRole: unknown) => equipmentRole === 'super-admin';

export function getRoleChange(path: string | undefined, body: unknown): RoleChange | null {
  if (!isRecord(body)) {
    return null;
  }

  if (path === '/admin/set-role') {
    return typeof body.userId === 'string'
      ? { equipmentRole: parseSlot(EquipmentRole, body.role), userId: body.userId }
      : null;
  }

  if (path !== '/admin/create-user' && path !== '/admin/update-user') {
    return null;
  }

  const data = isRecord(body.data) ? body.data : {};
  if (Object.hasOwn(body, 'role') || Object.hasOwn(data, 'role')) {
    throw APIError.from('BAD_REQUEST', ROLE_SPELLING_ERROR);
  }

  const change: RoleChange = {
    ...(Object.hasOwn(data, 'equipmentRole') ? { equipmentRole: parseSlot(EquipmentRole, data.equipmentRole) } : {}),
    ...(Object.hasOwn(data, 'contractingRole')
      ? { contractingRole: parseSlot(ContractingRole, data.contractingRole) }
      : {}),
    ...(typeof body.userId === 'string' ? { userId: body.userId } : {}),
  };

  return change.equipmentRole === undefined && change.contractingRole === undefined ? null : change;
}

function parseSlot<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.nullable().safeParse(value);
  if (!result.success) throw APIError.from('BAD_REQUEST', INVALID_ROLE_ERROR);
  return result.data;
}

// Better Auth inserts its own `role` default on create-user, so an omitted equipment role must be
// written as null rather than left to that default. Set-role writes `role` itself; it is included
// so super-admin clears the contracting slot on that path too.
async function applyRoleSlots<T extends Record<string, unknown>>(userData: T, path: string | undefined, body: unknown) {
  const data = isRecord(body) && isRecord(body.data) ? body.data : {};
  const carriesEquipmentRole =
    path === '/admin/create-user' || (path === '/admin/update-user' && Object.hasOwn(data, 'equipmentRole'));

  if (!carriesEquipmentRole && !(path === '/admin/set-role' && Object.hasOwn(userData, 'role'))) {
    return;
  }

  const { equipmentRole: _transportField, ...persistedUser } = userData;
  const role = carriesEquipmentRole ? (data.equipmentRole ?? null) : userData.role;

  return {
    data: {
      ...persistedUser,
      role,
      ...(spansBothBusinesses(role) ? { contractingRole: null } : {}),
    },
  };
}

/** Maps the transport's role slots onto the user columns; part of the shared auth, ahead of any business policy. */
export function roleSlotsPlugin(): BetterAuthPlugin {
  return {
    id: 'role-slots',
    init: () => ({
      options: {
        databaseHooks: {
          user: {
            create: {
              before: (createdUser, context) => applyRoleSlots(createdUser, context?.path, context?.body),
            },
            update: {
              before: (updatedUser, context) => applyRoleSlots(updatedUser, context?.path, context?.body),
            },
          },
        },
      },
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
