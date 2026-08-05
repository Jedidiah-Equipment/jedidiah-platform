import { badgeScanToken } from '@pkg/domain';
import type { UserBadgePdfRenderer } from '@pkg/schema';
import { renderToBuffer } from '@react-pdf/renderer';

import { renderCode128Barcode } from '../part-label/code128.js';
import { UserBadgePdf } from './UserBadgePdf.js';

/**
 * The badge card the tablet's quick-switch reads. The barcode carries `badge:<userId>` rather than
 * the bare id: one scan field takes both Part labels and badges, and the prefix is what tells them
 * apart (`parseScanToken` in `@pkg/domain` owns both ends of that agreement).
 */
export const renderUserBadgesPdf: UserBadgePdfRenderer = async ({ document }) => {
  const items = await Promise.all(
    document.map(async (badge) => {
      const barcode = await renderCode128Barcode(badgeScanToken(badge.id));
      return { badge, barcodeDataUri: barcode.dataUri, barcodeWidth: barcode.width };
    }),
  );
  const buffer = await renderToBuffer(<UserBadgePdf items={items} />);

  return new Uint8Array(buffer);
};
