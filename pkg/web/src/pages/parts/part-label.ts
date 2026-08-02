import type { PartLabelBatchSelection, UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

export function partLabelUrl(partId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/parts/${encodeURIComponent(partId)}/label`;
}

export function partLabelBatchUrl(selection: PartLabelBatchSelection): string {
  const params = new URLSearchParams({ selection: selection.selection });

  switch (selection.selection) {
    case 'all':
      break;
    case 'category':
      params.set('category', selection.category);
      break;
    case 'storageLocation':
      params.set('storageLocation', selection.storageLocation);
      break;
    case 'ids':
      params.set('ids', selection.ids.join(','));
      break;
  }

  return `${getClientConfig().apiBaseUrl}/api/parts/labels?${params.toString()}`;
}
