import { type Db, notRemoved, productAssemblies, productRanges, productRangeVariants, products } from '@pkg/db';
import {
  type CatalogTranslationKey,
  productRangeSourceHash,
  productRangeVariantSourceHash,
  productSourceHash,
} from '@pkg/domain';
import type { CatalogTranslationStatus } from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

type ProductTranslationSource = {
  canonical: {
    assemblies: Array<{ id: string; name: string }>;
    category: string | null;
    description: string | null;
    keyFeatures: string[];
    name: string;
    nameHighlight: string | null;
    technicalDetails: Array<{ label: string; value: string }>;
  };
  id: string;
  key: `product:${string}`;
  kind: 'product';
  sourceHash: string;
  state: CatalogTranslationState;
};

type ProductRangeTranslationSource = {
  canonical: { description: string | null; name: string };
  id: string;
  key: `product_range:${string}`;
  kind: 'range';
  sourceHash: string;
  state: CatalogTranslationState;
};

type ProductRangeVariantTranslationSource = {
  canonical: { name: string };
  id: string;
  key: `product_range_variant:${string}`;
  kind: 'variant';
  sourceHash: string;
  state: CatalogTranslationState;
};

export type CatalogTranslationState = 'fresh' | 'missing' | 'stale';

type ProductSourceRow = typeof products.$inferSelect & { assemblies: Array<typeof productAssemblies.$inferSelect> };
type ProductRangeVariantSourceRow = Pick<typeof productRangeVariants.$inferSelect, 'id' | 'name' | 'translations'>;

export type CatalogTranslationSource =
  | ProductTranslationSource
  | ProductRangeTranslationSource
  | ProductRangeVariantTranslationSource;

export type ProductCatalogTranslation = {
  assemblies: Array<{ id: string; name: string }>;
  category: string | null;
  description: string | null;
  keyFeatures: string[];
  name: string;
  nameHighlight: string | null;
  technicalDetails: Array<{ label: string; value: string }>;
};

export type ProductRangeCatalogTranslation = { description: string | null; name: string };
export type ProductRangeVariantCatalogTranslation = { name: string };

type PersistCatalogTranslationInput =
  | { source: ProductTranslationSource; translation: ProductCatalogTranslation }
  | { source: ProductRangeTranslationSource; translation: ProductRangeCatalogTranslation }
  | { source: ProductRangeVariantTranslationSource; translation: ProductRangeVariantCatalogTranslation };

export async function loadCatalogTranslationSource({
  db,
  key,
}: {
  db: Db;
  key: CatalogTranslationKey;
}): Promise<CatalogTranslationSource | null> {
  const separator = key.indexOf(':');
  const kind = key.slice(0, separator);
  const id = key.slice(separator + 1);

  if (kind === 'product') return loadProductSource(db, id, key as `product:${string}`);
  if (kind === 'product_range') return loadRangeSource(db, id, key as `product_range:${string}`);
  return loadVariantSource(db, id, key as `product_range_variant:${string}`);
}

export async function persistCatalogTranslation({
  db,
  source,
  translatedAt,
  translation,
}: PersistCatalogTranslationInput & { db: Db; translatedAt: Date }): Promise<void> {
  const metadata = { sourceHash: source.sourceHash, translatedAt: translatedAt.toISOString() };

  if (source.kind === 'product' && 'assemblies' in translation) {
    await db.transaction(async (tx) => {
      const { assemblies, ...productTranslation } = translation;
      await tx
        .update(products)
        .set({ translations: mergeAfrikaansTranslation(products.translations, { ...metadata, ...productTranslation }) })
        .where(and(eq(products.id, source.id), notRemoved(products)));

      for (const assembly of assemblies) {
        await tx
          .update(productAssemblies)
          .set({
            translations: mergeAfrikaansTranslation(productAssemblies.translations, {
              ...metadata,
              name: assembly.name,
            }),
          })
          .where(and(eq(productAssemblies.id, assembly.id), eq(productAssemblies.productId, source.id)));
      }
    });
    return;
  }

  if (source.kind === 'range' && 'description' in translation) {
    await db
      .update(productRanges)
      .set({ translations: mergeAfrikaansTranslation(productRanges.translations, { ...metadata, ...translation }) })
      .where(and(eq(productRanges.id, source.id), notRemoved(productRanges)));
    return;
  }

  if (source.kind === 'variant' && !('description' in translation) && !('assemblies' in translation)) {
    await db
      .update(productRangeVariants)
      .set({
        translations: mergeAfrikaansTranslation(productRangeVariants.translations, { ...metadata, ...translation }),
      })
      .where(and(eq(productRangeVariants.id, source.id), notRemoved(productRangeVariants)));
    return;
  }

  throw new Error(`Translation payload does not match ${source.kind} source`);
}

export async function listCatalogTranslationKeys({ db }: { db: Db }): Promise<CatalogTranslationKey[]> {
  const [productRows, rangeRows, variantRows] = await Promise.all([
    db.select({ id: products.id }).from(products).where(notRemoved(products)).orderBy(asc(products.id)),
    db
      .select({ id: productRanges.id })
      .from(productRanges)
      .where(notRemoved(productRanges))
      .orderBy(asc(productRanges.id)),
    db
      .select({ id: productRangeVariants.id })
      .from(productRangeVariants)
      .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
      .where(and(notRemoved(productRangeVariants), notRemoved(productRanges)))
      .orderBy(asc(productRangeVariants.id)),
  ]);

  return [
    ...productRows.map(({ id }): CatalogTranslationKey => `product:${id}`),
    ...rangeRows.map(({ id }): CatalogTranslationKey => `product_range:${id}`),
    ...variantRows.map(({ id }): CatalogTranslationKey => `product_range_variant:${id}`),
  ];
}

