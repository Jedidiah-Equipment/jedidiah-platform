import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../db/.env', import.meta.url), quiet: true });

dotenv.config({
  path: new URL('../../db/.env.dev', import.meta.url),
  override: process.env.APP_ENV === 'development',
  quiet: true,
});
