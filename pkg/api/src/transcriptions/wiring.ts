import {
  createOpenAiChatModel,
  createOpenAiTranscriptionModel,
  deriveTranscriptionHint,
  tidyTranscript,
  transcribeVoiceNote,
} from '@pkg/ai';
import {
  createKeytermCache,
  deriveHintFor,
  listTranscriptionsAwaitingHints,
  loadKeytermCandidates,
  type TranscriptionEngine,
  type TranscriptionProfile,
} from '@pkg/core';
import type { Db } from '@pkg/db';
import { BUSINESSES, type Business } from '@pkg/schema';
import type { FastifyInstance } from 'fastify';
import { BackgroundQueue } from '../background-queue.js';
import type { BusinessWiring } from '../business-wiring.js';
import type { ApiConfig } from '../env.js';
import { log } from '../logger.js';
import type { TranscriptionRouterDependencies } from '../routes/transcriptions/transcriptions.router.js';
import { registerTranscriptionHttpRoutes } from '../routes/transcriptions/transcriptions-http.route.js';
import { serializeError } from '../trpc/errors.js';

/**
 * The one Voice Note pipeline both businesses share: the models, one keyterm cache per business, and the hint
 * derivations. Each business's part arrives as its profile, composed by `server.ts`, so nothing here names a business.
 */
export async function registerTranscriptions(
  app: FastifyInstance,
  { config, db, profiles }: { config: ApiConfig; db: Db; profiles: Record<Business, TranscriptionProfile> },
): Promise<BusinessWiring<TranscriptionRouterDependencies>> {
  const chatModel = createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL });
  const transcriptionModel = createOpenAiTranscriptionModel({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_TRANSCRIPTION_MODEL,
  });
  const engine: TranscriptionEngine = {
    transcribe: logged('Voice note transcription failed', (input) =>
      transcribeVoiceNote({ ...input, model: transcriptionModel }),
    ),
    tidy: logged('Transcript tidy failed', (input) => tidyTranscript({ ...input, model: chatModel })),
    derive: logged('Transcription hint derivation failed', (input) =>
      deriveTranscriptionHint({ ...input, model: chatModel }),
    ),
  };
  const caches = perBusiness((business) =>
    createKeytermCache(() =>
      loadKeytermCandidates({ db, business, loadVocabulary: () => profiles[business].loadVocabulary({ db }) }),
    ),
  );
  const businesses = perBusiness((business) => ({
    setting: profiles[business].setting,
    keyterms: caches[business].current,
  }));

  const hintDerivations = new BackgroundQueue<string>({
    run: async (id) => {
      const derived = await deriveHintFor({ db, id, engine });
      // A new hint keyterm should reach the business's next note, not its next cache refresh.
      if (derived?.outcome.action === 'add') caches[derived.business].invalidate();
    },
    onError: (error, transcriptionId) => log.ai.error({ error, transcriptionId }, 'Hint derivation failed'),
    concurrency: 1,
    resume: {
      awaiting: () => listTranscriptionsAwaitingHints({ db }),
      onError: (error) => log.ai.error({ error }, 'Resuming hint derivations failed'),
    },
  });

  await registerTranscriptionHttpRoutes(app, { db, engine, businesses });

  return {
    routerDependencies: {
      hintDerivations,
      businesses,
      models: { chat: config.OPENAI_MODEL, transcription: config.OPENAI_TRANSCRIPTION_MODEL },
    },
    services: [hintDerivations],
  };
}

function perBusiness<T>(build: (business: Business) => T): Record<Business, T> {
  return Object.fromEntries(BUSINESSES.map((business) => [business, build(business)])) as Record<Business, T>;
}

function logged<TInput, TOutput>(label: string, run: (input: TInput) => Promise<TOutput>) {
  return (input: TInput) =>
    run(input).catch((error: unknown) => {
      log.root.error({ error: serializeError(error) }, label);
      throw error;
    });
}
