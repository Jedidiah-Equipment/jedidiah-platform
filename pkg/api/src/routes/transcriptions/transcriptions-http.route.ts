import { type TranscriptionEngine, transcribeVoiceNote } from '@pkg/core';
import type { Db } from '@pkg/db';
import { TRANSCRIBE_PATH, transcriptionPermissions, VOICE_NOTE_POLICY } from '@pkg/domain';
import { type Business, type KeytermCandidate, TranscribeFields, TranscriptionPurpose } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type MultipartUploadOptions,
  mapCoreErrorToRoute,
  RouteHttpError,
  readMultipartUpload,
  requireAnyPermission,
  requireMaxLength,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
} from '../http-route-helpers.js';
import { transcriptionErrorFamily } from '../shared-error-families.js';

/**
 * The path phones from before the shared route still post to, always Contracting's. Drop it once their OTA is out
 * (the follow-up ticket "Drop the Contracting transcription aliases").
 */
const CONTRACTING_ALIAS_PATH = '/api/contracting/transcriptions';
const ContractingAliasFields = z.object({ purpose: TranscriptionPurpose }).strict();

export type TranscriptionHttpDependencies = {
  db: Db;
  engine: TranscriptionEngine;
  keyterms: Record<Business, () => Promise<KeytermCandidate[]>>;
  settings: Record<Business, string>;
};

const USE_PERMISSIONS = Object.values(transcriptionPermissions).map((permissions) => permissions.use);

const invalidUpload = () =>
  new RouteHttpError({
    statusCode: 400,
    appCode: 'transcription.invalid_upload',
    message: 'Send a purpose and one complete voice note.',
  });

function uploadOptions(textFields: string[]): MultipartUploadOptions {
  return {
    fileField: 'audio',
    maxFiles: 1,
    policy: VOICE_NOTE_POLICY,
    textFields,
    fieldMaxLength: requireMaxLength(TranscriptionPurpose),
    invalid: invalidUpload,
  };
}

export async function registerTranscriptionHttpRoutes(
  app: FastifyInstance,
  { db, engine, keyterms, settings }: TranscriptionHttpDependencies,
) {
  const transcribe =
    <TFields extends { purpose: string }>(
      upload: MultipartUploadOptions,
      fields: z.ZodType<TFields>,
      businessOf: (input: TFields) => Business,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await requireRouteAuth(request, reply);
      if (!auth) return;
      try {
        // Refused before the upload is read when no business lets this person use voice notes; the named business is
        // checked once the fields say which it is.
        requireAnyPermission(auth, USE_PERMISSIONS, 'You cannot use voice notes.', 'transcription.forbidden');
        const { input, files } = await readMultipartUpload(request, upload, fields);
        const business = businessOf(input);
        requirePermission(
          auth,
          transcriptionPermissions[business].use,
          'You cannot use voice notes.',
          'transcription.forbidden',
        );
        const [audio] = files;
        if (audio === undefined) throw upload.invalid();
        const transcription = await transcribeVoiceNote({
          db,
          actorUserId: auth.access.userId,
          audio,
          business,
          purpose: input.purpose,
          setting: settings[business],
          engine,
          keyterms: keyterms[business],
        });
        return reply.status(201).send(transcription);
      } catch (error) {
        return sendTranscriptionError(reply, error, upload);
      }
    };

  app.post(
    TRANSCRIBE_PATH,
    transcribe(uploadOptions(['business', 'purpose']), TranscribeFields, (input) => input.business),
  );
  app.post(
    CONTRACTING_ALIAS_PATH,
    transcribe(uploadOptions(['purpose']), ContractingAliasFields, () => 'contracting'),
  );
}

function sendTranscriptionError(reply: FastifyReply, error: unknown, upload: MultipartUploadOptions) {
  return sendUploadHttpError(reply, mapCoreErrorToRoute(error, transcriptionErrorFamily), {
    policy: VOICE_NOTE_POLICY,
    upload,
    fallbackMessage: 'Transcription request failed.',
    invalidRequestMessage: 'Invalid voice note.',
  });
}
