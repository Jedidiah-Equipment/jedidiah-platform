# ai (@pkg/ai)

- Own assistant orchestration, prompts, tool registration, tool handlers, and quote email body generation.
- Keep HTTP transport, Fastify request parsing, SSE serialization, env/config reads, and API-only delivery wiring in `@pkg/api`.
- Do not import Fastify, `@pkg/api`, API `@/` modules, `getApiConfig`, or direct `process.env` from `src`.
- Inject API-owned dependencies through `AiContext` (`log`, `deliverQuoteDraftEmail`) instead of reaching back into API modules.
- Keep each v2 AI tool under `src/v2/tools/<entity>/<tool>.ts`: input/output schemas, core/tool mappers, permission alternatives, descriptor, and handler live together.
- Use the deletion test for tool colocation: if deleting the tool would make the code dead, keep it in the tool file; response contracts and mappers shared by multiple tools belong in an entity-level sibling module.
- Keep `src/tool-registry.ts` and `src/v2/ai-sdk-tools.ts` as dumb ordered lists plus derived maps only; do not add per-tool descriptor or projection logic there.
- Put quote-reader lookup tools (`list-quote-*`) under `src/tools/quotes/` because they exist for the quote flow and use `quote:read`.

Canonical v2 examples: `src/v2/ai-chat.ts`, `src/v2/context.ts`, `src/v2/tools/products/find-products.ts`.
