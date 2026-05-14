import type { AppRole } from '@pkg/schema';

export const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  'job-stage-editor': 'Job stage editor',
  'job-supervisor': 'Job supervisor',
  'job-viewer': 'Job viewer',
  'product-editor': 'Product editor',
  'product-viewer': 'Product viewer',
};
