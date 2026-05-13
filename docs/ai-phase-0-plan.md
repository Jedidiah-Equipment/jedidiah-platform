# Phase 0: AI Spike Implementation Plan

Last updated: 2026-05-13
Status: ready for build
Owner: TBD
Companion doc: [ai-architecture-options.md](./ai-architecture-options.md)

## Goal

Prove the smallest end-to-end slice of an in-app assistant:

1. An authenticated React surface where a logged-in user can send a message and watch the
   assistant stream a response.
2. The assistant can call one read-only tool — `listProducts` — that mirrors the existing
   `products.list` tRPC procedure exactly: same `ProductListInput` schema, same `@pkg/core`
   call, same `ProductListResult` shape.
3. Streaming works over the existing Fastify + Railway-style runtime, including abort.

Nothing else. No persistence, no approvals, no schedules, no MCP, no provider abstraction.

## Decisions Locked For Phase 0

| Area | Decision |
| --- | --- |
| Provider | OpenAI only. |
| SDK | Official `openai` Node SDK using the **Responses API** with streaming. |
| Model | `gpt-5.5` for chat. Pin in env, not in source. Single model for the spike. |
| Tool surface | One tool: `listProducts`. Read-only. Mirrors the `products.list` tRPC procedure 1:1 — same `ProductListInput` schema from `@pkg/schema`, same `listProducts` call into `@pkg/core`, same `ProductListResult` shape. |
| Chat persistence | **Ephemeral.** Full message history lives in React state only. The server is stateless across requests — the client sends the full transcript on every turn. |
| Transport | Dedicated Fastify route `POST /ai/chat-stream`. **Not** tRPC. |
| Stream protocol | Server-Sent Events (SSE), one event type, newline-framed JSON payloads. |
| Auth | Better Auth session cookie, same `getSessionFromHeaders` used by tRPC. |
| Authorization | Route requires an authenticated session. Tool handlers reuse the existing `access` summary and respect `product:read`. |
| Surface in web | Hidden route `/_authed/assistant` behind a feature flag (`VITE_ENABLE_ASSISTANT`). Not linked from the main nav. |
| Audit / cost logging | Console + Fastify logger only. No DB tables. |
| Tests | Unit tests for the tool handler. One integration test for the streaming route happy path. No eval harness yet. |

Out of scope for Phase 0 (call out explicitly so reviewers don't ask):

- Conversation/message tables, approvals, schedules, MCP, multi-provider, retries, resumable
  streams, cost budgets, rate limits, prompt injection hardening beyond the basics, multi-tool
  orchestration, structured outputs, RAG.

## Exit Criteria

The spike is "done" when **all** of these are demonstrable on a dev machine:

1. A logged-in user opens `/_authed/assistant`, types "find product abc", and sees a streamed
   answer that references a real product row.
2. The assistant correctly invokes `listProducts` (visible in API logs) and uses the result
   in its reply. The arguments it picks are valid `ProductListInput` values.
3. Hitting "Stop" in the UI aborts the upstream OpenAI request within ~1s; the API logs the
   cancel.
4. An unauthenticated request to `/ai/chat-stream` returns 401 without contacting OpenAI.
5. A request from a user who lacks `product:read` cannot retrieve product data through the
   assistant (the tool returns an authorization error and the model relays it).
6. `pnpm typecheck` and `pnpm test` pass across the workspace.
7. The streaming route returns within Railway's request limits for a normal turn (smoke test:
   no proxy buffering, first byte under ~2s on a warm process).

If any of these fail, Phase 0 is not done — do not start Phase 1.

## Architecture

```txt
React /_authed/assistant
  ├─ useAssistantChat()   ephemeral messages[] in React state
  └─ fetch('/ai/chat-stream', { body: { messages } }, signal)
       │  Better Auth cookie attached (credentials: include)
       ▼
Fastify route  POST /ai/chat-stream
  ├─ auth: getSessionFromHeaders → 401 if missing
  ├─ build AiContext { session, access, db }
  ├─ openai.responses.stream({ model, input, tools })
  ├─ on tool_call → dispatch via aiTools[name](args, ctx)
  ├─ forward provider events as SSE `data: {...}\n\n`
  └─ on abort → upstream.controller.abort(); log; end stream
       │
       └─ tools.listProducts(args, ctx)
            ├─ ProductListInput.parse(args)               // same schema as tRPC
            ├─ ctx.access.can('product:read')             // same gate as authorizedProcedure
            └─ listProducts(ctx.db, input) from @pkg/core // same call as products.list
```

No new packages beyond `openai` in `@pkg/api`. No changes to `@pkg/core`, `@pkg/db`, or
`@pkg/schema` — the tool reuses `ProductListInput` and `ProductListResult` directly. By
mirroring the tRPC procedure, anything the model can ask the assistant to do is exactly what
the existing UI can already do via `products.list`; there is no new authorization surface.

