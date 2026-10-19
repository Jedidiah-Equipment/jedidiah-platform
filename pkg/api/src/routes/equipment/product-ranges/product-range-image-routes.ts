import type { StorageAdapter } from '@pkg/core';
import {
  readProductRangeImage,
  readProductRangeLogo,
  replaceProductRangeImage,
  replaceProductRangeLogo,
} from '@pkg/core/equipment';
import type { Db } from '@pkg/db';
import { RANGE_IMAGE_POLICY, RANGE_LOGO_POLICY } from '@pkg/domain/equipment';
import { ProductRangeImageParams, ProductRangeLogoParams } from '@pkg/schema/equipment';

import { productRangeErrorFamily } from '../equipment-error-families.js';
import type { EntityFileRouteConfig } from '../files/entity-file-http.route.js';

// The Product Range presentation image, wired into the generic entity-file registrar. Uploads use the
// same permission as editing a Range; previews use Range read access.
export function createProductRangeImageRouteConfig(db: Db, storage: StorageAdapter): EntityFileRouteConfig {
  return {
    uploadPath: '/api/product-ranges/:rangeId/image',
    downloadPath: '/api/product-ranges/:rangeId/image/download',
    uploadPermission: 'equipment_product_range:update',
    readPermission: 'equipment_product_range:read',
    uploadForbiddenMessage: 'You do not have permission to update Product Range images.',
    readForbiddenMessage: 'You do not have permission to view this Product Range image.',
    noFileMessage: 'Choose an image to upload.',
    policy: RANGE_IMAGE_POLICY,
    ownerErrorFamilies: [productRangeErrorFamily],
    replace: ({ bytes, rawParams }) => {
      const params = ProductRangeImageParams.parse(rawParams);

      return replaceProductRangeImage({ db, input: { bytes, rangeId: params.rangeId }, storage });
    },
    read: ({ rawParams }) => {
      const params = ProductRangeImageParams.parse(rawParams);

      return readProductRangeImage({ db, rangeId: params.rangeId, storage });
    },
  };
}

// The Product Range brochure logo, wired into the generic entity-file registrar. Mirrors the image
// config; uploads use the Range-update permission, previews use Range read access.
export function createProductRangeLogoRouteConfig(db: Db, storage: StorageAdapter): EntityFileRouteConfig {
  return {
    uploadPath: '/api/product-ranges/:rangeId/logo',
    downloadPath: '/api/product-ranges/:rangeId/logo/download',
    uploadPermission: 'equipment_product_range:update',
    readPermission: 'equipment_product_range:read',
    uploadForbiddenMessage: 'You do not have permission to update Product Range logos.',
    readForbiddenMessage: 'You do not have permission to view this Product Range logo.',
    noFileMessage: 'Choose a logo to upload.',
    policy: RANGE_LOGO_POLICY,
    ownerErrorFamilies: [productRangeErrorFamily],
    replace: ({ bytes, rawParams }) => {
      const params = ProductRangeLogoParams.parse(rawParams);

      return replaceProductRangeLogo({ db, input: { bytes, rangeId: params.rangeId }, storage });
    },
    read: ({ rawParams }) => {
      const params = ProductRangeLogoParams.parse(rawParams);

      return readProductRangeLogo({ db, rangeId: params.rangeId, storage });
    },
  };
}
