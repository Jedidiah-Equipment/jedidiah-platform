# AI Architecture Options

Last researched: 2026-05-12

## Purpose

This document explores how to add AI capabilities to the Jedidiah platform without fighting the
current stack. It focuses on architecture and technology choices, not on detailed product-domain
entities.

The target capabilities are:

- A user-facing chat input where users can ask questions such as "Tell me about product abc" or
  "What new products were created today?"
- AI-assisted actions, such as drafting or sending a summary email.
- Scheduled AI actions, such as "email user abc a summary of today's events every weekday at 5pm."
- A path toward external AI integrations, if useful, without prematurely making MCP the center of
  the application.

## Current Stack Fit

The existing stack is a strong fit for AI features because it already has typed boundaries:

- Web: React 19, Vite, TanStack Router, TanStack Query, tRPC React Query, shadcn/ui, Tailwind.
- API: Fastify, tRPC, Better Auth, Zod, TypeScript.
- Domain: `@pkg/core` for business logic, `@pkg/schema` for shared Zod schemas, `@pkg/db` for
  Drizzle/Postgres.
- Hosting direction: Railway, with separate web, API, and Postgres services.

The AI architecture should preserve those boundaries:

- Keep user-facing app APIs in tRPC where request/response behavior is normal CRUD, state
  management, approvals, history, configuration, and job controls.
- Add a dedicated streaming endpoint for live assistant responses when token-level streaming is
  needed.
- Put domain actions behind explicit, typed tools that reuse existing `@pkg/core` services and
  `ctx.db`.
- Persist AI state in Postgres so chat, tool calls, approvals, scheduled work, and audits are
  inspectable.

## Recommended Direction

Start with a product-owned AI layer inside `@pkg/api`, not a separate AI microservice.

Recommended first slice:

1. Add an `ai` module to `@pkg/api`.
2. Add shared AI schemas to `@pkg/schema`.
3. Add pure AI orchestration helpers to `@pkg/core` only when they are framework-independent.
4. Add Postgres tables for conversations, messages, tool calls, approvals, and later scheduled
   actions.
5. Use a dedicated authenticated streaming HTTP endpoint for active chat.
6. Use tRPC for chat metadata, saved conversations, approvals, schedule management, and non-streaming
   commands.
7. Use code-defined tools that call existing domain services. Do not expose raw database access to
   the model.
8. Do not build MCP first. Add MCP later as an adapter if external AI clients need to call Jedidiah
   capabilities.

The guiding principle: the model can propose and call typed tools, but the application owns auth,
authorization, validation, side effects, persistence, and auditability.

## Proposed Package Layout

```txt
pkg/api/src/routes/ai/
  ai.router.ts              tRPC procedures for conversations, approvals, schedules
  ai-stream.route.ts        Fastify streaming endpoint for live chat
  ai-tools.ts               API-bound tool registry, using ctx/session/db
  ai-agent.ts               provider/framework adapter
  ai-policy.ts              permission, safety, and approval rules

pkg/core/src/ai/
  prompt-contracts.ts       reusable system/developer prompt fragments if framework-free
  tool-results.ts           pure formatting/normalization helpers

pkg/schema/src/ai/
  conversation.ts           Zod schemas for messages, tool calls, approvals, schedule requests

pkg/db/src/schema/
  ai.ts                     conversations, messages, tool calls, approvals, schedules, audits
```

Keep routers thin. The API module should validate input, build an authenticated AI context, call the
AI orchestration layer, and persist results. Product queries and actions should still live in product
services rather than inside prompts.

## Chat And Streaming Architecture

### Option A: Dedicated Streaming Endpoint Plus tRPC Control Plane

This is the recommended option.

Flow:

```txt
React assistant UI
  -> POST /api/ai/chat-stream
  -> Fastify route authenticates Better Auth session
  -> AI runner streams model/tool events
  -> API persists messages and tool calls
  -> browser renders streamed assistant response

React app
  -> tRPC ai.* procedures
  -> list conversations, load history, rename/delete, approve actions, manage schedules
```

Why it fits:

- AI chat wants a long-lived streaming HTTP response, which is awkward to force into normal
  request/response CRUD.
