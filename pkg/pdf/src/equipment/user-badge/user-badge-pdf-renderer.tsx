import type { UserBadgePdfRenderer } from '@pkg/schema/equipment';
import { renderToBuffer } from '@react-pdf/renderer';

import { UserBadgePdf } from './UserBadgePdf.js';

export const renderUserBadgesPdf: UserBadgePdfRenderer = async ({ document }) => {
  const buffer = await renderToBuffer(<UserBadgePdf badges={document} />);

  return new Uint8Array(buffer);
};
