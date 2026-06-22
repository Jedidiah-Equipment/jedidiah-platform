---
name: audit-ai-prompts
description: Audit and maintain Jedidiah Platform AI prompt and tool guidance for drift. Use when asked to review or validate assistant prompts, AI tool descriptions, retrieval playbooks, AI result projections, or prompt alignment with pkg/core, pkg/schema, pkg/domain, and CONTEXT.md; especially before or after changes under pkg/api/src/routes/ai.
---

# Audit AI Prompts

## Overview

Audit the code-owned Jedidiah assistant guidance against the current repo truth. Do not rely on frozen checklists as truth; derive the expected prompt, tool, schema, domain, and service surface from the codebase each time.

This skill is also responsible for keeping itself useful. If repo structure or AI ownership changes, update this `SKILL.md` as part of the audit instead of letting the skill become another stale artifact.

## Source Of Truth

Read these first:

- root `AGENTS.md`
- closest package `AGENTS.md` files for touched packages
- targeted `CONTEXT.md` sections
- `docs/adr/0004-application-boundaries.md`

Then derive current AI truth from source files, not from this skill:

- Find prompt builders with `rg -n "createSystemPrompt|system prompt|Domain Context|Retrieval playbooks" pkg/api/src`.
- Find registered tools from `AI_TOOL_REGISTRY` / `AI_TOOL_NAMES` in `pkg/api/src/routes/ai/ai-tool-registry.ts`.
- Find tool contracts from `pkg/api/src/routes/ai/tools/*.ts`.
- Find structured descriptors from `pkg/api/src/routes/ai/ai-tool-registry.ts`; `pkg/api/src/routes/ai/ai-tool-descriptors.ts` may only re-export registry-owned descriptors.
- Find playbooks and relationships from `pkg/api/src/routes/ai/ai-domain-guidance.ts`.
- Find assistant-facing projections from `projectAiToolResult` and the registry `projectResult` entries in `pkg/api/src/routes/ai/ai-tool-registry.ts`.
- Find public contracts from relevant `pkg/schema/src/**` files imported by the AI tools.
- Find behavior and query capabilities from relevant `pkg/core/src/**` services called by the AI tools.
- Find domain terminology and policies from relevant `pkg/domain/src/**` files.

## Audit Workflow

1. Build the current AI inventory.
   - List every registered tool in `AI_TOOL_NAMES`.
   - List every AI tool file and its `name`, `inputSchema`, `requiredPermission`, handler service call, and description source.
   - List every prompt-bearing file under `pkg/api/src/routes/ai`.
   - List every playbook and the tool names it references.
   - List every projection case and which tool results it handles.

2. Check tool coverage.
   - Every registered tool should have a real tool file.
   - Every registered tool should have a structured descriptor if descriptors are the current pattern.
   - Every registered tool with linkable business results should be considered by result projection logic.
   - Every playbook should reference registered tool names only.
   - If descriptors generate tool descriptions, tool files should not also declare dead description text.
   - Tool descriptions must describe only supported input fields, filters, sorting, search behavior, permissions, and result identifiers.

3. Check domain alignment.
   - Compare prompt terms against `CONTEXT.md` language.
   - Treat naming guards in `CONTEXT.md` as drift detectors, not as a fixed list copied into this skill.
   - Verify relationship guidance matches current domain rules, especially Customer -> Quote -> Job, Quote conversion, Job/Bay schedule language, and UUID/public-code boundaries.
   - If the prompt mentions a workflow, field, entity, or rule, verify the matching source in `pkg/schema`, `pkg/core`, or `pkg/domain`.

4. Check legacy and invented concepts.
   - Search prompt-bearing files for terms explicitly discouraged by `CONTEXT.md`.
   - Search for language that implies unsupported direct relationships, such as Customer -> Job.
   - Search for names or capabilities that sound plausible but do not exist in schemas, core services, permissions, or routes.

5. Check link and identifier safety.
   - Prose should prefer public labels: Job Code, Quote Code, Customer company name, Product name, or User name/email.
   - UUIDs may appear in hrefs, tool inputs, or debug/prototype logs, but prompt guidance should not encourage showing UUIDs in normal assistant prose.
   - Markdown links should come from shared tool result link metadata or code-owned route metadata, not arbitrary text rewriting.
   - Entity href and label patterns should have one source consumed by descriptors, playbooks, and projections.

6. Maintain this skill.
   - If new AI files, new prompt ownership, or new tool registration patterns appear, update this skill's discovery commands and workflow.
   - If a check would require a brittle hardcoded list, prefer instructions for deriving that list from source.
   - Do not add a deterministic script unless the script derives its expectations from current source files and remains intentionally shallow.

## Reporting

Lead with actionable findings, ordered by severity. For each finding include:

- the prompt/tool file and line,
- the source-of-truth file and line,
- the mismatch,
- the smallest safe fix.

If there are no findings, say so and mention what surfaces were checked.

## Fixing

When asked to fix drift:

- Keep Jedidiah-specific AI guidance in `pkg/api/src/routes/ai`.
- Keep shared schemas lightweight and framework-independent.
- Do not scrape `CONTEXT.md` into runtime prompts.
- Do not create aggregate tools unless existing resource-oriented composition is demonstrably insufficient.
- Add focused tests for externally observable behavior: generated descriptions, playbook/tool-name coverage, prompt fragments, and projection behavior.

## Validation

After fixes, run focused checks first:

```bash
pnpm --filter @pkg/api exec vitest run src/routes/ai/ai-tools.test.ts src/routes/ai/ai-domain-guidance.test.ts src/routes/ai/ai-prompts.test.ts src/routes/ai/ai-tool-registry.test.ts
pnpm typecheck
pnpm lint
```

Run full `pnpm test` when the local test database and unrelated package tests are healthy.
