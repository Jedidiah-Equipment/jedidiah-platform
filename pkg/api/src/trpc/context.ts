import { getUserAccessSummary, type QuoteDocumentPdfRenderer, type StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import type { UserAccessSummary } from '@pkg/schema';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

import { getSessionFromHeaders, parseBetterAuthRole } from '../auth/session.js';

export type ContextDependencies = {
  quoteDocumentPdfRenderer: QuoteDocumentPdfRenderer;
  storage: StorageAdapter;
};

export function createContextFactory(dependencies: ContextDependencies) {
  return async function createContext({ req }: CreateFastifyContextOptions) {
    const session = await getSessionFromHeaders(req.headers);
    const access: UserAccessSummary | null = session
      ? await getUserAccessSummary({
          db,
          role: parseBetterAuthRole(session.user.role),
          userId: session.user.id,
        })
      : null;

    return {
      access,
      db,
      log: req.log,
      quoteDocumentPdfRenderer: dependencies.quoteDocumentPdfRenderer,
      session,
      storage: dependencies.storage,
    };
  };
}

export const createContext = createContextFactory({
  quoteDocumentPdfRenderer: async () => {
    throw new Error('Quote Document PDF renderer is not configured.');
  },
  storage: {
    deleteObject: async () => undefined,
    get: async () => {
      throw new Error('Document storage is not configured.');
    },
    put: async () => undefined,
  },
});

export type Context = Awaited<ReturnType<typeof createContext>>;
