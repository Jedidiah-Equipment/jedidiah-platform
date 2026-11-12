// @vitest-environment jsdom

import { getRolePermissions, hasPermission } from '@pkg/domain';
import { assertQuoteEditable, QUOTE_FORM_FIELDS } from '@pkg/domain/equipment';
import { EQUIPMENT_ROLES, type EquipmentRole } from '@pkg/schema';
import { type QuoteDetail, type QuoteKind, QuoteStatus } from '@pkg/schema/equipment';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/router-harness.js';

const accessState = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('@/hooks/use-access.js', () => ({
  useAccess: () => ({ data: { permissions: accessState.permissions } }),
  useCan: (permission: string) => ({ can: accessState.permissions.includes(permission) }),
}));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ jobs: { list: { queryOptions: () => ({ queryKey: ['jobs'], enabled: false }) } } }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, error: null }),
}));
vi.mock('@/equipment/hooks/options/index.js', () => ({
  useSalesPersonOptions: () => ({ selectOptions: [{ label: 'Sales Person', value: 'auth-user-1' }] }),
}));
vi.mock('@/components/ui/tabs.js', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: () => null,
  TabsTrigger: () => null,
}));
vi.mock('@/equipment/components/audit/EquipmentAuditTable.js', () => ({
  EquipmentAuditTable: () => null,
  useQuoteAuditTableStore: () => ({}),
}));
vi.mock('@/equipment/components/feedback/GiveFeedbackButton.js', () => ({ GiveFeedbackButton: () => null }));
vi.mock('@/equipment/pages/jobs/components/JobSheet.js', () => ({ JobSheet: () => null }));
vi.mock('../QuoteCancellationAction.js', () => ({ QuoteCancellationDialog: () => null }));
vi.mock('./QuoteDocumentsSection.js', () => ({ QuoteDocumentsSection: () => null }));
vi.mock('./QuoteRightPanel.js', () => ({ QuoteRightPanel: () => null }));
vi.mock('./QuoteStockSection.js', () => ({ QuoteStockSection: () => null }));
vi.mock('./QuoteAssembliesSelector.js', () => ({
  QuoteAssembliesSelector: ({ readOnly }: { readOnly: boolean }) => (
    <div data-readonly={readOnly} id="selectedAssemblies" />
  ),
}));
vi.mock('./QuoteWorkItemsEditor.js', () => ({
  QuoteAddWorkItemButton: () => null,
  QuoteWorkItemsEditor: ({ readOnly }: { readOnly: boolean }) => <div data-readonly={readOnly} id="workItems" />,
}));

import { QuoteForm } from './QuoteForm.js';

function quoteOf(kind: QuoteKind, status: QuoteStatus): QuoteDetail {
  return {
    cancellationReason: null,
    code: 'QUO-00001',
    depositPercent: 30,
    deliveryPrice: 500,
    deliveryTerms: 'additional_charge',
    discountPercent: 0,
    documentNotes: '',
    hasEverSourcedJob: true,
    id: '550e8400-e29b-41d4-a716-446655440000',
    job: null,
    kind,
    notes: '',
    plannedDeliveryDate: null,
    preferredDeliveryDate: null,
    product: kind === 'product' ? { assemblies: [], currencyCode: 'ZAR' } : null,
    productUnitId: null,
    quotedCurrencyCode: 'ZAR',
    salesPersonId: 'auth-user-1',
    salesPersonName: 'Sales Person',
    selectedAssemblies: [],
    status,
    validUntil: null,
    workItems: [],
    workTitle: kind === 'custom' ? 'Pump overhaul' : null,
  } as unknown as QuoteDetail;
}

async function renderedFieldStates(kind: QuoteKind, status: QuoteStatus, role: EquipmentRole) {
  accessState.permissions = getRolePermissions(role);
  const container = document.createElement('div');
  container.innerHTML = await renderWithRouter(
    <QuoteForm onSave={async () => undefined} quote={quoteOf(kind, status)} />,
  );

  const states: Record<string, boolean> = {};
  for (const field of QUOTE_FORM_FIELDS) {
    const element = container.querySelector(`#${field}`);
    if (!element) continue;
    states[field] = !(
      element.hasAttribute('disabled') ||
      element.hasAttribute('data-disabled') ||
      element.getAttribute('data-readonly') === 'true' ||
      element.closest('[data-disabled="true"]') !== null
    );
  }
  return states;
}

const cases = (['custom', 'product'] as const).flatMap((kind) =>
  QuoteStatus.options.flatMap((status) => EQUIPMENT_ROLES.map((role) => [kind, status, role] as const)),
);

describe('QuoteForm', () => {
  it.each(cases)(
    'on a %s Quote that is %s, %s may change exactly what the server accepts',
    async (kind, status, role) => {
      const states = await renderedFieldStates(kind, status, role);
      const actor = { permissions: getRolePermissions(role) };
      const expected = Object.fromEntries(
        Object.keys(states).map((field) => [
          field,
          hasPermission(actor, 'equipment_quote:update') &&
            assertQuoteEditable({
              actor,
              changedFields: [field],
              hasEverSourcedJob: true,
              hasProductUnit: false,
              kind,
              status,
            }).allowed,
        ]),
      );

      expect(Object.keys(states).length).toBeGreaterThanOrEqual(11);
      expect(states).toEqual(expected);
    },
  );
});
