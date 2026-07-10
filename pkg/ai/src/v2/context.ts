import type { StorageAdapter } from '@pkg/core';
import type { Db } from '@pkg/db';
import type { AuthId, BrochurePdfRenderer, Logger, QuoteDocumentPdfRenderer, UserAccessSummary } from '@pkg/schema';

export type AiV2Session = {
  user: {
    id: AuthId;
    email: string;
    assistantEnabled: boolean;
  };
};

export type AiV2EmailAttachment = {
  content: Uint8Array;
  contentType: string;
  filename: string;
};

export type AiV2EmailMessage = {
  attachments: AiV2EmailAttachment[];
  body: string;
  subject: string;
  to: string;
};

export type AiV2EmailSender = (message: AiV2EmailMessage) => Promise<void>;

// Keep this context limited to dependencies that v2 orchestration and its tools use.
// Add new ports only when a v2 tool actually needs them.
export type AiV2Context = {
  access: UserAccessSummary | null;
  brochureRenderer: BrochurePdfRenderer;
  db: Db;
  log: Logger;
  quoteDocumentRenderer: QuoteDocumentPdfRenderer;
  sendEmail: AiV2EmailSender;
  session: AiV2Session | null;
  storage: StorageAdapter;
};
