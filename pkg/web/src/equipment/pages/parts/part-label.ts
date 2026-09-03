import type { PartLabelBatchSelection, UUID } from '@pkg/schema';
import { readApiErrorMessage } from '@/equipment/utils/document.js';
import { getClientConfig } from '@/lib/app-config.js';

/** The modes small enough to ride a query string; a copy-count selection is posted instead. */
export type PartLabelUrlSelection = Exclude<PartLabelBatchSelection, { selection: 'copies' }>;

export const partLabelBatchModeLabels = {
  all: 'All Parts',
  category: 'By category',
  ids: 'Choose Parts',
  storageLocation: 'By storage location',
} satisfies Record<PartLabelUrlSelection['selection'], string>;

export function partLabelUrl(partId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/parts/${encodeURIComponent(partId)}/label`;
}

export function partLabelBatchUrl(selection: PartLabelUrlSelection): string {
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

/** Copy-count batches can outgrow an HTTP request target, so their structural selection rides in JSON. */
export async function fetchPartLabelsBlob({
  selection,
  signal,
}: {
  selection: PartLabelBatchSelection;
  signal?: AbortSignal;
}): Promise<Blob> {
  const response = await fetch(`${getClientConfig().apiBaseUrl}/api/parts/labels`, {
    body: JSON.stringify(selection),
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to generate the printable Part labels.'));
  }

  return response.blob();
}
