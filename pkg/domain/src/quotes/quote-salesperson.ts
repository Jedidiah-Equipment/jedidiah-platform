import type { AppRole } from '@pkg/schema';

/**
 * Who a Quote may name as its Salesperson — the roles that own the sale, which is narrower than the
 * roles that may raise the paperwork. Procurement holds `quote:create` but is not a salesperson, so
 * a Quote it creates is still attributed to one of these.
 */
export const QUOTE_SALESPERSON_ROLES = ['super-admin', 'admin', 'sales'] as const satisfies readonly AppRole[];

/** Takes the loose role Better Auth hands the clients, resolving an array form the way `parseBetterAuthRole` does. */
export function isQuoteSalespersonRole(role: string | string[] | null | undefined): boolean {
  const appRole = Array.isArray(role) ? role[0] : role;

  return QUOTE_SALESPERSON_ROLES.some((salespersonRole) => salespersonRole === appRole);
}
