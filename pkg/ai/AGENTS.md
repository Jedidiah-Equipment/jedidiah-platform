# ai (@pkg/ai)

- Own assistant orchestration, prompts, tool registration, tool handlers, and quote email body generation.
- Keep HTTP transport, Fastify request parsing, SSE serialization, env/config reads, and API-only delivery wiring in `@pkg/api`.
- Do not import Fastify, `@pkg/api`, API `@/` modules, `getApiConfig`, or direct `process.env` from `src`.
- Inject API-owned dependencies through `AiContext` (`log`, `deliverQuoteDraftEmail`) instead of reaching back into API modules.

Canonical examples: `src/chat-stream.ts`, `src/context.ts`, `src/tools/send-draft-quote-email.ts`.
