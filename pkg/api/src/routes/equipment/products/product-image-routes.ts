import type { ImageCacheOptions, StorageAdapter } from '@pkg/core';
import { readMobileProductImage, readProductImage, replaceProductImage } from '@pkg/core/equipment';
import type { Db } from '@pkg/db';
import { PRODUCT_IMAGE_POLICY } from '@pkg/domain/equipment';
import { ProductImageSlotParams } from '@pkg/schema/equipment';
import { z } from 'zod';

import { productErrorFamily } from '../equipment-error-families.js';
import type { EntityFileRouteConfig } from '../files/entity-file-http.route.js';

// Product image slots, wired into the generic entity-file registrar. Image uploads use the same
// permission as editing a Product; previews use Product read access.
export type ProductImageRouteOptions = ImageCacheOptions;

const ProductImageDownloadQuery = z.object({ variant: z.literal('mobile').optional() });

export function createProductImageRouteConfig(
  db: Db,
  storage: StorageAdapter,
  imageOptions: ProductImageRouteOptions,
): EntityFileRouteConfig {
  return {
    uploadPath: '/api/products/:productId/images/:slot',
    downloadPath: '/api/products/:productId/images/:slot/download',
    uploadPermission: 'equipment_product:update',
    readPermission: 'equipment_product:read',
    uploadForbiddenMessage: 'You do not have permission to update Product images.',
    readForbiddenMessage: 'You do not have permission to view this product image.',
    noFileMessage: 'Choose an image to upload.',
    policy: PRODUCT_IMAGE_POLICY,
    ownerErrorFamilies: [productErrorFamily],
    replace: ({ actorUserId, bytes, rawParams }) => {
      const params = ProductImageSlotParams.parse(rawParams);

      return replaceProductImage({
        actorUserId,
        db,
        input: { bytes, productId: params.productId, slot: params.slot },
        storage,
      });
    },
    read: ({ rawParams, rawQuery }) => {
      const params = ProductImageSlotParams.parse(rawParams);
      const query = ProductImageDownloadQuery.parse(rawQuery);

      if (query.variant === 'mobile') {
        return readMobileProductImage({
          cache: imageOptions,
          db,
          productId: params.productId,
          slot: params.slot,
          storage,
        });
      }

      return readProductImage({ db, productId: params.productId, slot: params.slot, storage });
    },
  };
}
