import { randomUUID } from 'node:crypto';

import { type BrochureImageStore, type DatabaseTransaction, type Db, products } from '@pkg/db';
import { evaluateBrochureCompleteness } from '@pkg/domain';
import {
  type AuthId,
  BROCHURE_IMAGE_SLOT_SPECS,
  BROCHURE_IMAGE_SLOTS,
  type BrochureDocumentImages,
  type BrochureDocumentModel,
  type BrochurePdfRenderer,
  type Product,
  type UUID,
} from '@pkg/schema';
import { eq } from 'drizzle-orm';

import {
  createDocumentRecord,
  readStoredObjectBytes,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { ProductBrochureIncompleteError, ProductNotFoundError } from './product-errors.js';
import { getProduct } from './product-service.js';

export type BrochurePreviewResult = {
  bytes: Uint8Array;
  filename: string;
};

/**
 * Renders the on-the-fly Brochure preview PDF for a Product WITHOUT persisting it. Gated on the shared
 * completeness predicate: an incomplete brochure throws {@link ProductBrochureIncompleteError} rather
 * than producing a partial document. The PDF renderer is injected so @pkg/core never imports react-pdf.
 */
export async function renderProductBrochurePreview({
  db,
  pdfRenderer,
  productId,
  storage,
}: {
  db: Db;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult> {
  const product = await getProduct({ db, id: productId });

  if (!isBrochureComplete(product)) {
    const completeness = evaluateBrochureCompleteness(brochureCompletenessInput(product));
    throw new ProductBrochureIncompleteError(productId, completeness.missingFields);
  }

  return renderBrochureForProduct({ db, pdfRenderer, product, storage });
}

/**
 * Generates the Brochure PDF from a Product's live config when the completeness gate is met, or returns
 * null when it is not. Unlike {@link renderProductBrochurePreview}, an incomplete config is not an error
 * here: callers that fold the brochure into a larger packet (the Quote Document) treat an absent brochure
 * as a non-blocking skip and surface a warning instead of failing the whole generation.
 */
export async function generateProductBrochureIfComplete({
  db,
  pdfRenderer,
  productId,
  storage,
}: {
  db: Db;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult | null> {
  const product = await getProduct({ db, id: productId });

  if (!isBrochureComplete(product)) {
    return null;
  }

  return renderBrochureForProduct({ db, pdfRenderer, product, storage });
}

/**
 * Generates the Brochure from a Product's live config and saves it as a standalone immutable Job
 * Document. When the config is incomplete, nothing is created — consistent with the shared completeness
 * gate, so a job with an unconfigured brochure simply has no brochure document. The PDF is generated
 * fresh and persisted at creation time, so a later edit to the Product's brochure config never changes
 * an already-saved Job Document.
 *
 * The config read uses `db` (the Product and its images are untouched by the job-create transaction),
 * while the document row is inserted on `tx` so it commits atomically with the rest of job creation.
 */
export async function snapshotJobBrochureDocument({
  actorUserId,
  db,
  jobId,
  pdfRenderer,
  productId,
  storage,
  tx,
}: {
  actorUserId: AuthId;
  db: Db;
  jobId: UUID;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
  tx: DatabaseTransaction;
}): Promise<void> {
  const brochure = await generateProductBrochureIfComplete({ db, pdfRenderer, productId, storage });

  if (!brochure) {
    return;
  }

  const storageKey = `documents/job/${jobId}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(brochure.filename)}`;
  await createDocumentRecord({
    actorUserId,
    db: tx,
    input: {
      bytes: brochure.bytes,
      filename: brochure.filename,
      jobId,
      metadata: { type: 'brochure' },
      ownerType: 'job',
      sourceProductId: productId,
      storageKey,
    },
    storage,
  });
}

async function renderBrochureForProduct({
  db,
  pdfRenderer,
  product,
  storage,
}: {
  db: Db;
  pdfRenderer: BrochurePdfRenderer;
  product: Product;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult> {
  const document = await getBrochureDocumentModel({ db, product, storage });
  const filename = `${product.modelCode}-brochure.pdf`;
  const bytes = await pdfRenderer({ document, filename });

  return { bytes, filename };
}

function isBrochureComplete(product: Product): boolean {
  return evaluateBrochureCompleteness(brochureCompletenessInput(product)).complete;
}

function brochureCompletenessInput(product: Product) {
  return {
    assemblyCount: product.assemblies.length,
    description: product.description,
    images: product.brochureConfig.images,
    keyFeatures: product.brochureConfig.keyFeatures,
    subtitle: product.brochureConfig.subtitle,
  };
}

/**
 * Assembles the renderer input model from a Product read plus its stored Brochure images. The title
 * comes from the product name, body copy from the description (one paragraph per non-empty line), and
 * the Standard/Optional columns from the product's assemblies. Image bytes are read from object storage
 * and inlined as data URIs so the renderer stays a pure function over the model.
 */
export async function getBrochureDocumentModel({
  db,
  product,
  storage,
}: {
  db: Db;
  product: Product;
  storage: StorageAdapter;
}): Promise<BrochureDocumentModel> {
  const images = await resolveBrochureImages({ db, productId: product.id, storage });

  return {
    bodyCopy: toDisplayLines(product.description),
    images,
    keyFeatures: product.brochureConfig.keyFeatures,
    modelCode: product.modelCode,
    optionalAssemblies: product.assemblies
      .filter((assembly) => assembly.kind === 'optional')
      .map((assembly) => assembly.name),
    standardAssemblies: product.assemblies
      .filter((assembly) => assembly.kind === 'standard')
      .map((assembly) => assembly.name),
    subtitle: product.brochureConfig.subtitle,
    title: product.name,
  };
}

async function resolveBrochureImages({
  db,
  productId,
  storage,
}: {
  db: Db;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochureDocumentImages> {
  const [row] = await db
    .select({ brochureImages: products.brochureImages })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) {
    throw new ProductNotFoundError(productId);
  }

  const store: BrochureImageStore = row.brochureImages;
  const entries = await Promise.all(
    BROCHURE_IMAGE_SLOTS.map(async (slot) => {
      const ref = store[slot];

      if (!ref) {
        return [slot, null] as const;
      }

      const bytes = await readStoredObjectBytes(storage, ref.storageKey);
      const dataUri = `data:${ref.contentType};base64,${Buffer.from(bytes).toString('base64')}`;

      return [slot, { dataUri, fit: BROCHURE_IMAGE_SLOT_SPECS[slot].fit }] as const;
    }),
  );

  return Object.fromEntries(entries) as BrochureDocumentImages;
}

function toDisplayLines(value: string | null | undefined): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}
