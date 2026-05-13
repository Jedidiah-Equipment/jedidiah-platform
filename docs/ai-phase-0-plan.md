# Phase 0: AI Spike Implementation Plan

Last updated: 2026-05-13
Status: ready for build
Owner: TBD
Companion doc: [ai-architecture-options.md](./ai-architecture-options.md)

## Goal

Prove the smallest end-to-end slice of an in-app assistant:

1. An authenticated React surface where a logged-in user can send a message and watch the
   assistant stream a response.
2. The assistant can call one read-only tool — `findProduct` — that runs inside the existing
   authenticated API context against Postgres via `@pkg/core`.
3. Streaming works over the existing Fastify + Railway-style runtime, including abort.

Nothing else. No persistence, no approvals, no schedules, no MCP, no provider abstraction.

## Decisions Locked For Phase 0

| Area | Decision |
| --- | --- |
| Provider | OpenAI only. |
| SDK | Official `openai` Node SDK using the **Responses API** with streaming. |
| Model | `gpt-5.5` for chat. Pin in env, not in source. Single model for the spike. |
| Tool surface | One tool: `findProduct`. Read-only. Wraps `listProducts` from `@pkg/core`. |
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
2. The assistant correctly invokes `findProduct` (visible in API logs) and uses the result in
   its reply.
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
       └─ tools.findProduct(args, ctx)
            └─ listProducts(ctx.db, { search, limit }) from @pkg/core
```

No new packages beyond `openai` in `@pkg/api`. No changes to `@pkg/core`, `@pkg/db`, or
`@pkg/schema` schemas — `findProduct`'s input/output schema lives next to the tool for now and
gets promoted to `@pkg/schema` in Phase 1 when it's worth sharing.

## File Plan

New files only. No edits to existing routers.

```txt
pkg/api/src/routes/ai/
  ai-stream.route.ts        Fastify SSE route, OpenAI streaming, tool dispatch
  ai-context.ts             builds { session, access, db } for tool handlers
  ai-tools.ts               tool registry: name → { schema, description, handler }
  tools/find-product.ts     findProduct tool implementation
  ai-openai.ts              thin wrapper: new OpenAI(), model id, default options
  ai-sse.ts                 SSE helpers: writeEvent, writeError, closeStream
  README.md                 short pointer back to this doc

pkg/api/src/routes/ai/__tests__/
  find-product.tool.test.ts unit test against test db
  ai-stream.route.test.ts   integration test: 401, happy path with a stubbed OpenAI client

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
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
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

`findProduct` is the only tool. Definition lives in `tools/find-product.ts`:

```ts
const FindProductInput = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(10).default(5),
});

type FindProductResult =
  | { ok: true; products: Array<{ id: string; name: string; sku: string | null }> }
  | { ok: false; reason: 'unauthorized' | 'not_found' };
```

Handler responsibilities:

1. Validate input with Zod.
2. Check `ctx.access?.can('product:read')`. Return `{ ok: false, reason: 'unauthorized' }` if
   not — do **not** throw. The model needs to relay this to the user.
3. Call `listProducts(ctx.db, { search: query, limit })`.
4. Return at most `limit` rows with only the three fields above. No prices, no audit fields,
   no full row dump.

Zod → OpenAI tool schema conversion: use `zodToJsonSchema` (already a transitive dep via
better-auth; if not, add `zod-to-json-schema`). Validate the converted schema once at module
load.

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
- Tool calls render as a subtle inline pill: `🔧 findProduct(query: "abc")` →
  `→ 2 results`. (Use the words, not the emoji, unless the user opts in to emoji.) For Phase 0,
  plain text is fine: `[tool] findProduct → 2 results`.

No conversation list, no save, no rename. Refreshing the page wipes state — that is the
intended ephemeral behavior.

## Security & Guardrails (Phase 0 Minimum)

- Route 401s unauthenticated requests **before** constructing the OpenAI client.
- `OPENAI_API_KEY` only read in `@pkg/api`. Never exposed to `@pkg/web` and never logged.
- `AI_ENABLED=false` short-circuits the route with 404 in non-dev environments by default.
- Hard cap: `messages.length <= 40`, each `content.length <= 4_000`, total payload < 64 KB.
  Reject with 413 above these.
- Tool result payloads capped at 10 rows, three fields each (enforced server-side, not via
  prompt).
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

`find-product.tool.test.ts`:

- Authorized user with `product:read` → returns matching products, capped at `limit`.
- User without `product:read` → returns `{ ok: false, reason: 'unauthorized' }` and **does
  not** call `listProducts`.
- Empty query → Zod rejects.

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
| `zodToJsonSchema` produces an OpenAI-incompatible schema | Validate once at module load; fall back to a hand-written JSON Schema for `findProduct` if needed. |
| Ephemeral state surprises a user who refreshes | Document in the UI: "This conversation is not saved." |
| Model id `gpt-5.5` changes name or pricing | Env-configurable; doc says pin and review quarterly. |

Open questions to resolve **before** Phase 1, not during Phase 0:

- Do we want SSE long-term, or switch to UI-message protocol when we adopt a chat hook
  library?
- Where does conversation persistence live — new `ai` schema in `@pkg/db`, or attached to an
  existing namespace?
- Argument/result redaction policy for audit logs.

## Implementation Order (Suggested)

1. Add env vars and `openai` dep. Confirm `pnpm install` and typecheck still pass.
2. Build `find-product.ts` + unit test. No streaming yet.
3. Build `ai-stream.route.ts` against a stubbed client + integration test.
4. Wire the route into `server.ts` behind `AI_ENABLED`.
5. Build `sse-client.ts` + `useAssistantChat` + `AssistantPanel`.
6. Add the `/_authed/assistant` route behind `VITE_ENABLE_ASSISTANT`.
7. End-to-end smoke against real OpenAI. Tune timeouts and headers until exit criteria pass.
8. Open a PR titled `phase 0: ai assistant spike` linking to this doc.
