import { type BoundTranscriptionProfile, type TranscriptionEngine, transcribeVoiceNote } from '@pkg/core';
import type { Db } from '@pkg/db';
import { transcribePath, transcriptionPermissions, VOICE_NOTE_POLICY } from '@pkg/domain';
import { BUSINESSES, type Business, TranscribeFields, TranscriptionPurpose } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type MultipartUploadOptions,
  mapCoreErrorToRoute,
  RouteHttpError,
  readMultipartUpload,
  requireMaxLength,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
} from '../http-route-helpers.js';
import { transcriptionErrorFamily } from '../shared-error-families.js';

const upload: MultipartUploadOptions = {
  fileField: 'audio',
  maxFiles: 1,
  policy: VOICE_NOTE_POLICY,
  textFields: Object.keys(TranscribeFields.shape),
  fieldMaxLength: requireMaxLength(TranscriptionPurpose),
  invalid: () =>
    new RouteHttpError({
      statusCode: 400,
      appCode: 'transcription.invalid_upload',
      message: 'Send a purpose and one complete voice note.',
    }),
};

export async function registerTranscriptionHttpRoutes(
  app: FastifyInstance,
  {
    db,
    engine,
    profiles,
  }: { db: Db; engine: TranscriptionEngine; profiles: Record<Business, BoundTranscriptionProfile> },
) {
  const transcribe = (business: Business) => async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(
        auth,
        transcriptionPermissions[business].use,
        'You cannot use voice notes.',
        'transcription.forbidden',
      );
      const { input, files } = await readMultipartUpload(request, upload, TranscribeFields);
      const [audio] = files;
      if (audio === undefined) throw upload.invalid();
      const transcription = await transcribeVoiceNote({
        db,
        actorUserId: auth.access.userId,
        audio,
        purpose: input.purpose,
        profile: profiles[business],
        engine,
      });
      return reply.status(201).send(transcription);
    } catch (error) {
      return sendTranscriptionError(reply, error);
    }
  };

  for (const business of BUSINESSES) app.post(transcribePath(business), transcribe(business));
}

function sendTranscriptionError(reply: FastifyReply, error: unknown) {
  return sendUploadHttpError(reply, mapCoreErrorToRoute(error, transcriptionErrorFamily), {
    policy: VOICE_NOTE_POLICY,
    upload,
    fallbackMessage: 'Transcription request failed.',
    invalidRequestMessage: 'Invalid voice note.',
  });
}
