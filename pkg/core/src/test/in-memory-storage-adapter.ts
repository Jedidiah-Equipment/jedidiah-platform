import {
  type StorageAdapter,
  StorageKeyAlreadyExistsError,
  StorageObjectNotFoundError,
  type StoragePutInput,
  type StoredObject,
} from '../documents/storage-adapter.js';

export class InMemoryStorageAdapter implements StorageAdapter {
  readonly objects = new Map<string, { body: Uint8Array; byteSize: number; contentType: string }>();

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async put(input: StoragePutInput): Promise<void> {
    if (this.objects.has(input.key)) {
      throw new StorageKeyAlreadyExistsError(input.key);
    }

    this.objects.set(input.key, {
      body: input.body.slice(),
      byteSize: input.byteSize,
      contentType: input.contentType,
    });
  }

  async get(key: string): Promise<StoredObject> {
    const object = this.objects.get(key);

    if (!object) {
      throw new StorageObjectNotFoundError(key);
    }

    return {
      byteSize: object.byteSize,
      contentType: object.contentType,
      body: toAsyncIterable(object.body.slice()),
    };
  }
}

async function* toAsyncIterable(body: Uint8Array): AsyncIterable<Uint8Array> {
  yield body;
}
