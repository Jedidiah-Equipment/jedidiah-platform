# Application Boundaries

Core, API, and web have separate responsibilities. `@pkg/core` owns domain behavior and feature-specific expected errors. The API maps those errors to transport status, public messages, and exposed `appCode`s. The web presents API messages for expected failures and shared fallback copy for unknown failures.

Runtime assistant guidance is code-owned in the AI API layer. Tool descriptors, relationship guidance, retrieval playbooks, and assistant-facing link projections should be structured code close to tool dispatch and route metadata. `CONTEXT.md` is a human glossary and must not be scraped wholesale into runtime prompts.

Top-level routed entities use a create-dialog/edit-autosave pattern. Creation happens in a list-owned dialog with the minimum fields needed to create a valid entity. Editing happens on the entity edit route with the full form, autosave, invalid/failed save feedback, and no positive success toast for ordinary autosaves. Nested child entities stay in-context unless a new decision changes that.

Page and UI composition should use shared primitives where they encode product conventions: card surfaces, scroll areas, data tables, access helpers, query invalidation, and schema/form bridges. Shared date and currency formatting come from `@pkg/domain`.

Dashboard Widgets are permission-gated registry entries on the single signed-in Dashboard. Dashboard Metrics are computed live from existing entity tables. Do not add reporting tables unless a concrete widget needs a purpose-built read model.
