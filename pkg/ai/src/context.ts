import type { StorageAdapter } from '@pkg/core';
import type { Db } from '@pkg/db';
import type { AiContext as AiContextSchema, AuthId, QuoteDraftEmailInput, QuoteDraftEmailResult } from '@pkg/schema';
import type { Logger } from 'pino';

export type AiSession = {
  user: {
    id: AuthId;
    email: string;
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
