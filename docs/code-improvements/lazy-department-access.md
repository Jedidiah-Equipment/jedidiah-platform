# Lazy Department Access

## Problem

`createContext` (`pkg/api/src/trpc/context.ts`) currently calls `getUserAccessSummary()` for every authenticated tRPC request. That keeps department membership fresh, but it also means all existing authenticated tRPC calls pay for a `user_department` lookup even when the endpoint only needs role-based permissions.

Department membership is a Job-stage authorization axis. Most current routes only need the flat role-derived permission list.

## Files

- `pkg/api/src/trpc/context.ts`
- `pkg/api/src/routes/ai/ai-context.ts`
- `pkg/core/src/users/user-service.ts`

## Solution

Keep the current behavior until Job authorization lands, then split request access into:

- A cheap request access summary built from the Better Auth session role
- A lazy department loader used only by Job endpoints or department-aware guards

For example, Job procedures could call a helper such as `requireDepartmentAccess(ctx, department)` that loads memberships only at the point of use.

## Benefits

- Existing non-Job requests avoid an extra database read
- Job authorization still reads the database source of truth when it matters
- Department membership changes remain fresh for the endpoints that depend on them
- The context stays small, while department-aware authorization stays explicit
