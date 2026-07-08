import type { StorageAdapter } from '@pkg/core';
import type { Db } from '@pkg/db';
import type {
  AiContext as AiContextSchema,
  AuthId,
  Logger,
  QuoteDraftEmailInput,
  QuoteDraftEmailResult,
} from '@pkg/schema';

export type AiSession = {
  user: {
    id: AuthId;
    email: string;
    assistantEnabled: boolean;
  };
};

export type DeliverQuoteDraftEmail = (args: {
  actorUserId: AuthId;
  db: Db;
  emailBody: string;
  input: QuoteDraftEmailInput;
  recipientEmail: string;
  storage: StorageAdapter;
}) => Promise<QuoteDraftEmailResult>;

export type AiDependencies = {
  deliverQuoteDraftEmail: DeliverQuoteDraftEmail;
  log: Logger;
};

export type AiContext = AiContextSchema<Db, AiSession, StorageAdapter> & AiDependencies;
