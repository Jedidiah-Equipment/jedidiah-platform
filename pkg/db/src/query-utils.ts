import type { PagedQueryInput, PagedQueryResult, SortDirection } from '@pkg/schema';
import { asc, desc, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';

type PagedListResultInput<TItem, TSortBy extends string> = PagedQueryResult<TItem> & {
  sortBy: TSortBy;
  sortDirection: SortDirection;
};

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

export function getPaginationQueryOptions(pagination: PagedQueryInput): { limit: number; offset: number } {
  return {
    limit: pagination.pageSize,
    offset: getPaginationOffset(pagination),
  };
}

export function getSortOrder(expression: SQLWrapper, sortDirection: SortDirection): SQL {
  return sortDirection === 'desc' ? desc(expression) : asc(expression);
}

export function withPagination<TQuery extends PgSelect>(query: TQuery, pagination: PagedQueryInput): TQuery {
  const { limit, offset } = getPaginationQueryOptions(pagination);

  return query.limit(limit).offset(offset);
}

export function createPagedListResult<TItem, TSortBy extends string>({
  items,
  total,
  sortBy,
  sortDirection,
}: PagedListResultInput<TItem, TSortBy>): PagedListResultInput<TItem, TSortBy> {
  return {
    items,
    total,
    sortBy,
    sortDirection,
  };
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

function createEscapedLikeSearchCondition(expression: SQL, searchPattern: string): SQL {
  return sql`${expression} ilike ${searchPattern} escape ${LIKE_SEARCH_ESCAPE}`;
}
