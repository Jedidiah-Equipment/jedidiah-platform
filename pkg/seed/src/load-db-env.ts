import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../db/.env', import.meta.url), quiet: true });

if (process.env.APP_ENV === 'development') {
  dotenv.config({ path: new URL('../../db/.env.dev', import.meta.url), override: true, quiet: true });
}