- tRPC remains the typed app API for state and controls.
- The web app can use a mature chat hook or a small custom streaming client.
- This avoids changing the existing tRPC client link for normal app traffic.

Implementation choices:

- Use Vercel AI SDK UI's `useChat` with `DefaultChatTransport` for the React chat surface, or write a
  thin custom fetch-stream hook if the server framework integration becomes awkward.
- Use `streamText` or provider-native streaming on the API side.
- Return a UI-message stream, SSE stream, or newline-delimited event stream. Pick one protocol and
  document it.
- Persist final assistant content and tool events after the stream completes; also persist partial
  state on aborts where practical.

### Option B: tRPC Streaming And Subscriptions

tRPC 11 supports streamed batch responses through `httpBatchStreamLink`, async iterables, and
subscriptions over SSE or WebSockets.

This is attractive for typed app events:

- Job progress.
- Schedule run status.
- Notifications.
- Long-running non-token operations.

It is less attractive as the primary chat token stream because the AI frontend ecosystem has
standardized around fetch/SSE style chat streams. If we use tRPC here, we will likely build more
custom UI plumbing.

Use tRPC subscriptions later for "AI job finished", "approval needed", and "schedule run updated"
events.

### Option C: WebSocket Or Realtime API

Use this later for voice, live multimodal sessions, or low-latency collaborative workflows. It is
not needed for the first text assistant. Starting with HTTP streaming keeps deployment simpler on
Railway and keeps the browser/API surface easier to debug.

## AI Tools And How They Map To The API Layer

Treat each AI capability as a typed application tool:

```txt
Model intent
  -> validated tool call
  -> API tool handler
  -> existing domain service / database query
  -> normalized tool result
  -> model response
  -> persisted audit entry
```

Example read-only tools:

- `findProduct`: search by product name, SKU, or ID.
- `getProductSummary`: summarize a single product from trusted product data.
- `listProductsCreatedSince`: answer "new products today" using an explicit date range.
- `getRecentActivitySummary`: summarize events once an activity/event model exists.

Example action tools:

- `draftEmailSummary`: creates a proposed email body but does not send.
- `requestEmailApproval`: records the proposed side effect for user approval.
- `sendApprovedEmail`: sends only an already-approved draft.
- `createScheduledSummary`: creates or updates a scheduled job record.

Tool design rules:

- Tool inputs and outputs are Zod schemas first; convert to provider-specific JSON Schema where
  needed.
- Tool descriptions should be clear, short, and boring. They are part of the product contract.
- Mutating tools require an approval policy by default.
- The model should never receive unrestricted database credentials or SQL execution.
- Tool handlers receive the same auth/session context as tRPC procedures.
- Tool results should include stable IDs and concise summaries, not entire tables.
- All tool calls should be logged with user ID, conversation ID, tool name, arguments, result
  summary, provider response ID, token/cost metadata where available, and approval status.

## Do We Need MCP?

Not for the first in-app assistant.

MCP is an open protocol for connecting AI applications to external data sources, tools, and
workflows. It is valuable when multiple AI clients need the same tool surface, or when the app wants
to consume tools from external providers.

For Jedidiah, MCP should be an adapter, not the core internal architecture.

### When MCP Is Useful

Add MCP when:

- ChatGPT, Claude, Cursor, or another external AI client should be able to query Jedidiah data.
- We want one tool implementation shared across multiple AI runtimes.
- We want to connect to official external MCP servers, such as payments, docs, support, or storage.
- We need a standardized integration boundary for partners or internal automation tools.

### When MCP Is Not Worth It

Skip MCP when:

- The only client is the Jedidiah web app.
- Tools are app-internal and already live naturally behind tRPC/core services.
- Auth, authorization, approval UI, and audit records are still evolving.
- We would simply wrap our own API with MCP and then call it from our own API again.

### Recommended MCP Mapping

If we add MCP later:

```txt
External AI client
  -> /mcp
  -> MCP server adapter in @pkg/api
  -> same AI tool registry / service layer
  -> @pkg/core / @pkg/db
```

The MCP server should not bypass tRPC-era validation or authorization. It should reuse the same
tool handlers and policy layer used by the in-app assistant.

For remote third-party MCP servers, only use trusted official servers, require explicit approval for
sensitive calls, and log what data leaves the system.

