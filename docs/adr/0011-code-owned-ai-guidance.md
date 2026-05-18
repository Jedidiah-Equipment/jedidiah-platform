# Code-owned AI guidance, descriptors, and link projections

The assistant needs to answer business questions by understanding Jedidiah's domain relationships, such as **Customer → Quote → Job**, without creating one bespoke tool per possible question. Runtime AI guidance will therefore be owned as structured code in the AI API layer: tool descriptors generate OpenAI tool descriptions, domain relationships and retrieval playbooks generate system prompt guidance, and tool results may be projected into assistant-facing shapes with link metadata. `CONTEXT.md` remains a human glossary, not a runtime prompt source.

## Considered Options

- **One tool per question shape.** Rejected: this would create a growing tool surface that mirrors phrasing instead of business resources.
- **Free-form hand-written prompts and tool descriptions.** Rejected: unstructured prose is easy to drift away from schemas, permissions, and service behavior.
- **Generate prompts from database or schema structure alone.** Rejected: table relationships and Zod schemas do not capture business meaning, retrieval order, disambiguation policy, or safe linking rules.
- **Structured AI metadata in the API layer.** Accepted: it keeps model guidance close to tool dispatch, permissions, OpenAI conversion, and route-aware link projections while leaving shared schemas and domain docs clean.

## Consequences

- Existing AI tools should remain resource-oriented and composable; aggregate tools should be added only when composition proves expensive or risky.
- Tool descriptions should be generated from structured, reviewable metadata while tool parameters continue to come from the real input schemas.
- Cross-entity questions should be guided by retrieval playbooks, such as finding a Customer by company name, then Quotes for that Customer, then linked Jobs when the user asks about Job progress.
- Deep links in assistant responses should be Markdown links built only from link metadata returned by tools or code-owned route metadata. UUIDs may appear inside `href`s, but conversational text should use public labels such as Job Code, Quote Code, Customer company name, or Product name.
- Link metadata belongs in AI adapter projections, not base domain schemas or core service results.
