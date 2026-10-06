import { FilePolicyViolationError } from '@pkg/core';
import { type TranscriptionEngine, transcribeVoiceNote } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { fileTooLargeMessage } from '@pkg/domain';
import { TRANSCRIBE_PATH, VOICE_NOTE_POLICY } from '@pkg/domain/contracting';
import { TranscribeFields, TranscriptionPurpose } from '@pkg/schema/contracting';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  mapCoreErrorToRoute,
  RouteHttpError,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
} from '../../http-route-helpers.js';
import { transcriptionErrorFamily } from '../contracting-error-families.js';

/** `engine` is null when no speech service key is configured: the phone then shows "type it". */
export async function registerTranscriptionHttpRoutes(
  app: FastifyInstance,
  { db, engine, keyterms }: { db: Db; engine: TranscriptionEngine | null; keyterms: () => Promise<string[]> },
) {
  // Multipart caps bytes; the purpose cap counts UTF-16 units, so allow the widest UTF-8 encoding.
  const fieldSize = 4 * (TranscriptionPurpose.maxLength ?? 60);
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
      const fields: Record<string, string> = {};
      let audio: Buffer | undefined;
      for await (const part of request.parts({
        limits: { files: 1, fields: 1, parts: 2, fileSize: VOICE_NOTE_POLICY.maxBytes, fieldSize },
      })) {
        if (part.type === 'file') {
          if (part.fieldname !== 'audio') throw invalidMultipart();
          audio = await part.toBuffer();
          if (part.file.truncated) throw invalidMultipart();
        } else {
          if (part.fieldname in fields || part.valueTruncated || typeof part.value !== 'string')
            throw invalidMultipart();
          fields[part.fieldname] = part.value;
        }
      }
      if (audio === undefined) throw invalidMultipart();
      const { purpose } = TranscribeFields.parse(fields);
      if (!engine)
        throw new RouteHttpError({
          statusCode: 503,
          appCode: 'transcription.unavailable',
          message: 'Voice notes are not set up. Type the note instead.',
        });
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
      return sendTranscriptionError(reply, error);
    }
  });
}
function invalidMultipart() {
  return new RouteHttpError({
    statusCode: 400,
    appCode: 'transcription.invalid_upload',
    message: 'Send a purpose and one complete voice note.',
  });
}
function sendTranscriptionError(reply: FastifyReply, error: unknown) {
  const mapped =
    error instanceof FilePolicyViolationError
      ? new RouteHttpError({ statusCode: 400, appCode: error.code, message: error.message, cause: error })
      : mapCoreErrorToRoute(error, transcriptionErrorFamily);
  return sendUploadHttpError(reply, mapped, {
    fallbackMessage: 'Transcription request failed.',
    invalidRequestMessage: 'Invalid voice note.',
    onFileTooLarge: () => ({ appCode: 'file.too_large', message: fileTooLargeMessage(VOICE_NOTE_POLICY.maxBytes) }),
  });
}
