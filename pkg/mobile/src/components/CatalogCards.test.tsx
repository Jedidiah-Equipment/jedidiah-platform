import { statusBadgeColorClassNames } from '@pkg/domain';
import type { JobSummary, Product, ProductUnitSummary, QuoteSummary } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@pkg/domain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pkg/domain')>()),
  formatCurrency: (amount: number, currencyCode: string) => `${currencyCode} ${amount}`,
  formatDate: () => '5 Aug 2026',
  pricePersistedQuote: () => ({ total: 125_000 }),
}));
vi.mock('@tabler/icons-react-native', () => ({
  IconAlertTriangle: 'IconAlertTriangle',
  IconArrowsSort: 'IconArrowsSort',
  IconBrush: 'IconBrush',
  IconCheck: 'IconCheck',
  IconClipboardList: 'IconClipboardList',
  IconFilter: 'IconFilter',
  IconHammer: 'IconHammer',
  IconPackage: 'IconPackage',
  IconPlus: 'IconPlus',
  IconTool: 'IconTool',
  IconTools: 'IconTools',
  IconTruckDelivery: 'IconTruckDelivery',
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', useWindowDimensions: () => ({ width: 400 }), View: 'View' }));
vi.mock('@/components/CatalogList', () => ({ CatalogListCard: 'CatalogListCard' }));
vi.mock('@/components/ListControls', () => ({
  ListControlRow: 'ListControlRow',
  ListDropdownControl: 'ListDropdownControl',
  ListSearchControl: 'ListSearchControl',
}));
vi.mock('@/components/quotes/QuoteStatusChip', () => ({ QuoteStatusChip: 'QuoteStatusChip' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/units/UnitBuildStateChip', () => ({ UnitBuildStateChip: 'UnitBuildStateChip' }));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'dark' }) }));

import type { BayListCard } from '@/lib/use-bay-list';
import { PlanCatalogCard } from './bays/PlanCatalog';
import { JobCatalogCard } from './jobs/JobCatalog';
import { ProductCatalogCard } from './products/ProductCatalog';
import { QuoteCatalogCard } from './quotes/QuoteCatalog';
import { StockBadge } from './StockBadge';
import { UnitCatalogCard } from './units/UnitCatalog';

type ElementProps = { children?: unknown; [key: string]: unknown };
type TestElement = React.ReactElement<ElementProps>;

function asElement(value: unknown): TestElement {
  return value as TestElement;
}

describe('catalog card mappings', () => {
  test('maps a Job to code, work, Customer/serial, and Schedule state', () => {
    const card = asElement(
      JobCatalogCard({
        job: {
          code: 'JOB-00042',
          customerCompanyName: 'Acme Farms',
          id: 'job-1',
          productName: 'Square Baler',
          productThumbnailDataUrl: 'data:image/png;base64,job',
          productUnit: { productSerialNumber: '260042' },
          quoteKind: 'product',
          scheduleState: {
            active: 1,
            done: 0,
            firstWorkDay: '2026-08-05',
            lastWorkDay: '2026-08-12',
            scheduled: 1,
            total: 2,
          },
          workTitle: null,
        } as JobSummary,
      }),
    );

    expect(card.props).toMatchObject({
      avatarName: 'Square Baler',
      avatarUri: 'data:image/png;base64,job',
      mainText: 'JOB-00042',
      monoText: 'Acme Farms · 260042',
      subText: 'Square Baler',
    });
    expect(asElement(card.props.trailing).props.job).toMatchObject({
      code: 'JOB-00042',
      scheduleState: { active: 1, total: 2 },
    });
  });

  test('shows stored completion once as a checked date without replacing the schedule state', () => {
    const card = asElement(
      JobCatalogCard({
        job: {
          code: 'JOB-00043',
          completedOn: '2026-08-05',
          customerCompanyName: null,
          id: 'job-2',
          productName: 'Square Baler',
          productUnit: null,
          quoteKind: 'product',
          scheduleState: {
            active: 0,
            done: 1,
            firstWorkDay: '2026-08-01',
            lastWorkDay: '2026-08-04',
            scheduled: 0,
            total: 1,
          },
          workTitle: null,
        } as JobSummary,
      }),
    );
    const summary = asElement(card.props.trailing);
    const rendered = asElement((summary.type as (props: ElementProps) => unknown)(summary.props));
    const scheduleBadges = (rendered.props.children as unknown[])[0] as TestElement[];
    const serialized = JSON.stringify(rendered);

    expect(scheduleBadges[0]?.props.item).toEqual({ count: 1, label: 'Done', tone: 'gray' });
    expect(serialized).toContain('IconCheck');
    expect(serialized.match(/5 Aug 2026/g)).toHaveLength(1);
    expect(serialized).not.toContain('COMPLETE');
    expect(card.props.monoText).toBeUndefined();
    const stockBadge = ((asElement(card.props.metadata).props.children as TestElement[])[0] ?? null) as TestElement;
    expect(stockBadge.type).toBe(StockBadge);
    expect(stockBadge.props.size).toBe('compact');
  });

  test('uses the shared Quote-sized status treatment for a not-scheduled badge', () => {
    const card = asElement(
      JobCatalogCard({
        job: {
          code: 'JOB-00044',
          completedOn: null,
          customerCompanyName: null,
          id: 'job-3',
          productName: 'Square Baler',
          productUnit: null,
          quoteKind: 'product',
          scheduleState: {
            active: 0,
            done: 0,
            firstWorkDay: null,
            lastWorkDay: null,
            scheduled: 0,
            total: 0,
          },
          workTitle: null,
        } as JobSummary,
      }),
    );
    const summary = asElement(card.props.trailing);
    const renderedSummary = asElement((summary.type as (props: ElementProps) => unknown)(summary.props));
    const badges = (renderedSummary.props.children as unknown[])[0] as TestElement[];
    const badge = badges[0] as TestElement;
    const renderedBadge = asElement((badge.type as (props: ElementProps) => unknown)(badge.props));
    const renderedPrimitive = asElement((renderedBadge.type as (props: ElementProps) => unknown)(renderedBadge.props));
    const badgeText = asElement(renderedPrimitive.props.children);

    expect(renderedPrimitive.props.className).toContain('px-2 py-1');
    expect(renderedPrimitive.props.className).toContain(statusBadgeColorClassNames.orange.chip);
    expect(badgeText.props.className).toContain('text-[10px] tracking-wide');
    expect(badgeText.props.className).toContain(statusBadgeColorClassNames.orange.text);
    expect(badgeText.props.mono).toBe(true);
  });

  test('wraps mixed Schedule badges within the shared fixed-height catalog card', () => {
    const card = asElement(
      JobCatalogCard({
        job: {
          code: 'JOB-00045',
          completedOn: null,
          customerCompanyName: null,
          id: 'job-4',
          productName: 'Square Baler',
          productUnit: null,
          quoteKind: 'product',
          scheduleState: {
            active: 1,
            done: 1,
            firstWorkDay: '2026-08-01',
            lastWorkDay: '2026-08-10',
            scheduled: 1,
            total: 3,
          },
          workTitle: null,
        } as JobSummary,
      }),
    );
    const summary = asElement(card.props.trailing);
    const rendered = asElement((summary.type as (props: ElementProps) => unknown)(summary.props));

    expect(rendered.props.className).toContain('flex-row flex-wrap');
    expect((rendered.props.children as unknown[])[0]).toHaveLength(3);
  });

  test('maps a Bay to operator, active Job/Customer, and days left', () => {
    const card = asElement(
      PlanCatalogCard({
        bay: {
          active: {
            customerCompanyName: 'Acme Farms',
            jobCode: 'JOB-00042',
            jobDisplayName: 'Square Baler',
            lastWorkDay: '2026-08-12',
            remainingWorkDays: 5,
          },
          id: 'bay-1',
          name: 'Assembly Bay 2 - Lindi',
          operator: {
            email: 'lindi@example.com',
            id: 'user-1',
            name: 'Lindi',
            thumbnailDataUrl: 'data:image/png;base64,operator',
          },
        } as BayListCard,
      }),
    );

    expect(card.props).toMatchObject({
      avatarName: 'Lindi',
      avatarUri: 'data:image/png;base64,operator',
      mainText: 'Lindi - Assembly Bay 2',
      monoText: 'Square Baler · Acme Farms',
      subText: 'JOB-00042',
    });
    expect(JSON.stringify(card.props.trailing)).toContain('5');
  });

  test('keeps the operator-first title for an idle unassigned Bay', () => {
    const card = asElement(
      PlanCatalogCard({
        bay: {
          active: null,
          id: 'bay-2',
          name: 'Supply',
          operator: null,
        } as BayListCard,
      }),
    );

    expect(card.props).toMatchObject({
      avatarName: 'Unassigned',
      mainText: 'Unassigned - Supply',
      monoText: undefined,
      subText: 'NO ACTIVE JOB',
    });
  });

  test('maps a Unit to serial, Product, ownership/date, and build state', () => {
    const card = asElement(
      UnitCatalogCard({
        unit: {
          buildState: 'on-hand',
          createdAt: '2026-08-05T08:00:00.000Z',
          id: 'unit-1',
          owner: null,
          product: {
            id: 'product-1',
            modelCode: 'JD-100',
            name: 'Baler',
            thumbnailDataUrl: 'data:image/png;base64,unit',
          },
          productSerialNumber: '260001',
          vinNumber: null,
        } as ProductUnitSummary,
      }),
    );

    expect(card.props).toMatchObject({
      avatarName: 'Baler',
      avatarUri: 'data:image/png;base64,unit',
      mainText: '260001',
      monoText: undefined,
      subText: 'Baler',
    });
    const stockBadge = ((asElement(card.props.metadata).props.children as TestElement[])[0] ?? null) as TestElement;
    expect(stockBadge.type).toBe(StockBadge);
    expect(stockBadge.props.size).toBe('compact');
    expect(JSON.stringify(card.props.metadata)).toContain('5 Aug 2026');
    expect(asElement(card.props.trailing).props).toMatchObject({ buildState: 'on-hand', owner: null });
  });

  test('maps a Product to name, Range/category, model code, and base price', () => {
    const card = asElement(
      ProductCatalogCard({
        product: {
          basePrice: 450_000,
          category: 'Square balers',
          currencyCode: 'ZAR',
          id: 'product-1',
          modelCode: 'JD-100',
          name: 'Baler',
          range: { id: 'range-1', name: 'Hay equipment' },
          thumbnailDataUrl: 'data:image/png;base64,product',
        } as Product,
      }),
    );
    const price = asElement(card.props.trailing);

    expect(card.props).toMatchObject({
      avatarName: 'Baler',
      avatarUri: 'data:image/png;base64,product',
      mainText: 'Baler',
      monoText: 'JD-100',
      subText: 'Hay equipment · Square balers',
    });
    expect(price.props.children).toBe('ZAR 450000');
  });

  test('maps a Quote to customer, offering, code/date, total, and status', () => {
    const card = asElement(
      QuoteCatalogCard({
        quote: {
          code: 'QUO-00042',
          createdAt: '2026-08-05T08:00:00.000Z',
          customerCompanyName: 'Acme Farms',
          customerThumbnailDataUrl: 'data:image/png;base64,customer',
          id: 'quote-1',
          kind: 'custom',
          quotedCurrencyCode: 'ZAR',
          status: 'sent',
          workTitle: 'Trailer rebuild',
        } as QuoteSummary,
      }),
    );
    const trailing = asElement(card.props.trailing);
    const trailingChildren = trailing.props.children as TestElement[];

    expect(card.props).toMatchObject({
      avatarName: 'Trailer rebuild',
      avatarUri: null,
      mainText: 'Acme Farms',
      monoText: 'QUO-00042 · 5 Aug 2026',
      subText: 'Trailer rebuild',
    });
    expect(asElement(card.props.avatarFallback).props).toMatchObject({ icon: 'IconTools', size: 22 });
    expect(trailingChildren[0].props.children).toBe('ZAR 125000');
    expect(trailingChildren[1].props.status).toBe('sent');
  });

  test('uses the quoted Product image for a Product Quote avatar', () => {
    const card = asElement(
      QuoteCatalogCard({
        quote: {
          code: 'QUO-00043',
          createdAt: '2026-08-05T08:00:00.000Z',
          customerCompanyName: 'Acme Farms',
          customerThumbnailDataUrl: 'data:image/png;base64,customer',
          id: 'quote-2',
          kind: 'product',
          product: {
            name: 'Gravel 18 ton',
            thumbnailDataUrl: 'data:image/png;base64,product',
          },
          quotedCurrencyCode: 'ZAR',
          status: 'draft',
        } as QuoteSummary,
      }),
    );

    expect(card.props).toMatchObject({
      avatarName: 'Gravel 18 ton',
      avatarUri: 'data:image/png;base64,product',
      mainText: 'Acme Farms',
      subText: 'Gravel 18 ton',
    });
  });
});
