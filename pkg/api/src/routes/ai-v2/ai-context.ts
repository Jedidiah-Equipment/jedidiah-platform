import type { AiV2Context, AiV2Session } from '@pkg/ai';
import type { StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { renderBrochurePdf, renderQuoteDocumentPdf } from '@pkg/pdf';
import type { UserAccessSummary } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '@/auth/session.js';
import { log } from '@/logger.js';
import { sendAiV2Email } from './ai-email.js';

export type CreateAiV2ContextInput = {
  access: UserAccessSummary | null;
  db: AiV2Context['db'];
  session: AppSession | null;
  storage: StorageAdapter;
};

export type AiV2ContextDependencies = {
  storage: StorageAdapter;
};

// Projects the full Better Auth session onto the minimal shape the AI runtime needs. `assistantEnabled`
// (a nullable additional field) is normalized to a definite boolean for the stream route's access gate.
export function toAiV2Session(session: AppSession | null): AiV2Session | null {
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

// V2 keeps its minimal API-owned dependency injection beside the v2 transport so this route does
// not depend on the legacy AI route folder or its document and email delivery ports.
export function createAiV2Context({ access, db, session, storage }: CreateAiV2ContextInput): AiV2Context {
  return {
    access,
    brochureRenderer: renderBrochurePdf,
    db,
    log,
    quoteDocumentRenderer: renderQuoteDocumentPdf,
    sendEmail: sendAiV2Email,
    session: toAiV2Session(session),
    storage,
  };
}

export async function buildAiV2Context(
  req: FastifyRequest,
  dependencies: AiV2ContextDependencies,
): Promise<AiV2Context> {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? createUserAccessSummary({
        role: parseBetterAuthRole(session.user.role),
        userId: session.user.id,
      })
    : null;

  return createAiV2Context({ access, db, session, storage: dependencies.storage });
}