## Scheduled AI Actions

Scheduled actions need two layers:

1. Product intent and configuration in Jedidiah's database.
2. A reliable execution system that wakes up at the right time and runs the task.

Example flow:

```txt
User: "Email user abc a summary of today's events every weekday at 5pm"
  -> model extracts a proposed schedule
  -> API validates user, recipient, timezone, recurrence, and permission
  -> app shows confirmation UI
  -> on approval, persist ai_schedule row
  -> scheduler triggers run
  -> AI generates summary from allowed tools/data
  -> email is drafted or sent according to policy
  -> run record and audit trail are stored
```

Recommended MVP:

- Use AI to propose the schedule and content contract.
- Require explicit user confirmation before creating the schedule.
- Start with "draft email and notify me" before "send automatically."
- Store schedule owner, timezone, recurrence, recipient, prompt contract, tool scope, approval mode,
  last run, next run, and paused/deleted status.

Scheduler options:

| Option | Fit | Pros | Cons |
| --- | --- | --- | --- |
| Trigger.dev | Strong MVP fit | TypeScript-native, long-running tasks, retries, cron, dynamic per-user schedules, dashboard | Adds managed service or self-hosting footprint |
| Postgres-backed worker | Good lean option | Fewer moving parts, fits existing Railway/Postgres | Need to implement locking, retries, cron parsing, missed-run behavior |
| BullMQ + Redis | Strong queue option | Mature workers, repeatable jobs, concurrency controls | Adds Redis and worker operational surface |
| Provider background jobs | Good for single long model calls | Useful for async model execution | Not a full product scheduler or approval system |

Recommendation: start with a Postgres-backed schedule model and either Trigger.dev for execution or
a minimal API worker loop. If scheduled workflows become a serious product surface, Trigger.dev is a
good fit because it already handles dynamic schedules, retries, cancellation, and long-running tasks.

Note: email is mocked in the current API. A real email provider should be a separate explicit slice.

## Framework And Library Options

### Vercel AI SDK

Best fit for the first chat UI and provider abstraction.

Strengths:

- TypeScript-first.
- Works with React and Node.
- `useChat` handles streamed chat state well.
- `streamText` supports streaming, tools, structured data, and many providers.
- Useful if we want to evaluate OpenAI, Anthropic, Google, and others behind one application API.

Tradeoffs:

- Some examples assume Next.js route handlers. With Fastify, we may need a small adapter around
  streamed `Response` objects.
- Provider abstraction is useful, but provider-specific features still leak into serious agent
  workflows.

### OpenAI Responses API

Best fit when OpenAI is the primary provider and we want stateful, tool-using, multimodal,
reasoning-oriented workflows.

Strengths:

- Strong first-party support for reasoning models, tool calling, structured outputs, hosted tools,
  background mode, conversation state, and streaming.
- Current OpenAI guidance recommends the Responses API for reasoning, tool-calling, and multi-turn
  use cases.

Tradeoffs:

- More provider-specific.
- If we want first-class Anthropic/Gemini fallback, wrap it behind an internal provider interface or
  use AI SDK for the first layer.

### OpenAI Agents SDK

Best fit when workflows become multi-step agents with tool approvals, handoffs, traceability, and
resumable state.

Strengths:

- Code-first agent definitions.
- Streaming events include model output, tool calls, handoffs, and approval interruptions.
- Useful for workflows where the application owns orchestration and state.

Tradeoffs:

- More framework commitment than direct Responses API.
- For the first read-only assistant, it may be more machinery than we need.

### LangGraph.js

Best fit for explicit graph workflows with durable state, branching, human-in-the-loop, and
multi-agent orchestration.

Strengths:

- Good when the workflow is a real state machine.
- Useful for complex approvals and resumable multi-step workflows.

Tradeoffs:

- Heavier abstraction for a first assistant.
- More concepts for the team to own.

### Mastra

Best fit if we want a TypeScript agent framework with agents, workflows, memory, MCP, observability,
and a studio-style development experience.

Strengths:

- TypeScript-native.
- Broad provider support.
- Designed for embedding agents in products.

Tradeoffs:

- Adopting it would introduce a second app framework inside an already clean monorepo.
- Worth a spike, not an automatic first dependency.

