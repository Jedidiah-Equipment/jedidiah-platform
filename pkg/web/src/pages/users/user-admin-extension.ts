import type { AuthId, UserAccount, UserListInput, UserListResult } from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type React from 'react';
import { cursorInfiniteQueryOptions } from '@/components/data-table/cursor-query.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * What a business adds to the shared user admin — Equipment its Department Membership and stores
 * badge, Contracting nothing yet. The page is shared and may not import a business, so each route
 * hands its business's extension in. The extension owns its queries, invalidation and draft state.
 */
export type UserAdminExtension = {
  /** Each business owns any extra server filters while returning the shared account page. */
  useListQuery: (input: Omit<UserListInput, 'cursor'>, columnFilters: ColumnFiltersState) => UserListQuery;
  useInvalidateAdditionalUserQueries: () => () => Promise<unknown>;
  /** Extra table columns owned by the business. */
  useTableExtension: () => {
    columns: DataTableColumnDef<UserAccount>[];
  };
  /**
   * Extra fields for the create (`user` null) and edit forms. `save` runs after the account itself
   * is written and reports whether it changed anything; `actions` render under the edit form.
   */
  useFormExtension: (input: { isPending: boolean; user: UserAccount | null }) => {
    actions: React.ReactNode;
    fields: React.ReactNode;
    save: (userId: AuthId) => Promise<boolean>;
  };
};

const noColumns: DataTableColumnDef<UserAccount>[] = [];
const noInvalidation = async () => {};
const noFormExtension = { actions: null, fields: null, save: async () => false };

// Stable values, so a table memoised on them does not rebuild its columns every render.
export const noUserAdminExtension: UserAdminExtension = {
  useListQuery: (input) => {
    const trpc = useTRPC();
    return useInfiniteQuery(
      trpc.users.list.infiniteQueryOptions(input, {
        ...cursorInfiniteQueryOptions,
        placeholderData: keepPreviousData,
      }),
    );
  },
  useInvalidateAdditionalUserQueries: () => noInvalidation,
  useTableExtension: () => ({ columns: noColumns }),
  useFormExtension: () => noFormExtension,
};

export type UserListQuery = {
  data: { pages: UserListResult[] } | undefined;
  error: unknown;
  isPending: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
};
