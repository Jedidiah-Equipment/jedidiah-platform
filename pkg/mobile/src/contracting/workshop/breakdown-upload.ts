import { BREAKDOWN_REPORT_PATH, breakdownPhotosPath } from '@pkg/domain/contracting';
import { BreakdownDetail, type BreakdownReportInput, breakdownReportMultipartFields } from '@pkg/schema/contracting';
import { z } from 'zod';
import { readingPhotoPart } from '@/contracting/readings/reading-photo-part';
import { authedFetch } from '@/lib/authed-fetch';
import { addBreadcrumb } from '@/lib/observability';

// Six photos over a field connection take a while; a stalled upload still gives up.
const UPLOAD_TIMEOUT_MS = 90_000;
export const REPORT_FAILED = 'Could not send the report. Check your connection and try again.';
export const PHOTOS_FAILED = 'Could not add the photos. Check your connection and try again.';

const RefusalBody = z
  .object({ message: z.string().optional(), data: z.object({ appCode: z.string().optional() }).nullish() })
  .catch({});

/** The server judged the report and refused it; `message` is its sentence for the person reporting. */
export class BreakdownRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BreakdownRefusedError';
  }
}

export type BreakdownReportRequest = z.input<typeof BreakdownReportInput>;

/** Reports one Breakdown with its photos, one `photo` part each, and answers the stored Breakdown. */
export async function reportBreakdown(input: BreakdownReportRequest, photoUris: readonly string[]) {
  const body = new FormData();
  for (const [name, value] of breakdownReportMultipartFields(input)) body.append(name, value);
  return send(BREAKDOWN_REPORT_PATH, body, photoUris, REPORT_FAILED);
}

/** Adds photos to a Breakdown already reported. */
export async function addBreakdownPhotos(breakdownId: string, photoUris: readonly string[]) {
  return send(breakdownPhotosPath(breakdownId), new FormData(), photoUris, PHOTOS_FAILED);
}

async function send(path: string, body: FormData, photoUris: readonly string[], failed: string) {
  for (const [index, uri] of photoUris.entries())
    body.append('photo', await readingPhotoPart(uri), `breakdown-${index + 1}.jpg`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await authedFetch(path, { method: 'POST', body, signal: controller.signal }).catch(
      (error: unknown) => {
        throw new Error(failed, { cause: error });
      },
    );
    if (response.ok) return BreakdownDetail.parse(await response.json());
    if (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status)) {
      const refusal = RefusalBody.parse(
        await response.json().catch(() => {
          addBreadcrumb('contracting', 'breakdown refusal response unreadable', { status: response.status });
          return null;
        }),
      );
      throw new BreakdownRefusedError(
        refusal.data?.appCode ?? 'breakdown.refused',
        refusal.message ?? 'The server refused this report.',
      );
    }
    throw new Error(failed);
  } finally {
    clearTimeout(timeout);
  }
}
