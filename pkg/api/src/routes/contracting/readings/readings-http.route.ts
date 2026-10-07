import type { StorageAdapter } from '@pkg/core';
import { captureReading, getReadingForEvidence } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { READING_CAPTURE_PATH, READING_PHOTO_POLICY } from '@pkg/domain/contracting';
import {
  ReadingCaptureMultipart,
  ReadingComment,
  ReadingIdInput,
  readingCaptureFieldNames,
} from '@pkg/schema/contracting';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Scheduler } from '../../../background-queue.js';
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
import { readingErrorFamily } from '../contracting-error-families.js';

/** Schedules a captured reading's AI check after the capture has answered. */
export type ReadingVerifications = Scheduler<string>;

export async function registerReadingHttpRoutes(
  app: FastifyInstance,
  { db, storage, verifications }: { db: Db; storage: StorageAdapter; verifications: ReadingVerifications },
) {
  const upload: MultipartUploadOptions = {
    fileField: 'photo',
    maxFiles: 1,
    policy: READING_PHOTO_POLICY,
    textFields: readingCaptureFieldNames,
    fieldMaxLength: requireMaxLength(ReadingComment),
    invalid: () =>
      new RouteHttpError({
        statusCode: 400,
        appCode: 'reading.invalid_upload',
        message: 'Send reading fields and at most one complete photo.',
      }),
  };
  app.post(READING_CAPTURE_PATH, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(auth, 'contracting_reading:capture', 'You cannot capture Hour Readings.', 'reading.forbidden');
      const { input, files } = await readMultipartUpload(request, upload, ReadingCaptureMultipart);
      const [photoBytes] = files;
      const row = await captureReading({
        db,
        actor: auth.access,
        input,
        ...(photoBytes === undefined ? {} : { evidence: { storage, photoBytes } }),
      });
      // Answer at once; the photo's AI check follows in the background.
      if (row.photo) verifications.schedule(row.id);
      return reply.status(201).send(row);
    } catch (error) {
      return sendReadingError(reply, error, upload);
    }
  });
  app.get(`${READING_CAPTURE_PATH}/:id/photo`, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      const { id } = ReadingIdInput.parse(request.params);
      const row = await getReadingForEvidence({ db, actor: auth.access, id });
      if (!row.photo)
        throw new RouteHttpError({ statusCode: 404, message: 'This reading has Missing Photo Evidence.' });
      const object = await storage.get(row.photo.storageKey);
      return reply
        .header('Content-Type', object.contentType)
        .header('Content-Length', object.byteSize)
        .header('Cache-Control', 'private, no-store')
        .send(streamObjectBody(object.body));
    } catch (error) {
      return sendReadingError(reply, error, upload);
    }
  });
}
function sendReadingError(reply: FastifyReply, error: unknown, upload: MultipartUploadOptions) {
  return sendUploadHttpError(reply, mapCoreErrorToRoute(error, readingErrorFamily), {
    policy: READING_PHOTO_POLICY,
    upload,
    fallbackMessage: 'Reading request failed.',
    invalidRequestMessage: 'Invalid Hour Reading.',
  });
}
