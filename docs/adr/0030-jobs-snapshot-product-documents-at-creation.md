# Jobs snapshot Product documents at creation, with provenance

When a Job is created from a Quote, the Product's current Documents are frozen onto the Job as a **Job Document Snapshot**, the same way the CFO freezes the Effective BOM (ADR 0028). The Job records exactly which Part Books / SOPs were current at build time, unaffected by later edits to the Product's Documents, and each snapshot row remembers *what it was copied from* so the Job page can attribute and (later) group documents by their source.

## Decision

- **One `documents` table, single owner per row.** A row carries one owner (typed nullable FK + an exactly-one-owner check constraint), a filename (unique per owner, case-insensitive), and a `storage_key`. There is no separate physical-file table.
- **Sharing is by `storage_key`, not by a join.** Stored objects are immutable and never deleted (ADR 0029), so multiple `documents` rows may point at the same key safely — no dedup table, no reference counting, no garbage collection on delete.
- **Snapshot = row copy, in the Create-Job-from-Quote transaction.** Alongside the CFO, the Product's current Documents are copied into Job-owned `documents` rows pointing at the **same** `storage_key`s. No bytes are copied.
- **Provenance is recorded with a typed source FK column.** Each snapshot row carries `source_product_id → products` (`onDelete: restrict`), recording the Product it was copied from. This mirrors the owner modelling (typed nullable FK) rather than a polymorphic id, so provenance is a real, queryable, joinable foreign key — not a string. `restrict` is safe for the same reason ADR 0028 makes `job_cfo_part.part_id` a hard FK: a Product cannot be deleted while a Job references it. The Job page resolves the source's display name **through the live Product** (drift accepted, exactly as the CFO reads Part code/name live — ADR 0028).
- **The snapshot is frozen.** Job-owned document rows are created only by Create Job from Quote and are read-only forever — no document route writes them. Later edits or deletions of the Product's Documents do not touch the Job's copies, and because objects are never deleted, a Product deleting its Document never strands the Job's copy.
- **Point-in-time versioning falls out for free.** "Replace" on a Product is delete + re-upload to a new key; the Product points at the new object while existing Job snapshots still point at the old one. No versions table is needed to answer "what was this Job built against."

## Decision drivers

- A Job is a frozen build record; its documents must be as immutable as its CFO. Reusing the CFO snapshot pattern keeps one mental model.
- Row-copy-sharing-keys is the minimal mechanism: it needs no new table beyond `documents` and no lifecycle bookkeeping, precisely because objects are write-once and never GC'd.
- Recording provenance (`source_product_id`) even when there is only one source type today establishes the column the Job page attributes documents by, and is the anchor a future Part source extends — see below.
- Permissions derive from the owner: snapshot rows are owned by the Job, so they are readable by anyone who can read the Job (job-supervisor, department managers, admin) without granting Product access. Documents are job-wide, not department-scoped.

## Consequences

- Immutable file metadata (size, content type) is duplicated across rows that share a key. Accepted — objects are immutable, so the copies can never diverge.
- The snapshot captures **all** of the Product's Documents; the document `type` (`sop | part_book | brochure`) does **not** select a subset for Job snapshots — every Document is copied regardless of type. Each snapshot row carries its source Document's `metadata` copied verbatim and frozen, and the Job page groups by that frozen copy (see ADR 0031). (This supersedes the original "Documents are free-form, with no typed kind" stance: a per-owner-type `metadata` schema now exists, but it never narrows what gets snapshotted for a Job. Later Quote Document generation may use `type` to identify Product brochures without changing this Job snapshot rule.)
- Job-specific document uploads (a Job owning Documents not copied from a Product) are a clean future extension — the single-table, single-owner model already supports them — and are deliberately out of scope here.

## Future: Part documents (out of scope)

Parts will later own Documents (e.g. SolidWorks drawings), and the Job snapshot will then also copy each CFO Part's Documents, grouped per Part on the Job page. That work is **out of scope for now** and lands with the Part-documents slice; this ADR is intentionally limited to Product documents. When it arrives it is an *additive* change — a `source_part_id → parts` column alongside `source_product_id` (same typed-nullable-FK pattern, exactly one source set per snapshot row), the Part walk in Create Job from Quote, and per-Part grouping. The per-owner-type `metadata` jsonb (ADR 0031) already accommodates Part-specific descriptive fields; provenance stays in columns, never in `metadata`. Nothing in the product-only model above needs to change to accommodate it.
