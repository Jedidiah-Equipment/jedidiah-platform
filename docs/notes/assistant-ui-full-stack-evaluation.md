# Evaluation: Rebuilding the AI Chat Stack on Vanilla assistant-ui + AI SDK v6

Date: 2026-07-09

Research note for the proposal: throw away the custom AI chat stack except tool definitions and
rebuild on vanilla assistant-ui components, the AI SDK v6 backend integration, assistant-ui
devtools, and possibly a ChatGPT-subscription model provider.

All assistant-ui / AI SDK claims below were verified against the official docs, the
assistant-ui GitHub repo, or the npm registry on 2026-07-09; each claim carries its source URL.
Code inventory is measured against `main` at `3ebb6e40` (the working tree was mid-branch-switch
during research, so `main` is the reference).

## 1. TL;DR verdict

**The ~90% cut is not realistic. The honest number is roughly a 25–35% net reduction in product
code, because the premise misreads what our AI code is.**

Three facts drive this:

1. **The frontend already runs on assistant-ui.** `pkg/web` renders chat with
   `@assistant-ui/react@^0.14` (`useLocalRuntime`, `AssistantRuntimeProvider`, `Thread`,
   `ThreadHistoryAdapter`) — see `pkg/web/src/pages/assistant/AssistantPanel.tsx`. What is custom
   is the *transport* (SSE client + `ChatModelAdapter` bridging our `ChatEvent` protocol) and the
   debug/usage instrumentation. "Rebuild the frontend on assistant-ui" mostly means "swap
   `useLocalRuntime`+custom adapter for `useChatRuntime`+`AssistantChatTransport`".
2. **Tool definitions are already the majority of the code we'd keep — and they are not small.**
   Tool defs + result projections are ~2,700 LOC, prompts/domain guidance/registry another ~600,
   and the shared quote-email agent action ~80. That's ~3,400 of ~6,350 total non-test AI product
   LOC (~54%) that survives any rewrite by design.
3. **The genuinely deletable plumbing (~2,400–2,900 LOC of streaming/adapter/orchestration code)
   is partly replaced by new glue we'd have to write**: a Fastify↔AI SDK stream bridge, a
   `ThreadHistoryAdapter` with `withFormat`, usage-metadata wiring, per-user tool authorization on
   the new route, and re-implementations of the debug features we care about.

There are real wins — deleting the hand-rolled SSE protocol, the event-to-thread-message adapter,
and the OpenAI Agents SDK loop in favor of `streamText` + `toUIMessageStreamResponse` is a genuine
simplification and buys us standard human-in-the-loop approval, generative tool UI, and devtools.
But "all we need to do is define the tools" is wrong: authorization, persistence, projections,
prompts, and the usage gauge all live outside the tool defs and still need homes.

## 2. What assistant-ui provides

