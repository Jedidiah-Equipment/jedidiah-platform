# Tool Authorization Declared, Not Inline

## Problem

`listProductsTool.handler` in `pkg/api/src/routes/ai/tools/list-products.ts` calls `hasPermission(ctx.access, "product:read")` inline. The required permission is buried in the implementation — invisible to callers. The model is also offered tools the user cannot call, which is wasteful and leaks capability information.

As more tools are added, each will duplicate this pattern. The `AiTool` interface has no slot for permission metadata.

**Deletion test**: delete the inline `hasPermission` call and authorization for that tool silently vanishes. The complexity isn't encapsulated — it's just hidden.

## Files

- `pkg/api/src/routes/ai/tools/list-products.ts` (line 23)
- `pkg/api/src/routes/ai/ai-tools.ts` (`AiTool` type, `createRunnableTools`, `dispatchToolCall`)

## Solution

The core insight: **filter the tool list before it reaches the model**. If the model never sees tools the user can't call, dispatch-time permission checks are redundant.

### Design decisions

- **`requiredPermission` is required, not optional** — every tool must declare exactly one `AppPermission`. No tool ships without an access guard.
- **One tool, one permission** — no multi-permission requirements; keeps auth logic simple.
- **Filter at list-construction time, not dispatch time** — `getAuthorizedTools` is a separate step from `createRunnableTools`, so each concern is independently testable.
- **`dispatchToolCall` loses its auth concern** — pure lookup and call; the higher-level filter makes it redundant.

### Interface

```ts
type AiTool = {
  description: string;
  handler: (args: unknown, ctx: AiContext) => Promise<unknown>;
  jsonSchema: Record<string, unknown>;
  requiredPermission: AppPermission;  // required, not optional
};

// 1. Filter — which tools can this user see?
function getAuthorizedTools(access: UserAccessSummary | null): Record<string, AiTool>

// 2. Map — turn filtered tools into runnable format
function createRunnableTools(
  tools: Record<string, AiTool>,
  onToolCall: (event: ChatEvent) => void,
): RunnableTool[]

// 3. Dispatch — no auth concern, pure lookup + call
async function dispatchToolCall(
  tools: Record<string, AiTool>,
  name: string,
  args: unknown,
  ctx: AiContext,
): Promise<InternalToolResult>
```

`listProductsTool.handler` drops its `hasPermission` call entirely — pure business logic.

## Benefits

- **Locality**: the rule "what can this user do?" is answered once, at list-construction time
- **Leverage**: new tools get authorization for free by declaring `requiredPermission`; no handler code required
- **Tests**: `getAuthorizedTools` can be tested with any access summary — "product-viewer gets these tools, admin gets all"; handler tests need no auth context
- **Interface is the test surface**: a tool's permission requirement is visible in its type, not hidden inside handler logic
