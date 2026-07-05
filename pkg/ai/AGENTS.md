# ai (@pkg/ai)

- Own assistant orchestration, prompts, tool registration, tool handlers, and quote email body generation.
- Keep HTTP transport, Fastify request parsing, SSE serialization, env/config reads, and API-only delivery wiring in `@pkg/api`.
- Do not import Fastify, `@pkg/api`, API `@/` modules, `getApiConfig`, or direct `process.env` from `src`.
- Inject API-owned dependencies through `AiContext` (`log`, `deliverQuoteDraftEmail`) instead of reaching back into API modules.
- Keep each AI tool self-contained under `src/tools/<entity>/<tool>.ts`: schema, handler, permission, descriptor, and projector all live together.
- Use the deletion test for tool colocation: if deleting the tool would make the code dead, keep it in the tool file; shared entity metadata, playbooks, and domain kind facts stay central.
- Keep `src/tool-registry.ts` as a dumb ordered list plus derived maps only; do not add per-tool descriptor or projection logic there.
- Put quote-reader lookup tools (`list-quote-*`) under `src/tools/quotes/` because they exist for the quote flow and use `quote:read`.

Canonical examples: `src/chat-stream.ts`, `src/context.ts`, `src/tools/products/list-products.ts`.