- **React primitives + shadcn-style styled components.** MIT-licensed, TypeScript/React,
  ~11k stars, Y-Combinator-backed company (maintainer Simon Farshid), very active release cadence
  (1,687 releases, 3,711 commits on main as of July 2026)
  ([github.com/assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui)).
  Styled components are installed *into your repo* via `npx shadcn@latest add https://r.assistant-ui.com/...`
  — they become code you own, not a black-box package
  ([assistant-ui.com/docs/ui/assistant-modal](https://www.assistant-ui.com/docs/ui/assistant-modal)).
- **Runtimes.** The core state layer. Options relevant to us: the AI SDK runtime
  (`useChatRuntime` from `@assistant-ui/react-ai-sdk`) and `LocalRuntime` with a custom
  `ChatModelAdapter` (what we use today)
  ([assistant-ui.com/docs/runtimes/ai-sdk/overview](https://www.assistant-ui.com/docs/runtimes/ai-sdk/overview),
  [assistant-ui.com/docs/runtimes/custom/local](https://www.assistant-ui.com/docs/runtimes/custom/local)).
- **There is no assistant-ui "backend SDK".** The backend story for the AI SDK path is just a
  Vercel AI SDK route (`streamText` → `toUIMessageStreamResponse`); assistant-ui ships the client
  transport (`AssistantChatTransport`) that talks to it
  ([assistant-ui.com/docs/runtimes/ai-sdk/v6](https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6)).
  `assistant-stream` is their OSS streaming-protocol library used internally by runtimes; you don't
  program against it in the vanilla AI SDK setup.
- **Assistant Cloud is the paid part.** A hosted service for thread persistence, thread lists, and
  analytics. Everything else (primitives, runtimes, react-ai-sdk, devtools) is OSS
  ([github.com/assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui)).
- **New "toolkit" architecture (July 2026).** Docs now push `defineToolkit` + a `"use generative"`
  compiler directive that co-locates schema, executor, and renderer per tool and splits them across
  client/server at build time, with bundler plugins `@assistant-ui/next`, `@assistant-ui/vite`
  (explicitly supports Vite/TanStack Start), and `@assistant-ui/metro`. Tool kinds: backend,
  frontend (`"use client"` executor), human-in-the-loop (`humanTool()` + `addResult`), provider
  tools, `externalTool()`, `stubTool()`. The old `makeAssistantTool` / `makeAssistantToolUI` APIs
  are **deprecated** in favor of this
  ([assistant-ui.com/docs/tools/defining-tools](https://www.assistant-ui.com/docs/tools/defining-tools)).
  Caveat: `@assistant-ui/vite` is at **0.0.8** (published 2026-07-04, npm registry) — very fresh.
  "Tool policy" as a term does not appear in the docs; the closest concepts are tool kinds,
  `disabled: true`, and runtime overrides via `useAuiToolOverrides`.
- **Versions (npm registry, 2026-07-09).** `@assistant-ui/react` latest 0.14.26 (we're on
  0.14.23), `@assistant-ui/react-ai-sdk` 1.3.40, `@assistant-ui/react-devtools` 1.2.8. Vercel AI
  SDK: `ai` latest is **v7** (7.0.18); v6 is a maintained stable line (`ai-v6` tag, 6.0.221).
  assistant-ui's "current" documented target is AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`); v5/v4 are
  legacy with "known compatibility gaps"
  ([assistant-ui.com/docs/runtimes/ai-sdk/overview](https://www.assistant-ui.com/docs/runtimes/ai-sdk/overview)).
  AI SDK 6 went stable December 2025 ([vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6));
  AI SDK 7 is out ([vercel.com/blog/ai-sdk-7](https://vercel.com/blog/ai-sdk-7)) — so "v6" is
  already one major behind upstream, though it's what assistant-ui documents.

## 3. Proposed target architecture

Packages: `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `ai@^6`, `@ai-sdk/react@^3`,
`@ai-sdk/openai`, `zod` ([v6 guide](https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6)).

**Server route** (per the v6 guide; framework-agnostic `Request → Response` handler):

```ts
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai("gpt-5.5"),
    messages: await convertToModelMessages(messages), // async in v6
    tools: { /* our tool defs: description + inputSchema: zodSchema(...) + execute */ },
    stopWhen: stepCountIs(10), // replaces our MAX_AGENT_TURNS agent loop
  });
  return result.toUIMessageStreamResponse();
}
```

- Nothing here requires Next.js. But **our API is Fastify, which is not fetch-native**: the AI SDK
  cookbook has an official Fastify example
  ([ai-sdk.dev/cookbook/api-servers/fastify](https://ai-sdk.dev/cookbook/api-servers/fastify)),
  currently shown against v7 (`reply.send(toUIMessageStream(...))`). The exact v6 helper for piping
  to a Node response needs confirming during a spike — this is a thin bridge either way, but it is
  *new code we write*, replacing `ai-sse.ts`/`ai-stream.route.ts`, not zero code. Our existing
  session-auth + `assistantEnabled` gate + input caps on that route also stay.
- **Frontend**: `useChatRuntime({ transport: new AssistantChatTransport({ api: ... }) })`;
  the transport forwards system messages and frontend tools to the backend on every request
  ([v6 guide](https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6)). We'd need to confirm it can
  send credentials/cookies cross-port the way `sse-client.ts` does today.
- **Tools**: our per-tool shape (`name`, Zod `inputSchema`, pre-generated strict `jsonSchema`,
  `requiredPermission`, `handler(args, ctx)`, `projectResult`) maps mechanically onto AI SDK
  `tool({ description, inputSchema, execute })`. The parts with **no vanilla equivalent** — and
  which must be preserved as a wrapper around the AI SDK tools map — are:
  per-user authorization filtering (`getAuthorizedTools` over `UserAccessSummary`), the
  shadowed-tool suppression rules, result projection + 24KB truncation
  (`tools/projections.ts`, 1,033 LOC), and injecting `AiContext` (db, session, storage, email
  deliverer) into `execute`. AI SDK v6 adds native human-in-the-loop via `needsApproval`
  ([v6 guide](https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6);
  [vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6)) — we currently have nothing
  equivalent, so this is a *gain*.
- **Modal**: nothing in assistant-ui assumes a dedicated page. `AssistantModal` is a stock styled
  component ("floating chat bubble", Radix Popover based), installed via
  `npx shadcn@latest add https://r.assistant-ui.com/assistant-modal.json`
  ([assistant-ui.com/docs/ui/assistant-modal](https://www.assistant-ui.com/docs/ui/assistant-modal)).
  Note it's a popover-style support widget, not a centered dialog; and it has no thread-list
  sidebar, so the current multi-chat UI would be dropped (acceptable per the proposal) or rebuilt.
- **Also must port**: `generateQuoteEmailBody` (`pkg/ai/src/actions/quote-email-body.ts`) runs the
  *same* agent + tools non-streaming for the quote-email feature. On AI SDK this becomes
  `generateText` with the same tools map — fine, but it's part of the migration, not deletable.

## 4. The ChatGPT-subscription option: not viable for us

The guide ([assistant-ui.com/docs/guides/chatgpt-subscription](https://www.assistant-ui.com/docs/guides/chatgpt-subscription))
describes OAuth-ing through the **Codex CLI** (tokens cached in `~/.codex/auth.json`) and calling
the Responses API endpoint on `chatgpt.com` via the **unofficial community package**
`openai-oauth-provider` (or a local proxy, `npx openai-oauth`, bound to 127.0.0.1). The docs are
explicit:

> "This is a personal-use setup for apps running on your own machine. For anything deployed or
> shared, use an API key." … "A deployed instance would bill every visitor to your subscription."

For a multi-user business app this is a non-starter: single personal OAuth identity, tokens on
disk, unofficial package, model availability tied to one person's ChatGPT plan, and near-certain
OpenAI ToS exposure for shared/production use. At most it's a local-dev cost saver for one
developer. **The proposal should drop this leg**; we stay on the pay-per-token API
(`OPENAI_MODEL=gpt-5.5` today, `pkg/api/src/env.ts`).

## 5. Devtools vs our debug panel

`@assistant-ui/react-devtools` mounts a `<DevToolsModal />` inside `AssistantRuntimeProvider`,
showing runtime state, logs, events, `modelContext`, and scopes; it is **development-only and
stripped from production builds**; extensible via `createDevToolsPlugin`
([assistant-ui.com/docs/devtools](https://www.assistant-ui.com/docs/devtools)).

Our `AssistantDebugSheet` (hotkey-toggled, works in production for enabled users) is
**server-informed** via `trpc.ai.debugInfo` — it shows things the client runtime cannot know:

| Feature | Our debug sheet | assistant-ui devtools |
| --- | --- | --- |
| Runtime state/events inspection | no | yes |
| Actual server system prompt | yes | no (server-side) |
| Per-tool authorization / suppression / permission badges | yes | no |
| Tool JSON schemas + descriptors | yes | partial (modelContext shows client-registered tools) |
| Estimated input tokens (tiktoken) | yes | no |
| Live per-request usage + context-window gauge (`LiveContextGauge`) | yes | no |
| Tool result size/truncation info | yes (in thread) | no |
| Available in production | yes | no (stripped) |

Devtools is a good replacement for "what is the runtime doing" debugging, and worth adding in
dev regardless. It is **not** a replacement for the debug sheet's server-side content. Partial
mitigation: AI SDK v6 supports attaching `usage`/`modelId` via `messageMetadata` on the server and
reading it with `useThreadTokenUsage()` / `getThreadMessageTokenUsage(message)`
([v6 guide](https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6)), so the per-message usage footer
and a context gauge can be rebuilt on standard mechanisms — but that's re-implementation work, not
out-of-the-box.

## 6. Current-code inventory (non-test product LOC, `main` @ `3ebb6e40`)

Totals: ~6,350 product LOC + ~6,700 test LOC across `pkg/ai`, `pkg/api/routes/ai`,
`pkg/schema/src/ai`, and `pkg/web` assistant code.

| Category | Files | ~LOC | Fate |
| --- | --- | --- | --- |
| Tool defs + projections + json-schema | `pkg/ai/src/tools/**` (non-test) | 2,744 | **Keep** (mechanical re-shape to AI SDK `tool()`) |
| Prompts + domain guidance + registry/descriptors | `prompts.ts`, `domain-guidance.ts`, `kind-facts.ts`, `link-metadata.ts`, `tool-registry.ts`, `tool-definition.ts`, `tool-description.ts`, `context.ts` | ~500 | **Keep** |
| Quote-email agent action | `actions/quote-email-body.ts` | 79 | **Keep** (port to `generateText`) |
| Agent loop + OpenAI Agents SDK runner + stream orchestration | `agent.ts`, `openai.ts`, `chat-stream.ts` | 323 | **Delete** (replaced by `streamText` + `stopWhen`) |
| Tool wiring / authorization / event fan-out | `tools.ts` | 231 | **Split**: authorization + strict-schema checks keep (~120); Agents-SDK wiring deletes |
| Debug info + token estimate + model limits | `debug-info.ts`, `context-size.ts`, `model-limits.ts` | 104 | **Re-implement or drop** (see §5) |
| API SSE route + protocol | `ai-stream.route.ts`, `ai-sse.ts`, `ai-run-config.ts`, `ai.router.ts`, `ai-context.ts` | 343 | **Mostly delete/replace** — auth gate + context building (~120) re-land on the new route; SSE plumbing replaced by a (new) Fastify↔AI SDK bridge |
| Custom `ChatEvent` protocol schema | `pkg/schema/src/ai/chat-stream.ts` + siblings | 101 | **Delete** (UI message stream replaces it); input caps re-expressed |
| Web transport: SSE client + ChatModelAdapter | `sse-client.ts`, `assistant-ui-adapter.ts` | 305 | **Delete** (replaced by `useChatRuntime` + `AssistantChatTransport`) |
| Web thread persistence + multi-chat store | `assistant-chat-store.ts`, `assistant-history-state.ts` | 321 | **Re-implement**: `useChatRuntime` needs a `ThreadHistoryAdapter` with `withFormat` ([v6 guide](https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6)); multi-thread list without Cloud remains DIY ([threads concepts](https://www.assistant-ui.com/docs/runtimes/concepts/threads)) |
| Web panel + page + hotkey + debug sheet | `AssistantPanel.tsx`, `AssistantPage.tsx`, `AssistantDebugSheet.tsx`, `useDebugSheetHotkey.ts`, `assistant-debug-state.tsx` | 520 | Panel shrinks with `AssistantModal`; debug sheet: keep or drop (§5) |
| Styled thread components (assistant-ui shadcn output + our tweaks) | `thread.tsx`, `markdown-text.tsx`, `tooltip-icon-button.tsx`, `assistant-markdown-link.tsx` | 662 | **Keep-equivalent**: a vanilla install *generates the same kind of files into our repo*; net LOC barely moves |
| Usage/size instrumentation | `live-run-usage.ts`, `assistant-run-usage.ts`, `assistant-tool-result-size.ts` | 115 | **Re-implement** on `messageMetadata`/`useThreadTokenUsage` or drop |

Rough math: hard deletes ≈ 1,300–1,600 LOC; deletes offset by required new glue (route bridge,
history adapter, authorization wrapper, usage wiring) ≈ 400–700 LOC of new code; keeps ≈ 3,900+
(tools, prompts, styled components we'd regenerate anyway). Net product-code reduction ≈
**25–35%**, plus a similar-order reduction in transport/adapter tests. The 90% claim would only be
true for a greenfield app with no authorization, no persistence, no projections, and no debug
tooling.

## 7. What we lose / open questions / risks

**Lost unless re-implemented** (acceptable-loss list per the proposal, called out explicitly):
multi-chat sidebar with per-chat local persistence; production debug sheet (system prompt, tool
authorization view, token estimates); live context-window gauge; per-message run-usage footer;
tool-result size/truncation badges.

**Open questions / risks:**

- **Persistence.** Vanilla `useChatRuntime` is in-memory; history requires a
  `ThreadHistoryAdapter` implementing `withFormat` (rows `{ id, parent_id, format, content }`),
  and there's a documented race requiring thread initialization before first save. Multi-thread
  management without paid Assistant Cloud is documented only as build-it-yourself
  ([v6 guide](https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6),
  [threads](https://www.assistant-ui.com/docs/runtimes/concepts/threads)). Decide: keep
  localStorage-style persistence (rewrite our store against `withFormat`) or move history
  server-side (new DB tables + API).
- **Fastify bridge.** `toUIMessageStreamResponse()` returns a fetch `Response`; the official
  Fastify cookbook example exists but currently targets AI SDK v7 — verify the v6 Node-response
  path in a spike ([cookbook](https://ai-sdk.dev/cookbook/api-servers/fastify)). Alternative:
  mount the chat route as a raw Node handler beside Fastify. (Inference: low risk, but unverified
  for v6 specifically.)
- **Auth/actor context into tools.** `AssistantChatTransport` must send our session cookie
  cross-port and the route must rebuild `AiContext` per request (as `ai-context.ts` does today);
  per-user tool filtering must wrap the AI SDK tools map — there is no assistant-ui/AI SDK feature
  for permission-gated tool exposure. This is the multi-tenant boundary; it cannot be "vanilla".
- **Timeouts/limits.** Our route enforces heartbeats, a 60s stream timeout, 40-message/64KB input
  caps. `streamText` gives `abortSignal` but the caps are ours to re-add.
- **Version churn.** assistant-ui documents AI SDK v6 while upstream latest is v7; the new toolkit
  compiler (`@assistant-ui/vite` 0.0.8) is weeks old and its docs partly assume TanStack
  Start/Next.js server integration, while `pkg/web` is a plain Vite SPA with a separate Fastify
  API — the `"use generative"` client/server auto-split does not map onto our deployment shape.
  Prefer the plain AI SDK v6 route + explicit server tools; treat toolkits as future adoption.
  (Assessment, not a doc claim.)
- **Model coupling.** Today's OpenAI Agents SDK usage (reasoning-effort setting, Responses API
  usage details incl. cached/reasoning tokens) maps to `@ai-sdk/openai` provider options; verify
  reasoning-effort + cached-token reporting parity in the spike.
