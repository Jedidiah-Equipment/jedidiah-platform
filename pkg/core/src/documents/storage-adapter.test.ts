import { describe, expect, it } from 'vitest';

import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { StorageKeyAlreadyExistsError } from './storage-adapter.js';

describe('InMemoryStorageAdapter', () => {
  it('round-trips bytes and content type by key', async () => {
    const storage = new InMemoryStorageAdapter();
    const body = new Uint8Array([1, 2, 3, 4]);

    await storage.put({
      body,
      byteSize: body.byteLength,
      contentType: 'application/pdf',
      key: 'documents/product/one.pdf',
    });

    const stored = await storage.get('documents/product/one.pdf');

    await expect(readAll(stored.body)).resolves.toEqual(body);
    expect(stored).toMatchObject({
      byteSize: body.byteLength,
      contentType: 'application/pdf',
    });
  });

  it('keeps keys write-once', async () => {
    const storage = new InMemoryStorageAdapter();
    const body = new Uint8Array([1]);

    await storage.put({
      body,
      byteSize: body.byteLength,
      contentType: 'application/pdf',
      key: 'documents/product/one.pdf',
    });

    await expect(
      storage.put({
        body,
        byteSize: body.byteLength,
        contentType: 'application/pdf',
        key: 'documents/product/one.pdf',
      }),
    ).rejects.toBeInstanceOf(StorageKeyAlreadyExistsError);
  });

  it('deletes stored objects by key', async () => {
    const storage = new InMemoryStorageAdapter();
    const body = new Uint8Array([1]);

    await storage.put({
      body,
      byteSize: body.byteLength,
      contentType: 'application/pdf',
      key: 'documents/product/one.pdf',
    });

    await storage.deleteObject('documents/product/one.pdf');

    await expect(storage.get('documents/product/one.pdf')).rejects.toThrow('Storage object not found');
  });
});

async function readAll(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return new Uint8Array(chunks.flatMap((chunk) => [...chunk]));
}
