import type { StorageAdapter } from '@pkg/core';
import type { Db } from '@pkg/db';
import type { AuthId, BrochurePdfRenderer, Logger, QuoteDocumentPdfRenderer, UserAccessSummary } from '@pkg/schema';

export type AiSession = {
  user: {
    id: AuthId;
    email: string;
    assistantEnabled: boolean;
  };
};

export type AiEmailAttachment = {
  content: Uint8Array;
  contentType: string;
  filename: string;
};

export type AiEmailMessage = {
  attachments: AiEmailAttachment[];
  body: string;
  subject: string;
  to: string;
};

export type AiEmailSender = (message: AiEmailMessage) => Promise<void>;

// Keep this context limited to dependencies that orchestration and its tools use. Add new ports
// only when a tool actually needs them.
export type AiContext = {
  access: UserAccessSummary | null;
  brochureRenderer: BrochurePdfRenderer;
  db: Db;
  log: Logger;
  quoteDocumentRenderer: QuoteDocumentPdfRenderer;
  sendEmail: AiEmailSender;
  session: AiSession | null;
  storage: StorageAdapter;
};
