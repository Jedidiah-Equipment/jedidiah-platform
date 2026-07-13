import type { AiContext, AiSession } from '@pkg/ai';
import type { StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { renderBrochurePdf, renderQuoteDocumentPdf } from '@pkg/pdf';
import type { UserAccessSummary } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '@/auth/session.js';
import { log } from '@/logger.js';
import { sendAiEmail } from './ai-email.js';

export type CreateAiContextInput = {
  access: UserAccessSummary | null;
  db: AiContext['db'];
  session: AppSession | null;
  storage: StorageAdapter;
};

export type AiContextDependencies = {
  storage: StorageAdapter;
};

// Projects the full Better Auth session onto the minimal shape the AI runtime needs. `assistantEnabled`
// (a nullable additional field) is normalized to a definite boolean for the stream route's access gate.
export function toAiSession(session: AppSession | null): AiSession | null {
  return session
    ? {
        user: {
          id: session.user.id,
          email: session.user.email,
          assistantEnabled: session.user.assistantEnabled === true,
        },
      }
    : null;
}

// Keep API-owned rendering and delivery dependencies beside the transport; `@pkg/ai` stays free of
// API configuration and concrete delivery clients.
export function createAiContext({ access, db, session, storage }: CreateAiContextInput): AiContext {
  return {
    access,
    brochureRenderer: renderBrochurePdf,
    db,
    log,
    quoteDocumentRenderer: renderQuoteDocumentPdf,
    sendEmail: sendAiEmail,
    session: toAiSession(session),
    storage,
  };
}

export async function buildAiContext(req: FastifyRequest, dependencies: AiContextDependencies): Promise<AiContext> {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? createUserAccessSummary({
        role: parseBetterAuthRole(session.user.role),
        userId: session.user.id,
      })
    : null;

  return createAiContext({ access, db, session, storage: dependencies.storage });
}