### LlamaIndex

Best fit for retrieval-heavy systems and document/data indexing.

Strengths:

- Strong RAG concepts, indexing, retrieval, query engines, and evaluation tools.

Tradeoffs:

- Python-first center of gravity.
- Less natural for this Node/TypeScript app unless RAG becomes the dominant problem.

## Provider And Model Shortlist

Models move quickly, so pin explicit model IDs in code and review them regularly.

### Recommended Starting Provider

Use OpenAI as the first implementation target, with a small internal provider abstraction so we can
evaluate Anthropic and Google without rewriting the app.

Why:

- Strong support for tool-heavy and agentic workflows.
- Current docs position GPT-5.5 as the latest OpenAI model family for complex production workflows.
- The Responses API, structured outputs, background mode, and Agents SDK map well to the desired
  product capabilities.

Suggested OpenAI defaults to evaluate:

- `gpt-5.5`: high-quality agentic/chat workflows.
- `gpt-5.4-mini`: lower-cost chat, classification, extraction, and simple summaries.
- `gpt-5.5` with lower reasoning effort for latency-sensitive reads; higher effort for scheduled
  summaries or complex tool use.

### Secondary Providers To Evaluate

Anthropic:

- Claude Opus 4.7 for complex reasoning and agentic coding/workflows.
- Claude Sonnet 4.6 for a speed/intelligence balance.
- Claude Haiku 4.5 for faster lower-cost tasks.
- Strong candidate for comparison on conversational quality and long-context reasoning.

Google Gemini:

- Gemini 3.1 Pro Preview for advanced reasoning and agentic work.
- Gemini 3 Flash / 3.1 Flash-Lite or Gemini 2.5 Flash for cost/performance and latency-sensitive
  workloads.
- Strong candidate for multimodal, long context, Google ecosystem, and cost/performance comparison.

AWS Bedrock or Azure OpenAI:

- Consider when procurement, cloud consolidation, data residency, enterprise controls, or private
  networking matter more than direct provider ergonomics.

Vercel AI Gateway:

- Consider if we want one model gateway, usage controls, and easy provider switching. This is less
  necessary if we already own provider routing in `@pkg/api`.

## Data, Memory, And Retrieval

Do not start with vector RAG for product database questions.

For questions like "Tell me about product abc" or "What products were created today?", live typed
tools against Postgres are more reliable than embedding database rows and hoping retrieval finds the
right facts.

Use retrieval later for:

- Uploaded manuals, PDFs, support docs, historical notes, or long free-text content.
- Semantic search across activity logs or comments.
- Customer-specific knowledge bases.

If/when retrieval is needed:

- Prefer Postgres plus `pgvector` first if Railway/Postgres supports the operational path cleanly.
- Keep embeddings and source chunks tied to tenant/user authorization.
- Store source IDs and citations so the assistant can show where an answer came from.
- Add freshness rules so old indexed content does not override live database state.

## Security And Governance

AI features need product-level guardrails, not only model prompts.

Required controls:

- Authenticated AI calls only, unless a future public assistant is explicitly designed.
- Authorization checks inside every tool handler.
- Read-only tools first.
- Human approval for email, schedule creation, destructive changes, or external service calls.
- Audit log for prompts, tool calls, action approvals, schedule runs, and sent messages.
- Tenant/user scoping on every query.
- Rate limits and per-user/per-org cost budgets.
- Prompt injection defenses: treat tool outputs and external content as untrusted data.
- Data minimization: send only the records needed for the answer.
- Secret isolation: provider keys stay in API env, never in `/env.js`.
- Clear user-visible indicators when AI uses tools or proposes actions.

## Observability And Evals

Add evaluation early, before behavior becomes hard to reason about.

Recommended test/eval set:

- Product lookup by exact ID, SKU, partial name, and ambiguous name.
- "What new products were created today?" with controlled fixture dates.
- Ask for data the user should not access.
- Ask the assistant to send an email without approval.
- Ask the assistant to create a recurring schedule.
- Tool failure and retry behavior.
- Provider timeout and cancellation behavior.
- Prompt injection in product notes or external content.

Track:

- Provider/model.
- Latency to first token.
- Total latency.
- Tool call count.
- Token usage and estimated cost.
- Approval decisions.
- Error class.
- User feedback.

