import { isProductCoreError, readProductImage, replaceProductImage, type StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { ProductImageSlotParams } from '@pkg/schema';

import { type EntityImageRouteConfig, RouteHttpError } from '../images/entity-image-http.route.js';

// Product image slots, wired into the generic entity-image registrar. Image uploads use the same
// permission as editing a Product; previews use Product read access.
export function createProductImageRouteConfig(storage: StorageAdapter): EntityImageRouteConfig {
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
    read: ({ rawParams }) => {
      const params = ProductImageSlotParams.parse(rawParams);

      return readProductImage({ db, productId: params.productId, slot: params.slot, storage });
    },
  };
}
