import { FieldReading, readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { z } from 'zod';
import { addBreadcrumb } from '@/lib/observability';
import { type QueuedReading, ReadingSyncError } from './reading-queue';

const DeliveredReading = z.looseObject({ photo: z.unknown() });
const RefusalBody = z
  .object({ message: z.string().optional(), data: z.object({ appCode: z.string().optional() }).nullish() })
  .catch({});

/**
 * HTTP status alone is insufficient: only the ledger's below-latest code offers a dispute.
 * Returns the delivered reading in field shape so the caller can update history without a refetch.
 */
export async function uploadReading(item: QueuedReading, send: (body: FormData) => Promise<Response>, photo?: Blob) {
  const body = new FormData();
  for (const [name, value] of readingCaptureMultipartFields({ ...item, comment: item.comment || undefined })) {
    body.append(name, value);
  }
  if (photo) body.append('photo', photo, 'meter.jpg');
  const response = await send(body);
  if (response.ok) {
    const row = DeliveredReading.parse(await response.json());
    return FieldReading.parse({ ...row, photoBacked: !!row.photo });
  }
  if (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status)) {
    const refusal = RefusalBody.parse(
      await response.json().catch(() => {
        addBreadcrumb('contracting', 'reading refusal response unreadable', { status: response.status });
        return null;
      }),
    );
    throw new ReadingSyncError(
      refusal.data?.appCode ?? 'reading.refused',
      refusal.message ?? 'The server refused this reading.',
    );
  }
  throw new Error('Waiting to sync. Check your connection and sign-in.');
}
