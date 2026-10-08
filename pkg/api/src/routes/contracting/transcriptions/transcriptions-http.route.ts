import { type TranscriptionEngine, transcribeVoiceNote } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { TRANSCRIBE_PATH, VOICE_NOTE_POLICY } from '@pkg/domain/contracting';
import { type KeytermCandidate, TranscribeFields, TranscriptionPurpose } from '@pkg/schema/contracting';
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
} from '../../http-route-helpers.js';
import { transcriptionErrorFamily } from '../contracting-error-families.js';

export async function registerTranscriptionHttpRoutes(
  app: FastifyInstance,
  { db, engine, keyterms }: { db: Db; engine: TranscriptionEngine; keyterms: () => Promise<KeytermCandidate[]> },
) {
  const upload: MultipartUploadOptions = {
    fileField: 'audio',
    maxFiles: 1,
    policy: VOICE_NOTE_POLICY,
    textFields: ['purpose'],
    fieldMaxLength: requireMaxLength(TranscriptionPurpose),
    invalid: () =>
      new RouteHttpError({
        statusCode: 400,
        appCode: 'transcription.invalid_upload',
        message: 'Send a purpose and one complete voice note.',
      }),
  };
  app.post(TRANSCRIBE_PATH, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(
        auth,
        'contracting_transcription:use',
        'You cannot use voice notes.',
        'transcription.forbidden',
      );
      const { input, files } = await readMultipartUpload(request, upload, TranscribeFields);
      const [audio] = files;
      if (audio === undefined) throw upload.invalid();
      const { purpose } = input;
      const transcription = await transcribeVoiceNote({
        db,
        actorUserId: auth.access.userId,
        audio,
        purpose,
        engine,
        keyterms,
      });
      return reply.status(201).send(transcription);
    } catch (error) {
      return sendTranscriptionError(reply, error, upload);
    }
  });
}
function sendTranscriptionError(reply: FastifyReply, error: unknown, upload: MultipartUploadOptions) {
  return sendUploadHttpError(reply, mapCoreErrorToRoute(error, transcriptionErrorFamily), {
    policy: VOICE_NOTE_POLICY,
    upload,
    fallbackMessage: 'Transcription request failed.',
    invalidRequestMessage: 'Invalid voice note.',
  });
}
