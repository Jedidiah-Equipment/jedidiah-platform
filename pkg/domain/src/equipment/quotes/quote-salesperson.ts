import type { AppRole, EquipmentRole } from '@pkg/schema';

/**
 * Who a Quote may name as its Salesperson — the roles that own the sale, which is narrower than the
 * roles that may raise the paperwork. Procurement holds `equipment_quote:create` but is not a salesperson, so
 * a Quote it creates is still attributed to one of these.
 */
export const QUOTE_SALESPERSON_ROLES = ['super-admin', 'admin', 'sales'] as const satisfies readonly AppRole[];

export function isQuoteSalespersonRole(role: EquipmentRole | null | undefined): boolean {
  return QUOTE_SALESPERSON_ROLES.some((salespersonRole) => salespersonRole === role);
}
