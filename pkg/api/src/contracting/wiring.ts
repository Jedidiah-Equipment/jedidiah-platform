import { createOpenAiChatModel, createOpenAiTranscriptionModel } from '@pkg/ai';
import type { TranscriptionModels } from '@pkg/ai/contracting';
import {
  deriveTranscriptionHint,
  readMeterPhoto as readMeterPhotoWithModel,
  tidyTranscript,
  transcribeVoiceNote,
} from '@pkg/ai/contracting';
import {
  createKeytermCache,
  deriveHintFor,
  listReadingsAwaitingVerification,
  listTranscriptionsAwaitingHints,
  loadKeytermCandidates,
  type ReadMeterPhoto,
  type TranscriptionEngine,
  verifyCapturedReading,
} from '@pkg/core/contracting';
import { db } from '@pkg/db';
import { renderJobCardPdf } from '@pkg/pdf/contracting';
import type { KeytermCandidate } from '@pkg/schema/contracting';
import type { FastifyInstance } from 'fastify';
import { BackgroundQueue } from '../background-queue.js';
import type { BusinessWiring, BusinessWiringInput } from '../business-wiring.js';
import { log } from '../logger.js';
import { registerBreakdownHttpRoutes } from '../routes/contracting/breakdowns/breakdowns-http.route.js';
import { registerJobCardHttpRoutes } from '../routes/contracting/jobs/job-card-http.route.js';
import { registerReadingHttpRoutes } from '../routes/contracting/readings/readings-http.route.js';
import type { HintDerivations } from '../routes/contracting/transcriptions/transcriptions.router.js';
import { registerTranscriptionHttpRoutes } from '../routes/contracting/transcriptions/transcriptions-http.route.js';
import { serializeError } from '../trpc/errors.js';

export type ContractingRouterDependencies = {
  hintDerivations: HintDerivations;
  readMeterPhoto: ReadMeterPhoto;
  keyterms: () => Promise<KeytermCandidate[]>;
  transcriptionModels: TranscriptionModels;
};

export async function registerContracting(
  app: FastifyInstance,
  { config, storage }: BusinessWiringInput,
): Promise<BusinessWiring<ContractingRouterDependencies>> {
  const chatModel = createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL });
  const transcriptionModel = createOpenAiTranscriptionModel({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_TRANSCRIPTION_MODEL,
  });
  const readMeterPhoto: ReadMeterPhoto = (input) => readMeterPhotoWithModel({ ...input, model: chatModel });
  const engine: TranscriptionEngine = {
    transcribe: logged('Voice note transcription failed', (input) =>
      transcribeVoiceNote({ ...input, model: transcriptionModel }),
    ),
    tidy: logged('Transcript tidy failed', (input) => tidyTranscript({ ...input, model: chatModel })),
    derive: logged('Transcription hint derivation failed', (input) =>
      deriveTranscriptionHint({ ...input, model: chatModel }),
    ),
  };
  const keyterms = createKeytermCache(() => loadKeytermCandidates({ db }));

  const readingVerifications = new BackgroundQueue<string>({
    run: (id) => verifyCapturedReading({ db, id, storage, readPhoto: readMeterPhoto }),
    onError: (error, readingId) => log.ai.error({ error, readingId }, 'Reading verification failed'),
    resume: {
      awaiting: () => listReadingsAwaitingVerification({ db }),
      onError: (error) => log.ai.error({ error }, 'Resuming reading verifications failed'),
    },
  });
  const hintDerivations = new BackgroundQueue<string>({
    run: async (id) => {
      const outcome = await deriveHintFor({ db, id, engine });
      // A new hint keyterm should reach the next note, not the next cache refresh.
      if (outcome?.action === 'add') keyterms.invalidate();
    },
    onError: (error, transcriptionId) => log.ai.error({ error, transcriptionId }, 'Hint derivation failed'),
    concurrency: 1,
    resume: {
      awaiting: () => listTranscriptionsAwaitingHints({ db }),
      onError: (error) => log.ai.error({ error }, 'Resuming hint derivations failed'),
    },
  });

  await registerReadingHttpRoutes(app, { db, storage, verifications: readingVerifications });
  await registerTranscriptionHttpRoutes(app, { db, engine, keyterms: keyterms.current });
  await registerBreakdownHttpRoutes(app, { db, storage });
  await registerJobCardHttpRoutes(app, { db, pdfRenderer: renderJobCardPdf });

  return {
    routerDependencies: {
      hintDerivations,
      readMeterPhoto,
      keyterms: keyterms.current,
      transcriptionModels: { chat: config.OPENAI_MODEL, transcription: config.OPENAI_TRANSCRIPTION_MODEL },
    },
    services: [readingVerifications, hintDerivations],
  };
}

function logged<TInput, TOutput>(label: string, run: (input: TInput) => Promise<TOutput>) {
  return (input: TInput) =>
    run(input).catch((error: unknown) => {
      log.root.error({ error: serializeError(error) }, label);
      throw error;
    });
}
