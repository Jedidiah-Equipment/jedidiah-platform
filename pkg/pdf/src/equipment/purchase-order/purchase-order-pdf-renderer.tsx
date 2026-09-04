import type { PurchaseOrderPdfRenderer } from '@pkg/schema/equipment';
import { renderToBuffer } from '@react-pdf/renderer';

import { PurchaseOrderPdf } from './PurchaseOrderPdf.js';

export const renderPurchaseOrderPdf: PurchaseOrderPdfRenderer = async ({ document }) => {
  const buffer = await renderToBuffer(<PurchaseOrderPdf document={document} />);
  return new Uint8Array(buffer);
};
