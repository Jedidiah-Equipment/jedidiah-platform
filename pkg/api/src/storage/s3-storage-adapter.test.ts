import { NoSuchKey, type S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { StorageObjectNotFoundError } from '@pkg/core';
import { describe, expect, test } from 'vitest';

import { S3StorageAdapter } from './s3-storage-adapter.js';

function adapterRejectingWith(error: Error): S3StorageAdapter {
  const client = { send: async () => Promise.reject(error) } as unknown as S3Client;
  return new S3StorageAdapter({ bucket: 'documents', client });
}

describe('S3StorageAdapter.get', () => {
  test('reports a missing key as a missing object', async () => {
    const adapter = adapterRejectingWith(
      new NoSuchKey({ $metadata: { httpStatusCode: 404 }, message: 'The specified key does not exist.' }),
    );

    await expect(adapter.get('documents/missing.pdf')).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  test('lets a missing bucket fail as misconfiguration', async () => {
    const missingBucket = new S3ServiceException({
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
      message: 'The specified bucket does not exist',
      name: 'NoSuchBucket',
    });

    await expect(adapterRejectingWith(missingBucket).get('documents/missing.pdf')).rejects.toBe(missingBucket);
  });
});
