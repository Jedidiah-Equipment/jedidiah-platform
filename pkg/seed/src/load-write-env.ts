import dotenv from 'dotenv';

const databaseUrlWasProvided = process.env.DATABASE_URL !== undefined;
const storageEndpointWasProvided = process.env.DOCUMENT_STORAGE_ENDPOINT !== undefined;

// A parallel checkout records its assigned host ports at the repo root. Load those hints before the
// seed defaults, then retarget only default URLs so explicit reset-remote overrides still win.
dotenv.config({ path: new URL('../../../.env.dev', import.meta.url), quiet: true });
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });

if (!databaseUrlWasProvided && process.env.DATABASE_URL && process.env.POSTGRES_HOST_PORT) {
  process.env.DATABASE_URL = withPort(process.env.DATABASE_URL, process.env.POSTGRES_HOST_PORT);
}

if (!storageEndpointWasProvided && process.env.DOCUMENT_STORAGE_ENDPOINT && process.env.MINIO_API_HOST_PORT) {
  process.env.DOCUMENT_STORAGE_ENDPOINT = withPort(
    process.env.DOCUMENT_STORAGE_ENDPOINT,
    process.env.MINIO_API_HOST_PORT,
  );
}

function withPort(rawUrl: string, port: string): string {
  const url = new URL(rawUrl);
  url.port = port;
  return url.href;
}
