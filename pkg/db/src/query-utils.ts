import type { PgSelect } from "drizzle-orm/pg-core";

export type PaginationInput = {
  page: number;
  pageSize: number;
};

export function getPaginationOffset({ page, pageSize }: PaginationInput): number {
  return (page - 1) * pageSize;
}

export function withPagination<TQuery extends PgSelect>(
  query: TQuery,
  pagination: PaginationInput,
): TQuery {
  return query.limit(pagination.pageSize).offset(getPaginationOffset(pagination));
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  return "cause" in error && isUniqueViolation(error.cause);
}
