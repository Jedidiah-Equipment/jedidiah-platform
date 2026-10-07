import type { StorageAdapter } from '@pkg/core';
import { addBreakdownPhotos, getBreakdownPhoto, reportBreakdown } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { formatNumber } from '@pkg/domain';
import { BREAKDOWN_PHOTO_POLICY, BREAKDOWN_REPORT_PATH } from '@pkg/domain/contracting';
import {
  BREAKDOWN_MAX_PHOTOS,
  BreakdownDescription,
  BreakdownIdInput,
  BreakdownPhotoRemoveInput,
  BreakdownReportMultipart,
  breakdownReportFieldNames,
} from '@pkg/schema/contracting';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  type MultipartUploadOptions,
  mapCoreErrorToRoute,
  RouteHttpError,
  readMultipartUpload,
  requireMaxLength,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
  streamObjectBody,
} from '../../http-route-helpers.js';
import { breakdownErrorFamily } from '../contracting-error-families.js';

export async function registerBreakdownHttpRoutes(
  app: FastifyInstance,
  { db, storage }: { db: Db; storage: StorageAdapter },
) {
  // One photo over the cap is collected so core's own refusal, not the stream limit, answers it.
  const upload = (textFields: readonly string[]): MultipartUploadOptions => ({
    fileField: 'photo',
    maxFiles: BREAKDOWN_MAX_PHOTOS + 1,
    policy: BREAKDOWN_PHOTO_POLICY,
    textFields,
    fieldMaxLength: requireMaxLength(BreakdownDescription),
    invalid: () =>
      new RouteHttpError({
        statusCode: 400,
        appCode: 'breakdown.invalid_upload',
        message: `Send the report fields and at most ${formatNumber(BREAKDOWN_MAX_PHOTOS)} complete photos.`,
      }),
  });
  const report = upload(breakdownReportFieldNames);
  const photosOnly = upload([]);
  app.post(BREAKDOWN_REPORT_PATH, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(auth, 'contracting_breakdown:report', 'You cannot report Breakdowns.', 'breakdown.forbidden');
      const { fields, files: photos } = await readMultipartUpload(request, report);
      const input = BreakdownReportMultipart.parse(fields);
      const { breakdown } = await reportBreakdown({
        db,
        actor: auth.access,
        input,
        evidence: { storage, photos },
      });
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
      const { files: photos } = await readMultipartUpload(request, photosOnly);
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

function sendBreakdownError(reply: FastifyReply, error: unknown) {
  return sendUploadHttpError(reply, mapCoreErrorToRoute(error, breakdownErrorFamily), {
    policy: BREAKDOWN_PHOTO_POLICY,
    fallbackMessage: 'Breakdown request failed.',
    invalidRequestMessage: 'Invalid Breakdown report.',
  });
}
