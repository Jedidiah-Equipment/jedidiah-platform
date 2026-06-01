# Jobs snapshot Product documents at creation

When a Job is created from a Quote, the Product's current Documents are frozen onto the Job as a **Job Document Snapshot**, the same way the CFO freezes the Effective BOM (ADR 0028). The Job records exactly which Part Books / SOPs were current at build time, unaffected by later edits to the Product's Documents.

## Decision

- **One `documents` table, single owner per row.** A row carries one owner (typed nullable FK + an exactly-one-owner check constraint), a filename (unique per owner, case-insensitive), and a `storage_key`. There is no separate physical-file table.
- **Sharing is by `storage_key`, not by a join.** Stored objects are immutable and never deleted (ADR 0029), so multiple `documents` rows may point at the same key safely — no dedup table, no reference counting, no garbage collection on delete.
- **Snapshot = row copy, in the Create-Job-from-Quote transaction.** Alongside the CFO, the Product's current Documents are copied into Job-owned `documents` rows pointing at the **same** `storage_key`s. No bytes are copied.
- **The snapshot is frozen.** Job-owned document rows are created only by Create Job from Quote and are read-only forever — no document route writes them. Later edits or deletions of the Product's Documents do not touch the Job's copies, and because objects are never deleted, a Product deleting its Document never strands the Job's copy.
- **Point-in-time versioning falls out for free.** "Replace" on a Product is delete + re-upload to a new key; the Product points at the new object while existing Job snapshots still point at the old one. No versions table is needed to answer "what was this Job built against."

## Decision drivers

- A Job is a frozen build record; its documents must be as immutable as its CFO. Reusing the CFO snapshot pattern keeps one mental model.
- Row-copy-sharing-keys is the minimal mechanism: it needs no new table beyond `documents` and no lifecycle bookkeeping, precisely because objects are write-once and never GC'd.
- Permissions derive from the owner: snapshot rows are owned by the Job, so they are readable by anyone who can read the Job (job-supervisor, department managers, admin) without granting Product access. Documents are job-wide, not department-scoped.

## Consequences

- Immutable file metadata (size, content type) is duplicated across rows that share a key. Accepted — objects are immutable, so the copies can never diverge.
- The snapshot captures **all** of the Product's Documents; there is no kind/flag to select a subset (Documents are free-form, with no typed kind).
- Job-specific document uploads (a Job owning Documents not copied from its Product) are a clean future extension — the single-table, single-owner model already supports them — and are deliberately out of scope here.
