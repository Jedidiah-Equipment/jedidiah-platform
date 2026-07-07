import {
  createCustomer,
  createJob,
  createPart,
  createProduct,
  createQuote,
  createSupplier,
  type StorageAdapter,
} from '@pkg/core';
import type { Db } from '@pkg/db';
import {
  type Customer,
  type CustomerCreateInput,
  DateIso,
  DateOnlyIso,
  type JobDetail,
  type Part,
  type PartCreateInput,
  type Product,
  type ProductCreateInput,
  type QuoteCreateInput,
  type QuoteDetail,
  type Supplier,
  type SupplierCreateInput,
} from '@pkg/schema';
import { MemoryStorage } from './create-tester.js';
import { createProductRangeFixture } from './product-range-fixtures.js';
import { createEmail, createModelCode } from './tools.js';

const actorUserId = 'test-user-id';

export async function createCustomerFixture(
  db: Db,
  companyName: string,
  overrides: Partial<CustomerCreateInput> = {},
): Promise<Customer> {
  return createCustomer({
    actorUserId,
    db,
    input: {
      address: null,
      companyName,
      contactPerson: null,
      email: createEmail(companyName),
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
      ...overrides,
      vatNumber: overrides.vatNumber ?? null,
    },
  });
}

export async function createProductFixture(
  db: Db,
  name: string,
  rangeId: string,
  overrides: Partial<ProductCreateInput> = {},
): Promise<Product> {
  return createProduct({
    actorUserId,
    db,
    input: {
      assemblies: [],
      basePrice: 1_000,
      brochureEnabled: false,
      buildTimeDays: 14,
      category: null,
      currencyCode: 'ZAR',
      description: null,
      keyFeatures: [],
      landerEnabled: false,
      modelCode: createModelCode(name),
      name,
      nameHighlight: null,
      productBays: [],
      rangeId,
      requiresVinNumber: false,
      technicalDetails: [],
      thumbnailDataUrl: null,
      variantId: null,
      ...overrides,
    },
  });
}

export async function createSupplierFixture(
  db: Db,
  companyName: string,
  overrides: Partial<SupplierCreateInput> = {},
): Promise<Supplier> {
  return createSupplier({
    actorUserId,
    db,
    input: {
      address: null,
      companyName,
      contactPerson: null,
      email: createEmail(companyName),
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
      ...overrides,
    },
  });
}

export async function createPartFixture(db: Db, overrides: Partial<PartCreateInput> = {}): Promise<Part> {
  const supplier = await createSupplierFixture(db, `AI Part Supplier ${overrides.code ?? 'default'}`);

  return createPart({
    actorUserId,
    db,
    input: {
      category: 'Hydraulics',
      code: 'PART-001',
      description: 'Hydraulic hose',
      drawingCode: null,
      finish: 'Rubber',
      isInternallyFabricated: false,
      name: 'Hydraulic hose',
      supplierCode: 'SUP-PART-001',
      supplierId: supplier.id,
      unitOfMeasure: 'quantity',
      ...overrides,
    },
  });
}

export async function createQuoteFixture(
  db: Db,
  productId: Product['id'],
  overrides: Partial<QuoteCreateInput> = {},
): Promise<QuoteDetail> {
  return createQuote({
    actorUserId,
    db,
    input: {
      customer: {
        address: null,
        companyName: 'Ready Customer',
        contactPerson: null,
        email: null,
        phone: null,
        type: 'inline',
      },
      deliveryIncluded: true,
      deliveryPrice: 0,
      depositPercent: 30,
      discountPercent: 10,
      documentNotes: '30% deposit, balance on delivery',
      lineItems: [],
      notes: null,
      offering: { kind: 'product', productId },
      plannedDeliveryDate: DateOnlyIso.parse('2026-07-15'),
      preferredDeliveryDate: DateOnlyIso.parse('2026-07-10'),
      salesPersonId: actorUserId,
      selectedAssemblies: [],
      status: 'draft',
      validUntil: DateIso.parse('2026-06-30'),
      ...overrides,
    },
  });
}

export async function createProductWithRangeFixture(db: Db, name: string): Promise<Product> {
  const rangeId = await createProductRangeFixture(db);

  return createProductFixture(db, name, rangeId);
}

export async function createJobFixture(db: Db, quoteId: QuoteDetail['id']): Promise<JobDetail> {
  return createJob({
    actorUserId,
    brochureRenderer: async () => new Uint8Array(),
    db,
    input: { baySeeds: [], quoteId },
    storage: new MemoryStorage() as StorageAdapter,
  });
}