export async function getCatalogTranslationStatus({ db }: { db: Db }): Promise<CatalogTranslationStatus> {
  const sources = await loadAllCatalogTranslationSources(db);
  const status: CatalogTranslationStatus = {
    products: { missing: 0, stale: 0 },
    ranges: { missing: 0, stale: 0 },
    variants: { missing: 0, stale: 0 },
  };

  for (const source of sources) {
    if (source.state === 'fresh') continue;
    const group =
      source.kind === 'product' ? status.products : source.kind === 'range' ? status.ranges : status.variants;
    group[source.state] += 1;
  }

  return status;
}

export async function listCatalogTranslationKeysNeedingTranslation({
  db,
}: {
  db: Db;
}): Promise<CatalogTranslationKey[]> {
  const sources = await loadAllCatalogTranslationSources(db);
  return sources.filter((source) => source.state !== 'fresh').map((source) => source.key);
}

async function loadAllCatalogTranslationSources(db: Db): Promise<CatalogTranslationSource[]> {
  const [productRows, rangeRows, variantRows] = await Promise.all([
    db.query.products.findMany({
      orderBy: [asc(products.id)],
      where: notRemoved(products),
      with: { assemblies: { orderBy: [asc(productAssemblies.displayOrder), asc(productAssemblies.id)] } },
    }),
    db.query.productRanges.findMany({
      orderBy: [asc(productRanges.id)],
      where: notRemoved(productRanges),
    }),
    db
      .select({
        id: productRangeVariants.id,
        name: productRangeVariants.name,
        translations: productRangeVariants.translations,
      })
      .from(productRangeVariants)
      .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
      .where(and(notRemoved(productRangeVariants), notRemoved(productRanges)))
      .orderBy(asc(productRangeVariants.id)),
  ]);

  return [
    ...productRows.map((row) => toProductTranslationSource(row, `product:${row.id}`)),
    ...rangeRows.map((row) => toProductRangeTranslationSource(row, `product_range:${row.id}`)),
    ...variantRows.map((row) => toProductRangeVariantTranslationSource(row, `product_range_variant:${row.id}`)),
  ];
}

async function loadProductSource(
  db: Db,
  id: string,
  key: `product:${string}`,
): Promise<ProductTranslationSource | null> {
  const row = await db.query.products.findFirst({
    where: and(eq(products.id, id), notRemoved(products)),
    with: { assemblies: { orderBy: [asc(productAssemblies.displayOrder), asc(productAssemblies.id)] } },
  });
  if (!row) return null;

  return toProductTranslationSource(row, key);
}

function toProductTranslationSource(row: ProductSourceRow, key: `product:${string}`): ProductTranslationSource {
  const canonical = {
    assemblies: row.assemblies.map(({ id: assemblyId, name }) => ({ id: assemblyId, name })),
    category: row.category,
    description: row.description,
    keyFeatures: row.keyFeatures,
    name: row.name,
    nameHighlight: row.nameHighlight,
    technicalDetails: row.technicalDetails,
  };
  const sourceHash = productSourceHash(canonical, canonical.assemblies);
  const state = catalogTranslationState(sourceHash, [
    row.translations.af,
    ...row.assemblies.map((assembly) => assembly.translations.af),
  ]);

  return { canonical, id: row.id, key, kind: 'product', sourceHash, state };
}

async function loadRangeSource(
  db: Db,
  id: string,
  key: `product_range:${string}`,
): Promise<ProductRangeTranslationSource | null> {
  const row = await db.query.productRanges.findFirst({
    where: and(eq(productRanges.id, id), notRemoved(productRanges)),
  });
  if (!row) return null;

  return toProductRangeTranslationSource(row, key);
}

function toProductRangeTranslationSource(
  row: typeof productRanges.$inferSelect,
  key: `product_range:${string}`,
): ProductRangeTranslationSource {
  const canonical = { description: row.description, name: row.name };
  const sourceHash = productRangeSourceHash(canonical);
  const state = catalogTranslationState(sourceHash, [row.translations.af]);
  return { canonical, id: row.id, key, kind: 'range', sourceHash, state };
}

async function loadVariantSource(
  db: Db,
  id: string,
  key: `product_range_variant:${string}`,
): Promise<ProductRangeVariantTranslationSource | null> {
  const [row] = await db
    .select({
      id: productRangeVariants.id,
      name: productRangeVariants.name,
      translations: productRangeVariants.translations,
    })
    .from(productRangeVariants)
    .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
    .where(and(eq(productRangeVariants.id, id), notRemoved(productRangeVariants), notRemoved(productRanges)))
    .limit(1);
  if (!row) return null;

  return toProductRangeVariantTranslationSource(row, key);
}

function toProductRangeVariantTranslationSource(
  row: ProductRangeVariantSourceRow,
  key: `product_range_variant:${string}`,
): ProductRangeVariantTranslationSource {
  const canonical = { name: row.name };
  const sourceHash = productRangeVariantSourceHash(canonical);
  const state = catalogTranslationState(sourceHash, [row.translations.af]);
  return { canonical, id: row.id, key, kind: 'variant', sourceHash, state };
}

function catalogTranslationState(
  sourceHash: string,
  translations: Array<{ sourceHash: string } | undefined>,
): CatalogTranslationState {
  if (translations.some((translation) => translation === undefined)) return 'missing';
  return translations.some((translation) => translation?.sourceHash !== sourceHash) ? 'stale' : 'fresh';
}

function mergeAfrikaansTranslation(
  column:
    | typeof productAssemblies.translations
    | typeof productRanges.translations
    | typeof productRangeVariants.translations
    | typeof products.translations,
  translation: unknown,
) {
  return sql`jsonb_set(${column}, '{af}', ${JSON.stringify(translation)}::jsonb, true)`;
}
