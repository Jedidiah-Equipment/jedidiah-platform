// A stored image reference, persisted on an owner row (as a column or inside a jsonb map). The bytes
// live in private object storage; the row keeps only this reference plus the facts needed to serve and
// audit the image. Shared by any entity that stores uploaded images. `updatedAt` is an ISO string set
// at replace time.
//
// NOTE: columns should declare this shape inline in `.$type<...>()` (rather than referencing this alias)
// so the inferred Drizzle row type stays portable into emitted declarations (avoids TS2883 on the tRPC
// procedure types). Use this alias in service/application code that reads or writes the reference.
export type StoredImageRef = {
  byteSize: number;
  contentType: string;
  storageKey: string;
  updatedAt: string;
};
