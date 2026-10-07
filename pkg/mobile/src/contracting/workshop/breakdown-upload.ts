import { BREAKDOWN_REPORT_PATH, breakdownPhotosPath } from '@pkg/domain/contracting';
import { BreakdownDetail, type BreakdownReportInput, breakdownReportMultipartFields } from '@pkg/schema/contracting';
import type { z } from 'zod';
import { filePart } from '@/lib/file-part';
import { postMultipart } from '@/lib/multipart-upload';

// Six photos over a field connection take a while; a stalled upload still gives up.
const UPLOAD_TIMEOUT_MS = 90_000;
const PHOTO_MISSING = 'The photo is no longer available. Retake it.';
export const REPORT_FAILED = 'Could not send the report. Check your connection and try again.';
export const PHOTOS_FAILED = 'Could not add the photos. Check your connection and try again.';

export type BreakdownReportRequest = z.input<typeof BreakdownReportInput>;

/** Reports one Breakdown with its photos, one `photo` part each, and answers the stored Breakdown. */
export async function reportBreakdown(input: BreakdownReportRequest, photoUris: readonly string[]) {
  const body = new FormData();
  for (const [name, value] of breakdownReportMultipartFields(input)) body.append(name, value);
  return send(BREAKDOWN_REPORT_PATH, body, photoUris, REPORT_FAILED);
}

export async function addBreakdownPhotos(breakdownId: string, photoUris: readonly string[]) {
  return send(breakdownPhotosPath(breakdownId), new FormData(), photoUris, PHOTOS_FAILED);
}

async function send(path: string, body: FormData, photoUris: readonly string[], failedMessage: string) {
  for (const [index, uri] of photoUris.entries())
    body.append('photo', await filePart(uri, PHOTO_MISSING), `breakdown-${index + 1}.jpg`);
  return postMultipart(path, body, { timeoutMs: UPLOAD_TIMEOUT_MS, failedMessage, output: BreakdownDetail });
}