For normal code tests, keep router/procedure tests direct to the tRPC caller harness. For the
streaming route, test the Fastify route only when the transport itself is the behavior under test.

## Implementation Roadmap

### Phase 0: Spike

- Pick first provider path: AI SDK with OpenAI provider, or OpenAI Responses API directly.
- Build a tiny authenticated streaming route in `@pkg/api`.
- Build a hidden/internal assistant page or drawer in `@pkg/web`.
- Prove streaming works locally on Railway-like Node runtime assumptions.
- Prove a read-only `findProduct` tool can use the authenticated app context.

### Phase 1: Read-Only Assistant

- Add conversation/message persistence.
- Add read-only product tools.
- Add "created today" style date-range tooling.
- Show tool-use indicators in the UI.
- Add tRPC procedures for listing/loading conversations.
- Add focused tests for tool handlers and AI policy.

### Phase 2: Drafted Actions And Approval UI

- Add `draftEmailSummary`.
- Add approval records.
- Add UI for reviewing and approving/rejecting proposed actions.
- Keep actual email mocked until the real provider slice is approved.

### Phase 3: Scheduled Actions

- Add schedule schema and tables.
- Add schedule creation/update/pause/delete procedures.
- Add execution worker via Trigger.dev or a minimal Postgres-backed worker.
- Start with draft-only scheduled emails.
- Add run history and failure visibility.

### Phase 4: Provider Evaluation

- Run the same eval set against OpenAI, Anthropic, and Google.
- Compare answer quality, tool accuracy, latency, cost, streaming behavior, and operational fit.
- Keep the provider interface narrow enough to switch models without rewriting tool handlers.

### Phase 5: MCP Adapter

- Add `/mcp` only if external clients need Jedidiah tools.
- Reuse the same tool registry and policy layer.
- Require explicit OAuth/auth strategy and audit logging before exposing business data.

## Open Questions

- What is the first production AI user role: internal admin, sales, operations, or customer?
- Should AI answers be allowed to cite draft/unapproved records?
- Is "today" based on the user's timezone, company timezone, or server timezone?
- Should scheduled actions send automatically after a one-time setup approval, or always produce
  drafts for review?
- Which activity/event model should become the canonical source for "today's events"?
- How strict should data retention be for prompts and model outputs?

## Research Sources

- OpenAI latest model and Responses API guidance:
  https://developers.openai.com/api/docs/guides/latest-model
- OpenAI model comparison:
  https://developers.openai.com/api/docs/models
- OpenAI function calling and strict structured outputs:
  https://developers.openai.com/api/docs/guides/function-calling
- OpenAI MCP/connectors guidance:
  https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI Agents SDK:
  https://developers.openai.com/api/docs/guides/agents
- OpenAI Agents SDK streaming:
  https://openai.github.io/openai-agents-js/guides/streaming/
- Vercel AI SDK overview:
  https://ai-sdk.dev/docs/introduction
- Vercel AI SDK chatbot UI:
  https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
- Vercel AI SDK tool calling:
  https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- tRPC HTTP batch streaming:
  https://trpc.io/docs/client/links/httpBatchStreamLink
- tRPC subscriptions:
  https://trpc.io/docs/server/subscriptions
- Model Context Protocol introduction and specification:
  https://modelcontextprotocol.io/docs/getting-started/intro
  https://modelcontextprotocol.io/specification/2025-06-18
- Trigger.dev tasks and schedules:
  https://trigger.dev/docs/tasks/overview
  https://trigger.dev/docs/tasks/scheduled
- BullMQ repeatable jobs:
  https://docs.bullmq.io/guide/jobs/repeatable
- Anthropic Claude models, tools, and streaming:
  https://platform.claude.com/docs/en/about-claude/models/overview
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
  https://platform.claude.com/docs/en/build-with-claude/streaming
- Google Gemini models and function calling:
  https://ai.google.dev/gemini-api/docs/models
  https://ai.google.dev/gemini-api/docs/function-calling
- Amazon Bedrock Converse API:
  https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html
- Mastra:
  https://mastra.ai/docs
- LlamaIndex:
  https://developers.llamaindex.ai/python/framework/
