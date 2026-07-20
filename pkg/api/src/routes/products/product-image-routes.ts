import {
  type ImageCacheOptions,
  isProductCoreError,
  readMobileProductImage,
  readProductImage,
  replaceProductImage,
  type StorageAdapter,
  type StoredObject,
} from '@pkg/core';
import { db } from '@pkg/db';
import { ProductImageSlotParams } from '@pkg/schema';
import { z } from 'zod';

import { type EntityFileRouteConfig, RouteHttpError } from '../files/entity-file-http.route.js';

// Product image slots, wired into the generic entity-file registrar. Image uploads use the same
// permission as editing a Product; previews use Product read access.
export type ProductImageRouteOptions = ImageCacheOptions;

const ProductImageDownloadQuery = z.object({ variant: z.literal('mobile').optional() });

export function createProductImageRouteConfig(
  storage: StorageAdapter,
  imageOptions: ProductImageRouteOptions,
): EntityFileRouteConfig {
  return {
    uploadPath: '/api/products/:productId/images/:slot',
    downloadPath: '/api/products/:productId/images/:slot/download',
    uploadPermission: 'product:update',
    readPermission: 'product:read',
    uploadForbiddenMessage: 'You do not have permission to update Product images.',
    readForbiddenMessage: 'You do not have permission to view this product image.',
    noFileMessage: 'Choose an image to upload.',
    // Owner-not-found surfaces as the Product's core error; this config owns that mapping so the generic
    // registrar stays free of Product specifics.
    mapOwnerError: (error) => {
      if (!isProductCoreError(error)) {
        return undefined;
      }

      const notFound = error.code === 'product.not_found';

      return new RouteHttpError({
        appCode: error.code,
        message: notFound ? 'Product not found.' : error.message,
        statusCode: notFound ? 404 : 400,
      });
    },
    replace: ({ actorUserId, bytes, rawParams }) => {
      const params = ProductImageSlotParams.parse(rawParams);

      return replaceProductImage({
        actorUserId,
        db,
        input: { bytes, productId: params.productId, slot: params.slot },
        storage,
      });
    },
    read: async ({ rawParams, rawQuery }) => {
      const params = ProductImageSlotParams.parse(rawParams);
      const query = ProductImageDownloadQuery.parse(rawQuery);

      if (query.variant === 'mobile') {
        const optimized = await readMobileProductImage({
          cache: imageOptions,
          db,
          productId: params.productId,
          slot: params.slot,
          storage,
        });

        return {
          body: bytesBody(optimized.body),
          byteSize: optimized.byteSize,
          contentType: optimized.contentType,
        };
      }

      return readProductImage({ db, productId: params.productId, slot: params.slot, storage });
    },
  };
}

async function* bytesBody(bytes: Uint8Array): StoredObject['body'] {
  yield bytes;
}
