import type { PartLabelBatchSelection, UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';
import { readApiErrorMessage } from '@/utils/document.js';

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
      if ('ids' in selection) params.set('ids', selection.ids.join(','));
      else throw new Error('Copy-count Part label batches must be posted.');
      break;
  }

  return `${getClientConfig().apiBaseUrl}/api/parts/labels?${params.toString()}`;
}

/** Copy-count batches can outgrow an HTTP request target, so their structural selection rides in JSON. */
export async function openPartLabelBatchPdf(selection: PartLabelBatchSelection): Promise<void> {
  const preview = window.open('', '_blank');
  if (!preview) throw new Error('Allow pop-ups to open the printable Part labels.');
  preview.opener = null;

  try {
    const response = await fetch(`${getClientConfig().apiBaseUrl}/api/parts/labels`, {
      body: JSON.stringify(selection),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Unable to generate the printable Part labels.'));
    }

    const url = URL.createObjectURL(await response.blob());
    preview.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    preview.close();
    throw error;
  }
}
