# AI Stream Lifecycle as a Deep Module

## Problem

`streamChatCompletion` in `pkg/api/src/routes/ai/ai-stream.route.ts` mixes three distinct responsibilities in ~130 lines:

1. **SSE connection state** — `isWritable`, `terminalEventSent`, `stopWriting()`
2. **Lifecycle management** — heartbeat interval, timeout, cleanup, request/reply disconnect handlers
3. **Stream event wiring** — content delta → `writeEvent`, tool_call → `writeEvent`, error → `sendTerminalError`

Adding any cross-cutting behaviour (e.g. logging stream duration, recording tool call timing, adding retry logic) requires editing this function. It is testable only at the whole-route level — you need an HTTP server to exercise the heartbeat or timeout.

**Deletion test**: delete this function and the complexity scatters across the route handler. It was earning its keep — but the interface is nearly as complex as the implementation. The seam between lifecycle and business logic doesn't exist.

## Files

- `pkg/api/src/routes/ai/ai-stream.route.ts` (`streamChatCompletion`, lines 66–201)

## Solution

Extract a `ManagedStream` module that owns SSE connection state and lifecycle. It accepts the raw reply and request, exposes a small interface, and is completely ignorant of the AI provider — making provider swaps straightforward.

```ts
type ManagedStream = {
  signal: AbortSignal;           // aborts on client disconnect or timeout
  write: (event: ChatEvent) => void;
  sendError: (message: string) => void;
  close: () => void;
};

function createManagedStream(reply: FastifyReply, request: FastifyRequest): ManagedStream
```

### Design decisions

- **Constants fixed in module** — `HEARTBEAT_INTERVAL_MS` and `STREAM_TIMEOUT_MS` are constants inside the module, not injectable. Refactor when they actually need to vary.
- **Idempotent close** — `write()`, `sendError()`, and `close()` are all silent no-ops after the first close. No caller-side guarding needed; timeout and disconnect racing is handled internally.
- **`AbortSignal` not `Promise`** — standard Web API; plugs directly into most HTTP client `abort` options. The route handler owns the abort wiring:
  ```ts
  const managed = createManagedStream(reply, request);
  // provider-agnostic: caller decides what to do with the signal
  const stream = client.chat.completions.runTools({ ..., signal: managed.signal });
  ```
- **No provider import** — `ManagedStream` has no knowledge of OpenAI or any AI client. It is pure SSE lifecycle.
- **Investigate dual close handlers** — current code listens to both `request.raw` close and `reply.raw` close; the extraction is a good moment to determine whether both are needed or one is cargo-culted.

The route handler shrinks to: build context → create managed stream → wire provider events → await done.

## Benefits

- **Locality**: SSE lifecycle bugs (heartbeat not clearing, double-close, timeout race) have one home
- **Leverage**: a second streaming route (e.g. a file export stream) can reuse `ManagedStream` without duplicating the lifecycle
- **Tests**: heartbeat firing, timeout aborting, disconnect cleanup can be tested with a mock reply/request — no HTTP server required
- **Depth**: the module hides substantial lifecycle complexity behind a small `write / sendError / close` interface
