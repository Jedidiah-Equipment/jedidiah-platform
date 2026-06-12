---
name: cut-context
description: Analyze, recommend, and execute aggressive reductions of repository agent-context files. Use when Codex needs to measure and trim AGENTS.md, CONTEXT.md, docs/adr, docs/agents, repo-local skills, README guidance, or stale code comments that cause too much context to be loaded.
---

# Cut Context

## Overview

Use this skill to perform the same flow as the Jedidiah context reset: measure context size, recommend a lean target shape, then execute a docs/comment-only compaction when the user asks.

Default stance: be aggressive about historical docs and stale guidance, but preserve current invariants that prevent implementation mistakes.

## Workflow

1. Measure first.
   - Run `python3 .agents/skills/cut-context/scripts/analyze_context_size.py <repo-root>`.
   - Run targeted searches for doc references and stale language, usually:
     - `rg -n "AGENTS.md|CONTEXT.md|docs/adr|ADR ?-?0*[0-9]+" . -g '!node_modules/**' -g '!docs/research/**'`
     - `rg -n "Stage|job-supervisor|deprecated term|supersedes|updated by|previously|changelog" <likely-docs>`
   - Check `git status --short` and preserve unrelated user changes.

2. Recommend the cut.
   - Report biggest files by words and estimated tokens.
   - Classify docs:
     - `AGENTS.md`: keep terse operating rules and package boundaries.
     - `CONTEXT.md`: keep current-state glossary/domain map, not implementation history.
     - ADRs: merge into a few current-state decision docs or delete if no longer fundamental.
     - README/repo-local skills/comments: update only where stale references would survive the reset.
   - If the user has not chosen a target, ask for `CONTEXT.md` size and ADR reset shape. If they ask to be aggressive or say execute, choose compact defaults and proceed.

3. Execute the reset.
   - Rewrite `CONTEXT.md` in present tense with core nouns, relationships, access, and system invariants.
   - Compact root and package `AGENTS.md` files; cut long copy lists and redundant examples.
   - Replace large ADR history with 3-6 compact current-state ADRs grouped by subsystem.
   - Remove old ADR-number references, changelog language, supersession notes, and retired terms.
   - Update README, repo-local skill instructions, code comments, and migration comments that reference deleted docs or stale concepts.
   - Keep runtime code behavior unchanged unless explicitly asked.

4. Verify.
   - Run stale-reference searches tailored to the repo. At minimum:
     - `rg "ADR-00|ADR 00|docs/adr/00" . -g '!node_modules/**' -g '!docs/research/**'`
     - `rg "updated by|supersedes|previously|historical|changelog" CONTEXT.md docs/adr AGENTS.md pkg/*/AGENTS.md docs/agents`
   - Run the analyzer again and compare to the target.
   - Run `git diff --check`.
   - Skip full test suites for docs/comment-only changes unless behavior code changed.

## Cutting Rules

- Keep security boundaries, permission rules, data ownership, validation ownership, storage boundaries, and hard domain invariants.
- Cut chronology, old plans, superseded decisions, detailed rejected options, and migration storytelling.
- Use current tense. Prefer "A Job is..." over "We changed Jobs to..."
- Keep comments only when they preserve non-obvious context. Replace old ADR-number comments with concept comments unless a compact ADR link is truly useful.
- Do not move domain glossary text into runtime prompts. Runtime AI guidance should stay code-owned and compact.

## Target Defaults

- `CONTEXT.md`: 800-1200 words for a substantial app; less for small repos.
- Root `AGENTS.md`: 20-40 lines.
- Package `AGENTS.md`: 5-25 lines each.
- ADRs: 3-6 files, roughly 300-600 words each.
- Final total for always-consulted guidance should be small enough that an agent can read the relevant slice without burning the turn.

## Final Report

Include:

- Files compacted, deleted, or replaced.
- Final counts for `CONTEXT.md`, `AGENTS.md`, ADRs, and docs-agent files.
- Stale-reference checks and results.
- Whether full tests were skipped because the change was docs/comment-only.
