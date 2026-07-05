---
name: create-retrieval-playbook-item
description: Add one Jedidiah Platform AI retrieval playbook item to the code-owned assistant guidance. Use when the user asks to create, add, update, or implement a retrieval playbook/playbook item for the Jedidiah assistant, especially cross-entity intents such as Customer/company → Quote → Job progress questions.
---

# Create Retrieval Playbook Item

## Overview

Add one retrieval playbook item to Jedidiah's AI guidance without redesigning the assistant. Keep the work code-owned, resource-oriented, and tested against the actual AI tool registry.

## Guardrails

- Read `docs/adr/0004-application-boundaries.md` before changing AI guidance.
- Search `CONTEXT.md` for relevant domain language, but do not scrape it into runtime prompts.
- Read `.sandcastle/CODING_STANDARDS.md` and `pkg/api/AGENTS.md` before code changes.
- Treat `docs/research` as non-authoritative unless the user explicitly asks.
- Keep runtime AI guidance under the AI API area. Do not move Jedidiah-specific prompt metadata into `@pkg/schema`.
- Keep tools resource-oriented. Do not create a bespoke tool for the playbook unless existing tool composition is demonstrably expensive or unsafe and the user agrees.
- Use registered tool names only. If a needed tool does not exist, surface that as the next required slice instead of inventing a playbook that cannot run.
- Keep UUIDs out of assistant-visible prose. Link labels should be public identifiers such as Job Code, Quote Code, Customer company name, Product name, or User name/email.
- Put link metadata in AI adapter projections, not core service results or base domain schemas.

## Workflow

1. Identify the user intent in domain terms.
   - Prefer names like `customer_job_progress`, `quote_job_conversion_status`, or `product_open_jobs`.
   - Avoid names based only on phrasing, such as `how_is_company_job_going`.

2. Inspect the existing AI guidance and tools.
   - Check the AI prompt/domain guidance module if it exists.
   - Check `pkg/ai/src/ai-tools.ts` for the registered tool names.
   - Check relevant tool descriptions and input schemas under `pkg/ai/src/tools/`.
   - Check schema-owned list/get inputs only to verify what each tool can actually search or filter.

3. Define the playbook as structured metadata.
   - Capture the user intent.
   - Capture when the playbook applies.
   - List traversal steps using registered tools.
   - Include disambiguation behavior.
   - Include expected linkable entities and public labels.
   - Include a short "ask the user" fallback when the result set is ambiguous.

4. Render the playbook into the system prompt through the existing prompt builder.
   - Keep generated prompt text concise and behavior-first.
   - Do not duplicate full tool descriptions in the system prompt.
   - Preserve the Markdown-only response rule.

5. Add focused tests.
   - Assert the playbook references registered tools.
   - Assert the generated prompt contains the intent and traversal guidance.
   - Assert disambiguation and link-label rules appear when they are part of the playbook contract.
   - Prefer direct tests of pure metadata/rendering helpers over route or browser tests.

6. Run focused verification first.
   - Use `pnpm --filter @pkg/api test` or the narrower package test command when available.
   - Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` when the change is ready and time allows.

## Playbook Shape

Adapt to the codebase's established types, but keep the concept close to this:

```ts
{
  intent: 'customer_job_progress',
  appliesWhen: 'The user asks about Job progress using a Customer or company name.',
  steps: [
    { tool: 'listCustomers', instruction: 'Find matching Customers by company name.' },
    { tool: 'listQuotes', instruction: 'Find Quotes for the matched Customer.' },
    { tool: 'getJob', instruction: 'Fetch each relevant linked Job before summarizing progress.' },
  ],
  disambiguation: [
    'If exactly one relevant active or paused Job exists, answer for that Job.',
    'If multiple active or paused Jobs exist, ask the user to choose and show linked Job Codes.',
    'If only complete or cancelled Jobs exist, say there are no currently active Jobs before summarizing history.',
    'If Quotes exist but none are linked to Jobs, say no Job has been created from those Quotes yet.',
  ],
  linkTargets: [
    { entity: 'Job', label: 'code', href: 'detailHref' },
    { entity: 'Quote', label: 'code', href: 'detailHref' },
  ],
}
```

## First Playbook Reference

For "How is the job for company ABC going?", encode the Customer/company → Quote → Job traversal:

- Find the Customer by company name.
- Find Quotes for that Customer.
- Prefer Quotes with linked `jobId`/Job Code.
- Fetch the relevant Job detail before summarizing progress.
- Mention Job status, relevant delivery dates, and visible Bay schedule/Slot progress when present.
- Ask the user to choose when multiple current Jobs match.
- Use Markdown links only from link metadata returned by tools or code-owned route metadata.

## Do Not

- Add `CONTEXT.md` entries for implementation terms like retrieval playbook or AI projection.
- Add browser tests unless the user asks for UI behavior.
- Add prompt snapshots that cover the full prompt wall.
- Teach the assistant fields the relevant schemas do not support.
- Add CI, deployment, production infrastructure, vector search, RAG ingestion, or document scraping.
