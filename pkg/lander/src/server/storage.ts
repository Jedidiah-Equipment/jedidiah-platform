import { Readable } from 'node:stream';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { type StorageAdapter, StorageObjectNotFoundError, type StoredObject } from '@pkg/core';

import { getLanderConfig } from './env.js';

// The Lander's own read-only S3 adapter (ADR 0007). It implements only `get`: the Lander streams stored
// Range and Product imagery and never uploads or deletes. The write methods are present to satisfy the
// shared StorageAdapter contract but are intentionally unreachable here.
class LanderStorageAdapter implements StorageAdapter {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(options: { bucket: string; client: S3Client }) {
    this.bucket = options.bucket;
    this.client = options.client;
  }

  async get(key: string): Promise<StoredObject> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));

      if (!response.Body) {
        throw new StorageObjectNotFoundError(key);
      }

      return {
        body: toAsyncIterable(response.Body),
        byteSize: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (isS3Status(error, 404)) {
        throw new StorageObjectNotFoundError(key);
      }

      throw error;
    }
  }

  deleteObject(): Promise<void> {
    throw new Error('The Lander storage adapter is read-only.');
  }

  put(): Promise<void> {
    throw new Error('The Lander storage adapter is read-only.');
  }
}

let storage: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!storage) {
    const config = getLanderConfig();

    storage = new LanderStorageAdapter({
      bucket: config.DOCUMENT_STORAGE_BUCKET,
      client: new S3Client({
        credentials: {
          accessKeyId: config.DOCUMENT_STORAGE_ACCESS_KEY_ID,
          secretAccessKey: config.DOCUMENT_STORAGE_SECRET_ACCESS_KEY,
        },
        endpoint: config.DOCUMENT_STORAGE_ENDPOINT,
        forcePathStyle: config.DOCUMENT_STORAGE_FORCE_PATH_STYLE,
        region: config.DOCUMENT_STORAGE_REGION,
      }),
    });
  }

  return storage;
}

function toAsyncIterable(body: unknown): AsyncIterable<Uint8Array> {
  if (isAsyncIterable(body)) {
    return body;
  }

  if (body instanceof Readable) {
    return body as AsyncIterable<Uint8Array>;
  }

  throw new Error('S3 object body is not streamable');
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
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
