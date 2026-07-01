import dotenv from 'dotenv';

// The read phase (seed:read) talks to STAGING: it loads pkg/seed/.env.dev, which holds
// STAGING_DATABASE_URL and STAGING_DOCUMENT_STORAGE_* creds. No override, so an externally
// provided env still wins and the file only fills gaps.
dotenv.config({ path: new URL('../.env.dev', import.meta.url), quiet: true });
