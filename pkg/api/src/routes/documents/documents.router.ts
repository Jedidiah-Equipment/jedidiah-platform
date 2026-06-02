import {
  type DocumentCoreError,
  deleteProductDocument,
  getProductDocuments,
  isDocumentCoreError,
  isProductCoreError,
  type ProductCoreError,
} from '@pkg/core';
import { DocumentListByProductInput, ProductDocumentInput } from '@pkg/schema';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const documentsRouter = router({
  listByProduct: authorizedProcedure('product:read')
    .input(DocumentListByProductInput)
    .query(({ ctx, input }) =>
      mapDocumentErrors(() => getProductDocuments({ db: ctx.db, productId: input.productId })),
    ),
  deleteByProduct: authorizedProcedure('product:update')
    .input(ProductDocumentInput)
    .mutation(({ ctx, input }) =>
      mapDocumentErrors(() =>
        deleteProductDocument({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          documentId: input.documentId,
          productId: input.productId,
        }),
      ),
    ),
});

export async function mapDocumentErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(
    () => mapKnownCoreError(action, isProductCoreError, mapDocumentProductCoreError),
    isDocumentCoreError,
    mapDocumentCoreError,
  );
}

export function mapDocumentCoreError(error: DocumentCoreError): CoreErrorMapping<DocumentCoreError['code']> {
  switch (error.code) {
    case 'document.content_type_not_allowed':
    case 'document.file_too_large':
    case 'document.metadata_invalid':
    case 'document.storage_key_conflict':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'document.duplicate_filename':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A document with this filename already exists for this Product.',
      };
    case 'document.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Document not found.',
      };
    default:
      return assertNever(error);
  }
}

function mapDocumentProductCoreError(error: ProductCoreError): CoreErrorMapping<ProductCoreError['code']> {
  if (error.code === 'product.not_found') {
    return {
      appCode: error.code,
      code: 'NOT_FOUND',
      message: 'Product not found.',
    };
  }

  return {
    appCode: error.code,
    code: 'BAD_REQUEST',
    message: error.message,
  };
}