## File Plan

New files only. No edits to existing routers.

```txt
pkg/api/src/routes/ai/
  ai-stream.route.ts        Fastify SSE route, OpenAI streaming, tool dispatch
  ai-context.ts             builds { session, access, db } for tool handlers
  ai-tools.ts               tool registry: name → { schema, description, handler }
  tools/list-products.ts    listProducts tool — mirrors products.list tRPC procedure
  ai-openai.ts              thin wrapper: new OpenAI(), model id, default options
  ai-sse.ts                 SSE helpers: writeEvent, writeError, closeStream
  README.md                 short pointer back to this doc

pkg/api/src/routes/ai/__tests__/
  list-products.tool.test.ts unit test against test db
  ai-stream.route.test.ts    integration test: 401, happy path with a stubbed OpenAI client

pkg/web/src/routes/
  _authed.assistant.tsx     gated by VITE_ENABLE_ASSISTANT, renders <AssistantPanel/>

pkg/web/src/components/assistant/
  AssistantPanel.tsx        message list + composer + Stop button
  useAssistantChat.ts       ephemeral hook: messages, send, stop, status
  sse-client.ts             tiny fetch-based SSE reader (no extra deps)
```

Files modified:

- `pkg/api/src/server.ts` — register the AI route after `registerAuthHandler`.
- `pkg/api/src/env.ts` — add `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5.5`),
  `AI_ENABLED` (default `false`).
- `pkg/api/package.json` — add `openai` dependency.
- `pkg/web/src/server/env.ts` — add `VITE_ENABLE_ASSISTANT` (default `false`).

## Why Not tRPC Subscriptions

tRPC 11 supports SSE-backed subscriptions (`httpSubscriptionLink`, async iterables) and would
in principle give us typed end-to-end events for free. We are **not** using them for chat in
Phase 0. The reasons, in order of weight:

1. **Subscriptions are GET-with-input.** They are not designed to carry a multi-KB transcript
   as the request body. To use one for chat we'd either jam the full message history into a
   query string (URL-length cliff, awkward) or split the turn into a `chat.send` mutation
   that stashes state server-side plus a `chat.stream` subscription that reads it back. That
   contradicts Phase 0's locked decision that the server is stateless and the transcript
   lives only in React.
2. **Two layers of streaming abstraction.** A subscription wraps an async iterator that wraps
   the OpenAI SDK's event stream. Abort semantics have to traverse all of them. A plain
   `POST` + SSE route is one layer and trivially `curl`-able for debugging.
3. **Ecosystem alignment.** Chat UI libraries (Vercel AI SDK's `useChat`, custom UI message
   protocols, hypothetical future MCP adapters) all speak fetch/SSE. A tRPC subscription is
   a bespoke protocol from any of their perspectives. Keeping the chat route on plain SSE
   leaves that door open.
4. **The typed-events upside is mostly free anyway.** We export the `AssistantEvent`
   discriminated union from `@pkg/api` and import it in `@pkg/web`. The wire is untyped JSON
   but both ends agree on the type at compile time. That's 90% of the benefit subscriptions
   would give us, without the coupling.

Where tRPC subscriptions **are** the right tool, and we'll reach for them in Phase 2+:

- `ai.approvals.onPending` — push when the assistant proposes an action that needs review.
- `ai.schedules.onRunUpdate` — schedule run started / finished / failed.
- `ai.conversations.onUpdate` — once conversations persist, sync state across tabs/devices.

These are short, typed, low-frequency control-plane events that map perfectly to
subscriptions and don't interleave with a token stream. The chat token stream stays on the
dedicated SSE route.

## Streaming Contract

One endpoint, one direction. SSE chosen because the OpenAI SDK already emits a typed event
stream that maps cleanly to it and because the browser `EventSource` semantics (or a fetch
reader) are well understood.

**Request** `POST /ai/chat-stream`

```ts
{
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}
```

The client sends the full transcript every turn. No `conversationId`. No server-side memory.

**Response** `text/event-stream`, headers:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (defensive against proxy buffering)

Events (single `data:` line, JSON payload):

```ts
type AssistantEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | {
      type: 'tool_result';
      name: string;
      ok: boolean;
      // For ok=true: a short summary string for UI display ("12 products, page 1 of 3").
      // The full ProductListResult is fed back to the model, not emitted to the client
      // verbatim in Phase 0.
      summary: string;
      // For ok=false: a stable reason code so the UI can render it consistently.
      reason?: 'unauthorized' | 'invalid_input' | 'internal_error';
    }
  | { type: 'done' }
  | { type: 'error'; message: string };
```

Rules:

