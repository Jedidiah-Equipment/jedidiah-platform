import { FilePolicyViolationError, type StorageAdapter } from '@pkg/core';
import { addBreakdownPhotos, getBreakdownPhoto, reportBreakdown } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { fileTooLargeMessage, formatNumber } from '@pkg/domain';
import { BREAKDOWN_PHOTO_POLICY, BREAKDOWN_REPORT_PATH } from '@pkg/domain/contracting';
import {
  BREAKDOWN_MAX_PHOTOS,
  BreakdownDescription,
  BreakdownIdInput,
  BreakdownPhotoRemoveInput,
  BreakdownReportMultipart,
  breakdownReportFieldNames,
} from '@pkg/schema/contracting';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  mapCoreErrorToRoute,
  RouteHttpError,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
  streamObjectBody,
} from '../../http-route-helpers.js';
import { breakdownErrorFamily } from '../contracting-error-families.js';

export async function registerBreakdownHttpRoutes(
  app: FastifyInstance,
  {
    db,
    storage,
    onReported = () => undefined,
  }: {
    db: Db;
    storage: StorageAdapter;
    /** Runs after a report has answered; the push fan-out plugs in here. */
    onReported?: (breakdownId: string) => void;
  },
) {
  app.post(BREAKDOWN_REPORT_PATH, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(auth, 'contracting_breakdown:report', 'You cannot report Breakdowns.', 'breakdown.forbidden');
      const { fields, photos } = await readParts(request, breakdownReportFieldNames.length);
      const input = BreakdownReportMultipart.parse(fields);
      const { breakdown, created } = await reportBreakdown({
        db,
        actor: auth.access,
        input,
        evidence: { storage, photos },
      });
      // A replayed report was announced the first time; a failing hook never turns a saved report into an error.
      if (created)
        try {
          onReported(breakdown.id);
        } catch (error) {
          request.log.error({ error, breakdownId: breakdown.id }, 'Breakdown report hook failed');
        }
      return reply.status(201).send(breakdown);
    } catch (error) {
      return sendBreakdownError(reply, error);
    }
  });
  app.post(`${BREAKDOWN_REPORT_PATH}/:id/photos`, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      const { id } = BreakdownIdInput.parse(request.params);
      const { photos } = await readParts(request, 0);
      const row = await addBreakdownPhotos({ db, actor: auth.access, id, evidence: { storage, photos } });
      return reply.status(201).send(row);
    } catch (error) {
      return sendBreakdownError(reply, error);
    }
  });
  app.get(`${BREAKDOWN_REPORT_PATH}/:id/photos/:photoId`, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      const { id, photoId } = BreakdownPhotoRemoveInput.parse(request.params);
      const photo = await getBreakdownPhoto({ db, actor: auth.access, id, photoId });
      const object = await storage.get(photo.storageKey);
      return reply
        .header('Content-Type', object.contentType)
        .header('Content-Length', object.byteSize)
        .header('Cache-Control', 'private, no-store')
        .send(streamObjectBody(object.body));
    } catch (error) {
      return sendBreakdownError(reply, error);
    }
  });
}

/** Every field once and up to the photo cap of `photo` file parts; anything else is refused whole. */
async function readParts(request: FastifyRequest, fieldCount: number) {
  const fields: Record<string, string> = {};
  const photos: Uint8Array[] = [];
  for await (const part of request.parts({
    limits: {
      files: BREAKDOWN_MAX_PHOTOS,
      fields: fieldCount,
      // One spare part, so a seventh photo trips the files limit rather than the parts limit.
      parts: fieldCount + BREAKDOWN_MAX_PHOTOS + 1,
      fileSize: BREAKDOWN_PHOTO_POLICY.maxBytes,
      // Multipart caps bytes; the description cap counts UTF-16 units, so allow the widest UTF-8 encoding.
      fieldSize: 4 * (BreakdownDescription.maxLength ?? 4000),
    },
  })) {
    if (part.type === 'file') {
      if (part.fieldname !== 'photo') throw invalidMultipart();
      const bytes = await part.toBuffer();
      if (part.file.truncated) throw invalidMultipart();
      photos.push(bytes);
    } else {
      if (part.fieldname in fields || part.valueTruncated || typeof part.value !== 'string') throw invalidMultipart();
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, photos };
}

function invalidMultipart() {
  return new RouteHttpError({
    statusCode: 400,
    appCode: 'breakdown.invalid_upload',
    message: `Send the report fields and at most ${formatNumber(BREAKDOWN_MAX_PHOTOS)} complete photos.`,
  });
}

const isFilesLimitError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'FST_FILES_LIMIT';

function sendBreakdownError(reply: FastifyReply, error: unknown) {
  const mapped =
    error instanceof FilePolicyViolationError
      ? new RouteHttpError({ statusCode: 400, appCode: error.code, message: error.message, cause: error })
      : isFilesLimitError(error)
        ? new RouteHttpError({
            statusCode: 409,
            appCode: 'breakdown.too_many_photos',
            message: `A Breakdown keeps at most ${formatNumber(BREAKDOWN_MAX_PHOTOS)} photos.`,
          })
        : mapCoreErrorToRoute(error, breakdownErrorFamily);
  return sendUploadHttpError(reply, mapped, {
    fallbackMessage: 'Breakdown request failed.',
    invalidRequestMessage: 'Invalid Breakdown report.',
    onFileTooLarge: () => ({
      appCode: 'file.too_large',
      message: fileTooLargeMessage(BREAKDOWN_PHOTO_POLICY.maxBytes),
    }),
  });
}
