# Shared Request Context

## Problem

`buildAiContext` (`pkg/api/src/routes/ai/ai-context.ts`) and `createContext` (`pkg/api/src/trpc/context.ts`) are near-identical functions:

- Both call `getSessionFromHeaders(req.headers)`
- Both call `createUserAccessSummary({ role, userId })`
- Both return `{ session, access, db }`

The only difference is that `createContext` adds `log: req.log`. This is a shallow duplication — a session derivation bug has two fix sites.

**Deletion test**: delete one and the complexity moves to the caller or you copy-paste the survivor. No concentration — just drift.

## Files

- `pkg/api/src/routes/ai/ai-context.ts`
- `pkg/api/src/trpc/context.ts`

## Solution

Extract a shared `buildRequestContext(req)` in the `api` package that returns `{ session, access, db, log }`. Both `buildAiContext` and `createContext` become thin wrappers (or are replaced entirely).

```ts
// pkg/api/src/context.ts
export async function buildRequestContext(req: FastifyRequest) {
  const session = await getSessionFromHeaders(req.headers);
  const access = session
    ? createUserAccessSummary({ role: session.user.role, userId: session.user.id })
    : null;
  return { access, db, log: req.log, session };
}
```

This is a mechanical extraction with no behaviour change.

## Benefits

- **Locality**: session + access derivation has one home; a bug in `getSessionFromHeaders` has one fix
- **Leverage**: new request handlers get a fully-populated context with one call
- **Tests**: one test suite covers context-building for all request types
- **Low risk**: no interface or behaviour changes, only consolidation
