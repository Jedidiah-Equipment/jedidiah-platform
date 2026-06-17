import { readProductBrochureImage, replaceProductBrochureImage, type StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { BrochureImageSlotParams } from '@pkg/schema';

import type { EntityImageRouteConfig } from '../images/entity-image-http.route.js';

// Brochure image slots, wired into the generic entity-image registrar. Image uploads use the same
// permission as editing a Product; previews use Product read access.
export function createProductBrochureImageRouteConfig(storage: StorageAdapter): EntityImageRouteConfig {
  return {
    uploadPath: '/api/products/:productId/brochure-images/:slot',
    downloadPath: '/api/products/:productId/brochure-images/:slot/download',
    uploadPermission: 'product:update',
    readPermission: 'product:read',
    uploadForbiddenMessage: 'You do not have permission to update Product brochure images.',
    readForbiddenMessage: 'You do not have permission to view this brochure image.',
    noFileMessage: 'Choose an image to upload.',
    replace: ({ actorUserId, bytes, rawParams }) => {
      const params = BrochureImageSlotParams.parse(rawParams);

      return replaceProductBrochureImage({
        actorUserId,
        db,
        input: { bytes, productId: params.productId, slot: params.slot },
        storage,
      });
    },
    read: ({ rawParams }) => {
      const params = BrochureImageSlotParams.parse(rawParams);

      return readProductBrochureImage({ db, productId: params.productId, slot: params.slot, storage });
    },
  };
}
