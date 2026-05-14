import type { AppRole } from '@pkg/schema';

export const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  'product-editor': 'Product editor',
  'product-viewer': 'Product viewer',
};
