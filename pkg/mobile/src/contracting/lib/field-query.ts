import type { UseQueryResult } from '@tanstack/react-query';

export type FieldQuery<T> = {
  canRead: boolean;
  data: T | undefined;
  isError: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  isSuccess: boolean;
  refetch: () => Promise<unknown>;
};

/** A field read as the Contracting screens consume it: nothing at all when the role cannot read it. */
export function fieldQuery<T>(canRead: boolean, query: UseQueryResult<T, unknown>): FieldQuery<T> {
  return {
    canRead,
    data: canRead ? query.data : undefined,
    isError: query.isError,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
  };
}
