import dotenv from 'dotenv';

// The promote phase reads from the staging snapshot but writes to PRODUCTION: both target blocks live in
// pkg/seed/.env.dev as STAGING_* and PRODUCTION_* so the one-time import cannot accidentally use local envs.
dotenv.config({ path: new URL('../.env.dev', import.meta.url), quiet: true });
