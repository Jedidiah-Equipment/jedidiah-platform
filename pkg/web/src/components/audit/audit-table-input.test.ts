import type { ColumnFiltersState } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

import { getAuditListInputExtras } from './audit-table-input.js';

const QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('getAuditListInputExtras', () => {
  it('uses table filters for the global audit table', () => {
    const filters = [
      { id: 'actorUserId', value: ['admin-user-id', ''] },
      { id: 'entityType', value: ['product', 'not-an-entity'] },
    ] satisfies ColumnFiltersState;

    expect(getAuditListInputExtras(filters)).toEqual({
      filters: {
        actorUserIds: ['admin-user-id'],
        entityIds: [],
        entityTypes: ['product'],
      },
    });
  });

  it('uses fixed quote filters instead of visible entity filters', () => {
    const filters = [
      { id: 'actorUserId', value: ['admin-user-id'] },
      { id: 'entityType', value: ['product'] },
    ] satisfies ColumnFiltersState;

    expect(getAuditListInputExtras(filters, { entityIds: [QUOTE_ID], entityTypes: ['quote'] })).toEqual({
      filters: {
        actorUserIds: ['admin-user-id'],
        entityIds: [QUOTE_ID],
        entityTypes: ['quote'],
      },
    });
  });
});
