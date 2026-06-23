import { createRequire } from 'node:module';
import { JEDIDIAH_FOOTER_BANNER_ASSET_PATH, JEDIDIAH_LOGO_ASSET_PATH } from '@pkg/domain';

const require = createRequire(import.meta.url);

// Absolute paths to brand assets shipped in @pkg/domain; passed directly to <Image src>.
export const jedidiahLogoSrc = require.resolve(`@pkg/domain/assets/${JEDIDIAH_LOGO_ASSET_PATH}`);
export const jedidiahFooterBannerSrc = require.resolve(`@pkg/domain/assets/${JEDIDIAH_FOOTER_BANNER_ASSET_PATH}`);
