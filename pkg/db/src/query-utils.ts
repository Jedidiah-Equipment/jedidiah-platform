import type { PgSelect } from 'drizzle-orm/pg-core';

export type PaginationInput = {
  page: number;
  pageSize: number;
};

export const LIKE_SEARCH_ESCAPE = '!';

export function createLikeSearchPattern(search: string): string {
  return `%${search.replace(/[!%_]/g, '!$&')}%`;
}

export function getPaginationOffset({ page, pageSize }: PaginationInput): number {
  return (page - 1) * pageSize;
}

export function withPagination<TQuery extends PgSelect>(query: TQuery, pagination: PaginationInput): TQuery {
  return query.limit(pagination.pageSize).offset(getPaginationOffset(pagination));
}

export function isUniqueViolation(error: unknown): boolean {
  return getUniqueViolationConstraint(error) !== null;
}

export function getUniqueViolationConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  if ('code' in error && error.code === '23505') {
    if ('constraint' in error && typeof error.constraint === 'string') {
      return error.constraint;
    }

    const causeConstraint = 'cause' in error ? getUniqueViolationConstraint(error.cause) : null;

    return causeConstraint ?? getStringProperty(error, 'detail') ?? getStringProperty(error, 'message') ?? '';
  }

  return 'cause' in error ? getUniqueViolationConstraint(error.cause) : null;
}

function getStringProperty(error: object, property: string): string | null {
  return property in error && typeof error[property as keyof typeof error] === 'string'
    ? error[property as keyof typeof error]
    : null;
}
