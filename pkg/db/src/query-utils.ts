import type { PagedQueryInput, SortDirection } from '@pkg/schema';
import { asc, desc, isNull, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';

export const LIKE_SEARCH_ESCAPE = '!';

export function createLikeSearchPattern(search: string): string {
  return `%${search.replace(/[!%_]/g, '!$&')}%`;
}

export function createEscapedContainsSearchCondition(expression: SQL, search: string): SQL {
  return createEscapedLikeSearchCondition(expression, createLikeSearchPattern(search));
}

export function createGlobalSearchCondition(search: string, expressions: readonly SQL[]): SQL | undefined {
  if (!search || expressions.length === 0) {
    return undefined;
  }

  return or(...expressions.map((expression) => createEscapedContainsSearchCondition(expression, search)));
}

export function getPaginationOffset({ page, pageSize }: PagedQueryInput): number {
  return (page - 1) * pageSize;
}

export function getPaginationQueryOptions(pagination: PagedQueryInput): { limit?: number; offset?: number } {
  if (pagination.pageSize === 0) {
    return {};
  }

  return {
    limit: pagination.pageSize,
    offset: getPaginationOffset(pagination),
  };
}

export function getSortOrder(expression: SQLWrapper, sortDirection: SortDirection): SQL {
  return sortDirection === 'desc' ? desc(expression) : asc(expression);
}

export function notRemoved(table: { deletedAt: SQLWrapper }): SQL {
  return isNull(table.deletedAt);
}

export function withPagination<TQuery extends PgSelect>(query: TQuery, pagination: PagedQueryInput): TQuery {
  if (pagination.pageSize === 0) {
    return query;
  }

  return query.limit(pagination.pageSize).offset(getPaginationOffset(pagination));
}

// PostgreSQL SQLSTATE codes for the integrity violations we translate into domain errors.
const UNIQUE_VIOLATION_CODE = '23505';
const FOREIGN_KEY_VIOLATION_CODE = '23503';

export function isUniqueViolation(error: unknown): boolean {
  return getUniqueViolationConstraint(error) !== null;
}

export function getUniqueViolationConstraint(error: unknown): string | null {
  return getConstraintViolation(error, UNIQUE_VIOLATION_CODE);
}

export function getForeignKeyViolationConstraint(error: unknown): string | null {
  return getConstraintViolation(error, FOREIGN_KEY_VIOLATION_CODE);
}

function getConstraintViolation(error: unknown, code: string): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  if ('code' in error && error.code === code) {
    // node-postgres reports `constraint`; postgres-js reports the wire-protocol `constraint_name`.
    const constraint = getStringProperty(error, 'constraint') ?? getStringProperty(error, 'constraint_name');

    if (constraint) {
      return constraint;
    }

    const causeConstraint = 'cause' in error ? getConstraintViolation(error.cause, code) : null;

    return causeConstraint ?? getStringProperty(error, 'detail') ?? getStringProperty(error, 'message') ?? '';
  }

  return 'cause' in error ? getConstraintViolation(error.cause, code) : null;
}

function getStringProperty(error: object, property: string): string | null {
  return property in error && typeof error[property as keyof typeof error] === 'string'
    ? error[property as keyof typeof error]
    : null;
}

function createEscapedLikeSearchCondition(expression: SQL, searchPattern: string): SQL {
  return sql`${expression} ilike ${searchPattern} escape ${LIKE_SEARCH_ESCAPE}`;
}
