# ai (@pkg/ai)

- Own assistant orchestration, prompts, tool registration, and tool handlers.
- Keep HTTP transport, Fastify request parsing, env/config reads, and API-only delivery wiring in `@pkg/api`.
- Do not import Fastify, `@pkg/api`, API `@/` modules, `getApiConfig`, or direct `process.env` from `src`.
- Inject API-owned dependencies through `AiContext` instead of reaching back into API modules.
- Keep each AI tool under `src/tools/<entity>/<tool>.ts`: input/output schemas, core/tool mappers, permission alternatives, descriptor, and handler live together.
- Use the deletion test for tool colocation: if deleting the tool would make the code dead, keep it in the tool file; response contracts and mappers shared by multiple tools belong in an entity-level sibling module.
- Keep `src/ai-sdk-tools.ts` as a dumb ordered list plus tool factory only; do not add per-tool descriptor or projection logic there.

Canonical examples: `src/ai-chat.ts`, `src/context.ts`, `src/tools/products/find-products.ts`.
