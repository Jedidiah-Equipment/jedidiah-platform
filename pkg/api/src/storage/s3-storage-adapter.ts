import { Readable } from 'node:stream';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  type StorageAdapter,
  StorageKeyAlreadyExistsError,
  StorageObjectNotFoundError,
  type StoragePutInput,
  type StoredObject,
} from '@pkg/core';

import type { ApiConfig } from '../env.js';

type S3StorageAdapterOptions = {
  bucket: string;
  client: S3Client;
};

export class S3StorageAdapter implements StorageAdapter {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(options: S3StorageAdapterOptions) {
    this.bucket = options.bucket;
    this.client = options.client;
  }

  async put(input: StoragePutInput): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Body: input.body,
          Bucket: this.bucket,
          ContentLength: input.byteSize,
          ContentType: input.contentType,
          IfNoneMatch: '*',
          Key: input.key,
        }),
      );
    } catch (error) {
      if (isS3Status(error, 409) || isS3Status(error, 412)) {
        throw new StorageKeyAlreadyExistsError(input.key);
      }

      throw error;
    }
  }

  async get(key: string): Promise<StoredObject> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

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
}

export function createDocumentStorageAdapter(config: ApiConfig): StorageAdapter {
  return new S3StorageAdapter({
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