- Always end with exactly one `done` or `error` event, then close.
- On client disconnect (`req.raw.on('close')`), call `controller.abort()` on the OpenAI stream
  and stop writing.
- Errors from the model or tool become an `error` event; never throw out of the route handler
  mid-stream.

## Tool Contract

`listProducts` is the only tool. It is a **thin mirror of the `products.list` tRPC procedure**:
same input schema, same core call, same result shape. The reason is to keep Phase 0 honest —
the assistant cannot read anything the existing UI cannot already read for the same user.

Definition lives in `tools/list-products.ts`:

```ts
import { ProductListInput, ProductListResult } from '@pkg/schema';
import { listProducts } from '@pkg/core';

// Input  → ProductListInput   (search, columnFilters, sortBy, sortDirection, page, pageSize)
// Output → ProductListResult  (rows of full Product + sortBy + sortDirection + paging)

export const listProductsTool = {
  name: 'listProducts',
  description:
    'List products with the same filters, sort, and paging available in the products page. ' +
    'Use `search` for fuzzy name/model lookups. Returns a page of products with full fields.',
  input: ProductListInput,
  output: ProductListResult,
  async handler(args: unknown, ctx: AiContext): Promise<ProductListResult> {
    const input = ProductListInput.parse(args);
    if (!ctx.access?.can('product:read')) {
      throw new ToolAuthorizationError('product:read');
    }
    return listProducts(ctx.db, input);
  },
};
```

Mirroring rules (do not deviate in Phase 0):

- **Input schema is `ProductListInput` verbatim.** No renaming, no extra constraints, no
  Phase-0-only wrapper. If the schema is too permissive for the model, that is a Phase 1
  problem, not a Phase 0 fork.
- **Authorization is the same gate as `authorizedProcedure('product:read')`.** Implemented as
  a single check at the top of the handler. On failure throw `ToolAuthorizationError`; the
  route catches it and emits a `tool_result` event with `ok: false` so the model can relay it.
- **Output is `ProductListResult` verbatim** — full `Product` rows including `basePrice`,
  `currencyCode`, `description`, `modelCode`, `createdAt`, `updatedAt`. Pagination respects
  whatever the model passed. No server-side trimming of fields or rows beyond what the schema
  already enforces.
- **No bespoke types** like `FindProductResult` or `{ ok, reason }` envelopes — the tool
  speaks the same language as the tRPC procedure. The route layer translates thrown
  authorization errors into a tool-result envelope for the model; the handler itself returns
  the raw `ProductListResult`.

Zod → OpenAI tool schema conversion: use `zod-to-json-schema`. `ProductListInput` extends
`PagedQueryInput` and uses `.default(...)` heavily — verify the generated JSON Schema is
accepted by the Responses API at module load, and fail fast on startup if not. If a specific
construct doesn't round-trip cleanly (e.g. `z.preprocess`, transforms), document it here and
hand-author a JSON Schema for that one field rather than diverging the Zod schema.

Tool prompting note: because `ProductListInput` carries product-page semantics (column
filters, sort columns), the system prompt should briefly tell the model what `search`,
`columnFilters`, `sortBy`, and `sortDirection` mean so it picks sensible arguments. Keep this
to a short paragraph; do not duplicate the schema.

## Web Surface

Minimal. The point is to prove the wiring, not to design the final chat UI.

`useAssistantChat`:

```ts
const [messages, setMessages] = useState<Message[]>([]);
const [status, setStatus] = useState<'idle' | 'streaming' | 'error'>('idle');
const abortRef = useRef<AbortController | null>(null);

function send(content: string) { /* append user msg, open SSE, append deltas */ }
function stop() { abortRef.current?.abort(); }
```

`AssistantPanel`:

- Message list (user right, assistant left, monospace for tool events).
- Single textarea + Send button.
- Stop button visible while `status === 'streaming'`.
- Tool calls render as a plain inline line: `[tool] listProducts(search: "abc", sortBy: "name")
  → 12 products, page 1 of 3`. No styling beyond a muted color.

No conversation list, no save, no rename. Refreshing the page wipes state — that is the
intended ephemeral behavior.

## Security & Guardrails (Phase 0 Minimum)

- Route 401s unauthenticated requests **before** constructing the OpenAI client.
- `OPENAI_API_KEY` only read in `@pkg/api`. Never exposed to `@pkg/web` and never logged.
- `AI_ENABLED=false` short-circuits the route with 404 in non-dev environments by default.
- Hard cap: `messages.length <= 40`, each `content.length <= 4_000`, total payload < 64 KB.
  Reject with 413 above these.
- Tool result payloads are bounded by `ProductListInput.pageSize` (whatever cap
  `PagedQueryInput` already enforces). Phase 0 does **not** add a second cap on top — the
  tool's surface area is identical to the tRPC procedure by design.
