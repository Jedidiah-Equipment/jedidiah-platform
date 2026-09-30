import type { UUID } from '@pkg/schema';
import type { PartLabelBatchSelection } from '@pkg/schema/equipment';
import { readApiErrorMessage } from '@/equipment/utils/document.js';
import { getClientConfig } from '@/lib/app-config.js';

/** The modes small enough to ride a query string; copy-count and import-batch selections are posted instead. */
export type PartLabelUrlSelection = Exclude<PartLabelBatchSelection, { selection: 'copies' | 'importBatch' }>;

/** Every way the batch dialog picks Parts: the URL modes, plus one saved Part Import Batch. */
export type PartLabelBatchMode = PartLabelUrlSelection['selection'] | 'importBatch';

export const partLabelBatchModeLabels = {
  all: 'All Parts',
  category: 'By Part Category',
  ids: 'Choose Parts',
  importBatch: 'Recent imports',
  storageLocation: 'By storage location',
} satisfies Record<PartLabelBatchMode, string>;

export function partLabelUrl(partId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/parts/${encodeURIComponent(partId)}/label`;
}

export function partLabelBatchUrl(selection: PartLabelUrlSelection): string {
  const params = new URLSearchParams({ selection: selection.selection });

  switch (selection.selection) {
    case 'all':
      break;
    case 'category':
      params.set('categoryId', selection.categoryId);
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

/**
 * Copy-count and import-batch selections can outgrow an HTTP request target, so their structural
 * selection rides in JSON.
 */
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
