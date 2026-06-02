# Document metadata is a per-owner-type jsonb schema, validated in the domain

Documents carry descriptive **metadata** whose required shape differs by owner type. Rather than typed columns per field, metadata lives in a single `metadata` jsonb column on `documents`, validated by a per-owner-type Zod schema co-located with `DocumentPolicy` in `pkg/domain` and enforced on write in `pkg/core`. The first instance: a Product's Documents must declare a `type` of `sop | part_book | brochure`, used to group documents for display and, later, to identify Product brochures for Quote Document generation.

This **reverses** the "Documents are free-form, with no typed kind" stance recorded in ADR 0030 (see the amendment there).

## Decision

- **One `metadata` jsonb column on `documents`.** Not a column per field. The column holds an opaque object whose validity is owned by the domain, not the database.
- **Validity is a per-owner-type schema in `DocumentPolicy` (`pkg/domain`).** `DocumentPolicy` grows from `{ allowedContentTypes, maxBytes }` to `{ allowedContentTypes, maxBytes, metadataSchema }`. Product's `metadataSchema` requires `{ type: z.enum(['sop','part_book','brochure']) }`; other owner types define their own shape (Parts later, etc.). The schema is the single source of truth, shared client + server, enforced on write in `pkg/core` exactly like the magic-byte content sniffing.
- **`type` is descriptive metadata, with narrow document-surface behavior.** It does not affect permissions, `DocumentPolicy` content/size rules, or Job Document Snapshot selection. It exists to group a Product's documents ("Part Books", "SOPs", "Brochures") in the UI, and Quote Document generation uses it to identify Product brochures.
- **Metadata is immutable.** It is part of the Document and inherits the create + hard-delete lifecycle (ADR 0029/0030). There is no in-place edit path; correcting a wrong value is delete + re-upload. The immutability invariant stays carve-out-free.
- **Metadata is frozen in the Job Document Snapshot.** The snapshot copies `metadata` verbatim onto the Job-owned row and groups by that frozen copy. Only the *source's display name* is read live (a Product can be renamed in place); metadata never is, because a Document's metadata can never change in place — there is nothing to drift.

## Decision drivers

- "Requirements differ per owner type" is the textbook case for a validated jsonb bag: a Product needs `type`, a Part will need something else, and typed columns would accumulate as sparse, mostly-null columns each meaningful for one owner — the column sprawl flagged as a concern from the start.
- It keeps the line we drew during the provenance discussion (ADR 0030): **relational / queryable / enforced-as-a-relationship → column or FK; descriptive / document-surface behavior → `metadata`.** Provenance (`source_product_id`) is a real FK and stayed a column; `type` is a descriptive label grouped or filtered over a handful of owner-scoped rows, so it belongs in metadata. Provenance must **never** live in `metadata`.
- Co-locating the schema with `DocumentPolicy` means one place defines everything owner-type-specific about a Document (allowed content types, size cap, metadata shape), validated in one shared path.

## Considered options

- **Typed columns per field (e.g. a real `document_type` enum column).** Gives DB-level enum/CHECK integrity and trivial indexing, but reintroduces the sparse-column sprawl and cannot express "different required fields per owner type" without a column per owner-type field. Rejected.

## Consequences

- **No DB-level enforcement of metadata validity.** The database stores opaque jsonb; an out-of-schema value is prevented only by the `pkg/core` write path, exactly as content-type sniffing is. Accepted: the domain is already the source of truth for document write rules.
- Grouping or selecting by `type` is over a small per-owner list, not SQL aggregation across owners. If cross-owner reporting on metadata ever becomes a need (as part demand did for the CFO in ADR 0028), that is the trigger to revisit — likely an expression index on `metadata->>'…'` before any column promotion.
- The `metadata` jsonb anticipated as a "future" render-only attribute bag in ADR 0030 arrives now, for Product `type`, ahead of Part documents.
