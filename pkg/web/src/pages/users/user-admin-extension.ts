import type { AuthId, UserAccount } from '@pkg/schema';
import type React from 'react';

import type { DataTableColumnDef } from '@/components/data-table/features.js';

/**
 * What a business adds to the shared user admin — Equipment its Department Membership and stores
 * badge, Contracting nothing yet. The page is shared and may not import a business, so each route
 * hands its business's extension in; both members are hooks, because the extension owns its own
 * data and draft state and the page only places what they render.
 */
export type UserAdminExtension = {
  /** Extra table columns, and the extra text the table's search should match per user. */
  useTableExtension: () => {
    columns: DataTableColumnDef<UserAccount>[];
    searchTerms: (user: UserAccount) => string[];
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
const noSearchTerms = () => [];
const noFormExtension = { actions: null, fields: null, save: async () => false };

// Stable values, so a table memoised on them does not rebuild its columns every render.
export const noUserAdminExtension: UserAdminExtension = {
  useTableExtension: () => ({ columns: noColumns, searchTerms: noSearchTerms }),
  useFormExtension: () => noFormExtension,
};
