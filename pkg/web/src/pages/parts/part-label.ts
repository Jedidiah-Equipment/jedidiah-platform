import type { PartLabelBatchSelection, UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

type PartLabelBatchMode = PartLabelBatchSelection['selection'];

export const partLabelBatchModeLabels = {
  all: 'All Parts',
  category: 'By category',
  ids: 'Choose Parts',
  storageLocation: 'By storage location',
} satisfies Record<PartLabelBatchMode, string>;

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
      if (selection.copies) params.set('copies', selection.copies.join(','));
      break;
  }

  return `${getClientConfig().apiBaseUrl}/api/parts/labels?${params.toString()}`;
}
