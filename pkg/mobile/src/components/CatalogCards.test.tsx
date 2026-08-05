import type { Product, ProductUnitSummary, QuoteSummary } from '@pkg/schema';
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
  IconFilter: 'IconFilter',
  IconPlus: 'IconPlus',
  IconTools: 'IconTools',
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

import { ProductCatalogCard } from './products/ProductCatalog';
import { QuoteCatalogCard } from './quotes/QuoteCatalog';
import { UnitCatalogCard } from './units/UnitCatalog';

type ElementProps = { children?: unknown; [key: string]: unknown };
type TestElement = React.ReactElement<ElementProps>;

function asElement(value: unknown): TestElement {
  return value as TestElement;
}

describe('catalog card mappings', () => {
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
      monoText: 'Stock · 5 Aug 2026',
      subText: 'Baler',
    });
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
