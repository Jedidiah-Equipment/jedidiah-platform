import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { EnvBoolean } from '@pkg/schema';

// A minimal S3/MinIO client for the seeder, mirroring the read-only lander adapter
// (pkg/lander/src/server/runtime/storage.ts) but kept self-contained: the seed env files carry only
// DB + DOCUMENT_STORAGE_* creds, so we build the client directly rather than through @pkg/api's
// ApiConfig (which also demands AUTH_SECRET/OPENAI/etc.).
export type SeedStorage = {
  bucket: string;
  client: S3Client;
};

// `prefix` selects which env block to read: '' for LOCAL, 'STAGING_' for read, 'PRODUCTION_' for promote.
export function createStorageFromEnv(prefix: '' | 'STAGING_' | 'PRODUCTION_'): SeedStorage {
  const read = (name: string): string => {
    const value = process.env[`${prefix}${name}`];

    if (!value) {
      throw new Error(`${prefix}${name} is required to sync doc-store objects.`);
    }

    return value;
  };

  return {
    bucket: read('DOCUMENT_STORAGE_BUCKET'),
    client: new S3Client({
      credentials: {
        accessKeyId: read('DOCUMENT_STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: read('DOCUMENT_STORAGE_SECRET_ACCESS_KEY'),
      },
      endpoint: read('DOCUMENT_STORAGE_ENDPOINT'),
      forcePathStyle: EnvBoolean.parse(read('DOCUMENT_STORAGE_FORCE_PATH_STYLE')),
      region: read('DOCUMENT_STORAGE_REGION'),
    }),
  };
}

// Fetches an object's bytes, returning null when the key is absent (a dangling reference in staging) so
// callers can warn and skip rather than abort the whole sync.
export async function downloadObject(store: SeedStorage, key: string): Promise<Uint8Array | null> {
  try {
    const response = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }));

    if (!response.Body) {
      return null;
    }

    return await response.Body.transformToByteArray();
  } catch (error) {
    if (isS3Status(error, 404)) {
      return null;
    }

    throw error;
  }
}

// Writes an object, overwriting any existing key (no IfNoneMatch) so re-seeding is idempotent.
export async function uploadObject(
  store: SeedStorage,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await store.client.send(
    new PutObjectCommand({
      Body: body,
      Bucket: store.bucket,
      ContentLength: body.byteLength,
      ContentType: contentType,
      Key: key,
    }),
  );
}

function isS3Status(error: unknown, statusCode: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === statusCode
  );
}
