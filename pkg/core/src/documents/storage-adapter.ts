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
  get: (key: string) => Promise<StoredObject>;
  put: (input: StoragePutInput) => Promise<void>;
};

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
