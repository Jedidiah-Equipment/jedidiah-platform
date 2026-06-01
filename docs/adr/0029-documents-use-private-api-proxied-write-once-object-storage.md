# Documents use private, API-proxied, write-once object storage

Documents (uploaded files owned by an entity — Part Books and SOPs on Products to start) are stored as objects in a Railway S3-compatible bucket, not inline on the owning record. This introduces object storage for the first time, qualifying ADR 0025, which kept thumbnails inline specifically to "avoid introducing object storage before full-size media exists" — that media now exists.

## Decision

- **Private bucket, bytes proxied through the API.** The bucket is never publicly reachable. Uploads and downloads stream through a Fastify route that runs the same Better Auth + role checks as the rest of the app; the browser never talks to the bucket directly. A thin storage adapter exposes `put`/`get`/`delete` by key so the backing store is swappable.
- **MinIO in dev/CI, Railway in prod.** The same `S3Storage` adapter runs everywhere via `@aws-sdk/client-s3`; local/CI point it at a MinIO container (alongside the existing Postgres container), prod points it at Railway. Unit tests use an in-memory fake adapter.
- **Stored objects are write-once and never deleted.** Each upload lands at a unique key; keys are never overwritten. Deleting a Document removes its `documents` row but leaves the object in the bucket. There is no `document_version` table.
- **Recovery is forensic, via audit.** `document` is an audited entity type and the storage key is captured field-level on create. The only record that a deleted (or superseded) file ever existed is its audit history, which holds the key needed to fetch the orphaned object from the bucket. Recovery is an admin/forensic operation, not a user-facing feature.

## Considered options

- **Presigned direct-to-bucket uploads/downloads.** Rejected for slice one: it moves auth to URL-issue time (the URL becomes a bearer token), needs bucket CORS and public-ish signed access, and complicates local dev. Documents are PDFs (tens of MB at most), so API-proxying is not a throughput concern yet. Revisit when large CAD binaries land on Parts.
- **A `document_version` table for retained history.** Rejected: immutability (delete + re-upload) plus never deleting objects plus the existing audit log already preserves every prior file. A versions table would duplicate what audit records.

## Consequences

- Orphaned objects accumulate in the bucket forever; this is accepted (storage is cheap, and a future lifecycle sweep can use audit history to identify truly unreferenced keys).
- Recoverability is coupled to audit retention — the bucket key lives only in the audit event. This is acceptable because the audit log is treated as the permanent forensic record of truth (ADR 0008).
- Large files tie up a Node process while streaming; the per-owner-type size cap (`DocumentPolicy` in `pkg/domain`) bounds this, and raising it for CAD is the trigger to reconsider presigned uploads.
