import {
  createOpenAiChatModel,
  createOpenAiTranscriptionModel,
  deriveTranscriptionHint,
  hearVoiceNote,
  tidyTranscript,
} from '@pkg/ai';
import {
  type BoundTranscriptionProfile,
  cacheVocabulary,
  deriveHintFor,
  listTranscriptionsAwaitingHints,
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
 * The one Voice Note pipeline both businesses share: the models, each business's profile bound with a cached
 * vocabulary, and the hint derivations. The profiles arrive from `server.ts`, so nothing here names a business.
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
      hearVoiceNote({ ...input, model: transcriptionModel }),
    ),
    tidy: logged('Transcript tidy failed', (input) => tidyTranscript({ ...input, model: chatModel })),
    derive: logged('Transcription hint derivation failed', (input) =>
      deriveTranscriptionHint({ ...input, model: chatModel }),
    ),
  };
  const bound = Object.fromEntries(
    BUSINESSES.map((business): [Business, BoundTranscriptionProfile] => [
      business,
      {
        business,
        setting: profiles[business].setting,
        vocabulary: cacheVocabulary(() => profiles[business].loadVocabulary({ db })),
      },
    ]),
  ) as Record<Business, BoundTranscriptionProfile>;

  const hintDerivations = new BackgroundQueue<string>({
    run: (id) => deriveHintFor({ db, id, engine }),
    onError: (error, transcriptionId) => log.ai.error({ error, transcriptionId }, 'Hint derivation failed'),
    concurrency: 1,
    resume: {
      awaiting: () => listTranscriptionsAwaitingHints({ db }),
      onError: (error) => log.ai.error({ error }, 'Resuming hint derivations failed'),
    },
  });

  await registerTranscriptionHttpRoutes(app, { db, engine, profiles: bound });

  return {
    routerDependencies: {
      hintDerivations,
      profiles: bound,
      models: { chat: config.OPENAI_MODEL, transcription: config.OPENAI_TRANSCRIPTION_MODEL },
    },
    services: [hintDerivations],
  };
}

function logged<TInput, TOutput>(label: string, run: (input: TInput) => Promise<TOutput>) {
  return (input: TInput) =>
    run(input).catch((error: unknown) => {
      log.root.error({ error: serializeError(error) }, label);
      throw error;
    });
}
