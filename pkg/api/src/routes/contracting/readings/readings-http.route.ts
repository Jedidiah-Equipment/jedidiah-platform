import { FilePolicyViolationError, type StorageAdapter } from '@pkg/core';
import {
  captureReading,
  getReading,
  isReadingError,
  READING_PHOTO_POLICY,
  type ReadMeterPhoto,
} from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { canCaptureBaseline } from '@pkg/domain/contracting';
import { ReadingCaptureInput, ReadingIdInput } from '@pkg/schema/contracting';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  RouteHttpError,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
  streamObjectBody,
} from '../../http-route-helpers.js';

export async function registerReadingHttpRoutes(
  app: FastifyInstance,
  dependencies: { db: Db; storage: StorageAdapter; readPhoto: ReadMeterPhoto },
) {
  const fieldCount = ReadingCaptureInput.keyof().options.length;
  app.post('/api/contracting/readings', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(auth, 'contracting_reading:capture', 'You cannot capture Hour Readings.', 'reading.forbidden');
      const fields: Record<string, unknown> = {};
      let photoBytes: Buffer | undefined;
      for await (const part of request.parts({
        limits: {
          files: 1,
          fields: fieldCount,
          parts: fieldCount + 1,
          fileSize: READING_PHOTO_POLICY.maxBytes,
          fieldSize: 4096,
        },
      })) {
        if (part.type === 'file') {
          if (part.fieldname !== 'photo') throw invalidMultipart();
          photoBytes = await part.toBuffer();
          if (part.file.truncated) throw invalidMultipart();
        } else {
          if (part.fieldname in fields || part.valueTruncated) throw invalidMultipart();
          fields[part.fieldname] = part.value;
        }
      }
      if (typeof fields.value === 'string' && fields.value.trim() !== '') fields.value = Number(fields.value);
      if (fields.expectedPreviousId === '') fields.expectedPreviousId = null;
      if (fields.comment === '') fields.comment = null;
      if (fields.disputePrevious === 'true') fields.disputePrevious = true;
      if (fields.disputePrevious === 'false') fields.disputePrevious = false;
      const input = ReadingCaptureInput.parse(fields);
      if (input.role === 'baseline' && !canCaptureBaseline(auth.access))
        throw new RouteHttpError({
          statusCode: 403,
          appCode: 'reading.forbidden',
          message: 'Only a Contracting administrator can capture a Baseline Reading.',
        });
      const row = await captureReading({
        ...dependencies,
        actorUserId: auth.session.user.id,
        input,
        ...(photoBytes === undefined ? {} : { photoBytes }),
      });
      return reply.status(201).send(row);
    } catch (error) {
      return sendReadingError(reply, error);
    }
  });
  app.get('/api/contracting/readings/:id/photo', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(
        auth,
        'contracting_machine:read',
        'You cannot view Hour Reading evidence.',
        'reading.forbidden',
      );
      const { id } = ReadingIdInput.parse(request.params);
      const row = await getReading({ db: dependencies.db, id });
      if (!row.photo)
        throw new RouteHttpError({ statusCode: 404, message: 'This reading has Missing Photo Evidence.' });
      const object = await dependencies.storage.get(row.photo.storageKey);
      return reply
        .header('Content-Type', object.contentType)
        .header('Content-Length', object.byteSize)
        .header('Cache-Control', 'private, no-store')
        .send(streamObjectBody(object.body));
    } catch (error) {
      return sendReadingError(reply, error);
    }
  });
}
function invalidMultipart() {
  return new RouteHttpError({
    statusCode: 400,
    appCode: 'reading.invalid_upload',
    message: 'Send reading fields and at most one complete photo.',
  });
}
function sendReadingError(reply: FastifyReply, error: unknown) {
  const mapped = isReadingError(error)
    ? new RouteHttpError({
        statusCode: error.code === 'reading.not_found' ? 404 : 409,
        appCode: error.code,
        message: error.message,
        cause: error,
      })
    : error instanceof FilePolicyViolationError
      ? new RouteHttpError({ statusCode: 400, appCode: error.code, message: error.message, cause: error })
      : error;
  return sendUploadHttpError(reply, mapped, {
    fallbackMessage: 'Reading request failed.',
    invalidRequestMessage: 'Invalid Hour Reading.',
    onFileTooLarge: () => ({ appCode: 'file.too_large', message: 'Meter photo must be 10 MB or smaller.' }),
  });
}
