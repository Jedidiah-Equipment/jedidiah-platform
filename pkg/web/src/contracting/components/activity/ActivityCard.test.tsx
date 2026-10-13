import { createUserAccessSummary } from '@pkg/domain';
import type { ContractingRole } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/use-access.js', () => ({ useAccess: () => ({ data: access.current }) }));
vi.mock('@/lib/trpc.js', () => ({ useTRPC: () => ({}) }));
vi.mock('@/contracting/hooks/use-contracting-write.js', () => ({}));
vi.mock('./ActivityFeed.js', () => ({ ActivityFeed: () => <p>feed</p> }));

import { ActivityCard } from './ActivityCard.js';

const JOB_ID = '00000000-0000-4000-8000-000000000002';

function renderAs(contractingRole: ContractingRole) {
  access.current = createUserAccessSummary({ userId: 'me', equipmentRole: null, contractingRole });
  return renderToStaticMarkup(<ActivityCard addNote={null} scope={{ jobId: JOB_ID }} />);
}

describe('ActivityCard', () => {
  // Invoicing opens the Job page from its list but has no Activity, so the card would only ever fail to load.
  it('stays off the Job page for a reader without Activity', () => {
    expect(renderAs('contracting-invoicing')).toBe('');
  });

  it('shows the thread to a reader with a Jobs reach', () => {
    expect(renderAs('contracting-manager')).toContain('feed');
  });
});