- No system prompt injection from user content — system prompt is a constant in source.
- Per-request timeout: 60s total wall clock. Abort and emit `error` event on overflow.

Explicitly **not** in scope for Phase 0: per-user rate limiting, cost budgets, audit table,
prompt injection classifiers, PII redaction. Track these in Phase 1.

## Observability

Use the existing Fastify logger. For each request log a single structured line on completion:

```ts
req.log.info({
  userId: session.user.id,
  durationMs,
  firstTokenMs,
  tokenCount,        // from final OpenAI response usage
  toolCalls,         // [{ name, ok, durationMs }]
  finishReason,
  aborted,
}, 'ai.chat.completed');
```

Do not log message content, tool arguments, or tool results in Phase 0. (Argument logging is
a known gap — Phase 1 will design redaction.)

## Tests

Two files, both small.

`list-products.tool.test.ts`:

- Authorized user with `product:read` and a valid `ProductListInput` → returns the same
  `ProductListResult` shape as `products.list` does for the same input (snapshot or deep-equal
  against a direct `listProducts` call).
- User without `product:read` → handler throws `ToolAuthorizationError` and **does not** call
  `listProducts`.
- Invalid args (e.g. unknown `sortBy`) → Zod parse rejects with `invalid_input`.
- Generated JSON Schema from `ProductListInput` is accepted by `zod-to-json-schema` and matches
  a snapshot (regression guard if the schema changes).

`ai-stream.route.test.ts`:

- No session cookie → 401, OpenAI client never constructed (assert via DI stub).
- Authenticated request with stubbed OpenAI client emitting `[token, token, done]` →
  response body contains the expected SSE frames in order and ends cleanly.
- Client aborts mid-stream → upstream abort is called.

Use a stub OpenAI client injected via the route factory. No network calls in tests.

## Environment & Local Dev

`.env.dev` additions:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
AI_ENABLED=true
```

Web:

```bash
VITE_ENABLE_ASSISTANT=true
```

Smoke check before declaring done:

1. `pnpm dev` (api + web).
2. Log in as admin.
3. Open `/assistant`, ask "find product 'Sample'".
4. Watch the network panel: SSE frames stream in, first byte under 2s.
5. Send a long-running query, click Stop, confirm API log shows `aborted: true`.

## Risks & Open Items For Phase 0

| Risk | Mitigation |
| --- | --- |
| Fastify response buffering breaks SSE locally or on Railway | Set `X-Accel-Buffering: no`, disable compression on this route, write a heartbeat comment line every 15s. |
| OpenAI SDK abort semantics drift across versions | Pin the SDK version, cover with the abort test. |
| `zod-to-json-schema` produces an OpenAI-incompatible schema for `ProductListInput` (defaults, transforms, nested `PagedQueryInput`) | Validate once at module load; if a specific field doesn't round-trip, hand-author the JSON Schema for that field only — do not fork `ProductListInput`. |
| Model picks weird `columnFilters` or `sortBy` values | System prompt explains the four input dimensions briefly; Zod parse rejects invalid args and the route returns a `tool_result` with `reason: 'invalid_input'` so the model can retry. |
| Returning full `Product` rows leaks fields we'd rather not show (e.g. `basePrice`) | Accepted for Phase 0 — the assistant has the same read surface as the tRPC procedure, no more. Re-evaluate in Phase 1 if we want a separate "assistant projection". |
| Ephemeral state surprises a user who refreshes | Document in the UI: "This conversation is not saved." |
| Model id `gpt-5.5` changes name or pricing | Env-configurable; doc says pin and review quarterly. |

Open questions to resolve **before** Phase 1, not during Phase 0:

- Do we want SSE long-term, or switch to UI-message protocol when we adopt a chat hook
  library?
- Where does conversation persistence live — new `ai` schema in `@pkg/db`, or attached to an
  existing namespace?
- Argument/result redaction policy for audit logs.

## Implementation Order (Suggested)

1. Add env vars and `openai` (and `zod-to-json-schema` if not already present) deps. Confirm
   `pnpm install` and typecheck still pass.
2. Build `tools/list-products.ts` + unit test, mirroring the `products.list` tRPC procedure.
   No streaming yet.
3. Build `ai-stream.route.ts` against a stubbed client + integration test.
4. Wire the route into `server.ts` behind `AI_ENABLED`.
5. Build `sse-client.ts` + `useAssistantChat` + `AssistantPanel`.
6. Add the `/_authed/assistant` route behind `VITE_ENABLE_ASSISTANT`.
7. End-to-end smoke against real OpenAI. Tune timeouts and headers until exit criteria pass.
8. Open a PR titled `phase 0: ai assistant spike` linking to this doc.
