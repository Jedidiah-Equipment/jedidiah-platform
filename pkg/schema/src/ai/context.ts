import type { UserAccessSummary } from '../auth/authorization.js';

export type AiContext<TDb = unknown, TSession = unknown> = {
  access: UserAccessSummary | null;
  db: TDb;
  session: TSession | null;
  storage: unknown;
};
