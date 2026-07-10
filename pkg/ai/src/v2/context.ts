import type { Db } from '@pkg/db';
import type { AuthId, Logger, UserAccessSummary } from '@pkg/schema';

export type AiV2Session = {
  user: {
    id: AuthId;
    email: string;
    assistantEnabled: boolean;
  };
};

// Keep this context limited to dependencies that v2 orchestration and its tools use.
// Add new ports only when a v2 tool actually needs them.
export type AiV2Context = {
  access: UserAccessSummary | null;
  db: Db;
  log: Logger;
  session: AiV2Session | null;
};
