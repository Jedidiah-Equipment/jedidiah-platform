import dotenv from 'dotenv';

// Both read sources keep their DB and storage credentials in pkg/seed/.env.dev. No override, so an
// externally provided env still wins and the file only fills gaps.
dotenv.config({ path: new URL('../.env.dev', import.meta.url), quiet: true });
