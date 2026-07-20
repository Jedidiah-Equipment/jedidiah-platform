export type StoredObject = {
  body: AsyncIterable<Uint8Array>;
  byteSize: number;
  contentType: string;
};

export type StoragePutInput = {
  body: Uint8Array;
  byteSize: number;
  contentType: string;
  key: string;
};

export type StorageAdapter = {
  deleteObject: (key: string) => Promise<void>;
  get: (key: string) => Promise<StoredObject>;
  put: (input: StoragePutInput) => Promise<void>;
};

export type LoadedStoredObject = {
  bytes: Uint8Array;
  byteSize: number;
  contentType: string;
};

export async function readStoredObject(storage: StorageAdapter, key: string): Promise<LoadedStoredObject> {
  const object = await storage.get(key);
  const chunks: Uint8Array[] = [];
  let byteSize = 0;

  for await (const chunk of object.body) {
    chunks.push(chunk);
    byteSize += chunk.byteLength;
  }

  const bytes = new Uint8Array(byteSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, byteSize, contentType: object.contentType };
}

export class StorageKeyAlreadyExistsError extends Error {
  constructor(key: string) {
    super(`Storage key already exists: ${key}`);
    this.name = 'StorageKeyAlreadyExistsError';
  }
}

export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}
