import type { Db } from '@pkg/db';
import type { AuthId, Logger, UserAccessSummary } from '@pkg/schema';

export type AiV2Session = {
  user: {
    id: AuthId;
    email: string;
    assistantEnabled: boolean;
  };
};

// V2 currently has one read tool, so its context contains only the dependencies that orchestration
// and listProducts use. Add new ports here only when a v2 tool actually needs them.
export type AiV2Context = {
  access: UserAccessSummary | null;
  db: Db;
  log: Logger;
  session: AiV2Session | null;
};
