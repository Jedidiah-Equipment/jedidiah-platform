import { type DocumentCoreError, isDocumentCoreError, listProductDocuments } from '@pkg/core';
import { DocumentListByProductInput } from '@pkg/schema';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const documentsRouter = router({
  listByProduct: authorizedProcedure('product:read')
    .input(DocumentListByProductInput)
    .query(({ ctx, input }) =>
      mapDocumentErrors(() => listProductDocuments({ access: ctx.access, db: ctx.db, productId: input.productId })),
    ),
});

export async function mapDocumentErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isDocumentCoreError, mapDocumentCoreError);
}

export function mapDocumentCoreError(error: DocumentCoreError): CoreErrorMapping<DocumentCoreError['code']> {
  switch (error.code) {
    case 'document.content_type_not_allowed':
    case 'document.file_too_large':
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
    case 'document.forbidden':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'document.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Document not found.',
      };
    case 'document.owner_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Product not found.',
      };
    default:
      return assertNever(error);
  }
}
