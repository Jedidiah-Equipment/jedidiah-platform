import { type QueuedReading, ReadingSyncError } from './reading-queue';

/** HTTP status alone is insufficient: only the ledger's below-latest code offers a dispute. */
export async function uploadReading(item: QueuedReading, send: (body: FormData) => Promise<Response>, photo?: Blob) {
  const body = new FormData();
  for (const field of ['localId', 'machineId', 'role', 'value', 'capturedAt', 'disputePrevious'] as const) {
    body.append(field, String(item[field]));
  }
  if (item.expectedPreviousId !== undefined) body.append('expectedPreviousId', item.expectedPreviousId ?? '');
  if (item.comment) body.append('comment', item.comment);
  if (item.photoLocalUri) {
    if (photo) body.append('photo', photo, 'meter.jpg');
    else body.append('photo', { uri: item.photoLocalUri, type: 'image/jpeg', name: 'meter.jpg' } as unknown as Blob);
  }
  const response = await send(body);
  if (response.ok) return;
  if (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status)) {
    const error = await response.json().catch(() => ({}));
    throw new ReadingSyncError(
      error.data?.appCode ?? 'reading.refused',
      error.message ?? 'The server refused this reading.',
    );
  }
  throw new Error('Waiting to sync. Check your connection and sign-in.');
}
