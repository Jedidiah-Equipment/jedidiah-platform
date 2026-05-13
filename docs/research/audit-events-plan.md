# Audit Events Plan

Status: planned

This document defines the first durable audit trail slice for app-owned database entities. The
initial use case is product history: what changed, when it changed, and who changed it. The same
event stream should also be usable as the source for a future notification or alert panel.

## Goals

- Record a durable event whenever an audited app entity is created, updated, or deleted.
- Store the actor user when the change came from an authenticated user.
- Store a human-readable summary that can be shown directly in history and notification UI.
- Store a structured field diff for update details and future machine-readable workflows.
- Keep audit writes inside the same database transaction as the domain mutation.
- Keep the v1 implementation aligned with the existing Postgres, Drizzle, tRPC, Better Auth, and
  Vitest stack.

## Non-Goals

- Do not add pgAudit, database-wide trigger logging, or external audit infrastructure in v1.
- Do not add real-time push notifications in v1.
- Do not add per-user read or dismissal state in v1.
- Do not make this a compliance-grade tamper-proof audit log yet.

## Recommended Shape

Use a single app-owned `audit_events` table. It is intentionally explicit rather than fully generic
event-sourcing infrastructure.

```ts
// pkg/db/src/schema/audit.ts
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    actorUserId: text("actor_user_id").references(() => user.id), // null = system
    entityType: text("entity_type").notNull(), // "product"
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(), // "created" | "updated" | "deleted"
    summary: text("summary").notNull(), // human-readable
    changes: jsonb("changes"), // { field: { from, to } } - nullable
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId, t.occurredAt),
    index("audit_actor_idx").on(t.actorUserId, t.occurredAt),
  ],
);
```

This shape fits products and other app-owned UUID entities. Better Auth-owned `user` rows use text
IDs, so user-role audit events should be deferred until we choose one of these approaches:

- allow `entity_id` to become `text`
- add a separate nullable `entity_text_id`
- keep user/admin audit events in a separate table
- log user-target details inside `changes` only, without using `entity_id` as the user id

For v1, keep the table exactly UUID-based and start with products.

## Event Semantics

`entityType` should be a stable singular domain key such as `product`.

`action` should be one of:

```txt
created
updated
deleted
```

Enforce the action and entity type in TypeScript/Zod first. A database enum or check constraint can
come later if the event vocabulary stabilizes.

`summary` should be written at event creation time, not assembled only in the UI. This preserves the
meaning of old events even if display labels or product names change later.

Example summaries:

```txt
Created product "Wheel Loader"
Renamed product "Wheel Loader" to "Wheel Loader XL"
Deleted product "Wheel Loader XL"
```

`changes` should be field-oriented and only include fields that actually changed:

```json
{
  "name": {
    "from": "Wheel Loader",
    "to": "Wheel Loader XL"
  }
}
```

For creates and deletes, `changes` may be `null` unless the UI needs the full snapshot. If snapshots
become useful, store them as changes from or to `null` per field rather than adding separate
`before` and `after` row blobs.

## Write Path

Audit events should be written by application code, not by database triggers, because the API has the
best access to authenticated user context and business language.

For product create:

1. Validate input through the existing product tRPC procedure.
2. Start a database transaction.
3. Insert the product.
4. Insert an audit event with `action = "created"`, the new product id, the session user id, and a
   create summary.
5. Commit and return the product.

For product update:

1. Validate input through the existing product tRPC procedure.
2. Start a database transaction.
3. Read the current product row.
4. Apply the update.
5. Compute a field diff from the previous row and updated row.
6. Insert an audit event only if an audited field changed.
7. Commit and return the updated product.

For future deletes:

1. Read the current row before deleting.
2. Delete the row or mark it deleted, depending on the domain model.
3. Insert a delete audit event while the old values are still available.

## Package Responsibilities

### `@pkg/db`

- Add `pkg/db/src/schema/audit.ts`.
- Export it from `pkg/db/src/schema/index.ts`.
- Generate and commit a Drizzle migration with `pnpm db:generate`.
- Keep indexes limited to the entity timeline and actor timeline until a feed query proves more is
  needed.

### `@pkg/schema`

- Add Zod schemas and inferred types for:
  - `AuditAction`
  - `AuditEntityType`
  - `AuditFieldChange`
  - `AuditChanges`
  - `AuditEvent`
  - `AuditEntityHistoryInput`
  - `AuditEntityHistoryResult`

### `@pkg/core`

- Add pure helpers for building audit summaries and field diffs.
- Add database helpers for inserting audit events.
- Update product service functions so create/update can run product mutation and audit insert in one
  transaction.

### `@pkg/api`

- Pass `ctx.session.user.id` into audited mutations.
- Keep routers thin: authorization, input validation, session context, then service call.
- Add an `audit` or `activity` router only when the UI needs to query history.

### `@pkg/web`

- Start with an entity history panel on the product detail/edit surface once product history is
  queryable.
- Use `summary` for the primary line.
- Use `changes` only for expandable detail.
- Treat a global notification panel as a later read model over the same table.

## Read APIs

Start with entity history before building global feeds:

```txt
audit.listForEntity({ entityType: "product", entityId })
```

Return newest first. Include actor display details by joining to the `user` table when possible. If
`actor_user_id` is null, show `System`.

Later notification/feed APIs can be added over the same source:

```txt
audit.feed({ limit, cursor })
```

If per-user read state becomes necessary, add a separate table instead of mutating `audit_events`:

```txt
user_audit_notifications
  user_id text
  audit_event_id uuid
  read_at timestamptz null
  dismissed_at timestamptz null
```

## Testing Plan

- Test product create records one audit event with the expected actor, entity, action, summary, and
  null or create-shaped changes.
- Test product update records only changed fields in `changes`.
- Test no-op product updates do not create noisy audit events if the persisted values are unchanged.
- Test unauthenticated and unauthorized product mutations still do not write audit events.
- Keep tRPC procedure tests on the direct caller harness, alongside the relevant router tests.

## Verification

For the schema/migration slice:

```sh
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm db:up:template
pnpm --filter @pkg/db typecheck
pnpm --filter @pkg/api test
pnpm typecheck
pnpm lint
pnpm test
```

## Future Hardening

- Add a `request_id` or `correlation_id` when request tracing exists.
- Add an `actor_type` if background jobs, imports, or AI actions become common.
- Add a transactional outbox worker if events need to fan out to email, push, web sockets, or other
  systems.
- Add DB-level audit logging only if compliance, privileged SQL access, or tamper-evidence
  requirements justify it.
