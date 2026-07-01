import dotenv from 'dotenv';

// The write phase (seed:write, seed:users, reset-remote) talks to the LOCAL target: it loads
// pkg/seed/.env, which holds DATABASE_URL and DOCUMENT_STORAGE_* creds. No override, so an
// externally provided env still wins (reset-remote relies on this to target staging safely).
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
