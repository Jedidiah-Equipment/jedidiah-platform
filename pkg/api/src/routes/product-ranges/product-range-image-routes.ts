import {
  isProductRangeCoreError,
  readProductRangeImage,
  readProductRangeLogo,
  replaceProductRangeImage,
  replaceProductRangeLogo,
  type StorageAdapter,
} from '@pkg/core';
import { db } from '@pkg/db';
import { ProductRangeImageParams, ProductRangeLogoParams } from '@pkg/schema';

import { type EntityImageRouteConfig, RouteHttpError } from '../images/entity-image-http.route.js';

// Owner-not-found surfaces as the Range's core error; shared by the image and logo route configs so the
// generic registrar stays free of Range specifics.
function mapProductRangeOwnerError(error: unknown): RouteHttpError | undefined {
  if (!isProductRangeCoreError(error)) {
    return undefined;
  }

  const notFound = error.code === 'product_range.not_found';

  return new RouteHttpError({
    appCode: error.code,
    message: notFound ? 'Product Range not found.' : error.message,
    statusCode: notFound ? 404 : 400,
  });
}

// The Product Range presentation image, wired into the generic entity-image registrar. Uploads use the
// same permission as editing a Range; previews use Range read access.
export function createProductRangeImageRouteConfig(storage: StorageAdapter): EntityImageRouteConfig {
  return {
    uploadPath: '/api/product-ranges/:rangeId/image',
    downloadPath: '/api/product-ranges/:rangeId/image/download',
    uploadPermission: 'product_range:update',
    readPermission: 'product_range:read',
    uploadForbiddenMessage: 'You do not have permission to update Product Range images.',
    readForbiddenMessage: 'You do not have permission to view this Product Range image.',
    noFileMessage: 'Choose an image to upload.',
    mapOwnerError: mapProductRangeOwnerError,
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

// The Product Range brochure logo, wired into the generic entity-image registrar. Mirrors the image
// config; uploads use the Range-update permission, previews use Range read access.
export function createProductRangeLogoRouteConfig(storage: StorageAdapter): EntityImageRouteConfig {
  return {
    uploadPath: '/api/product-ranges/:rangeId/logo',
    downloadPath: '/api/product-ranges/:rangeId/logo/download',
    uploadPermission: 'product_range:update',
    readPermission: 'product_range:read',
    uploadForbiddenMessage: 'You do not have permission to update Product Range logos.',
    readForbiddenMessage: 'You do not have permission to view this Product Range logo.',
    noFileMessage: 'Choose a logo to upload.',
    mapOwnerError: mapProductRangeOwnerError,
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
