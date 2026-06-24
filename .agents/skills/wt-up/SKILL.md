---
name: wt-up
description: Run the Jedidiah Platform repo-local `pnpm wt:up` worktree setup command. Use when the user asks to bring up, initialize, configure, or repair an isolated local worktree environment for this repo.
---

# WT Up

## Overview

Use this skill to run the repo-owned worktree setup flow instead of hand-editing ports, env files, or Docker project names. The command is `pnpm wt:up`, which delegates to `scripts/worktree-setup.sh`.

## Workflow

1. Confirm the current directory is inside the Jedidiah Platform checkout:
   ```bash
   pwd
   git rev-parse --show-toplevel
   ```
2. Check whether this is the primary checkout or a worktree:
   ```bash
   git worktree list
   git status --short
   ```
3. Run the setup command from the repo root:
   ```bash
   pnpm wt:up
   ```
4. Report the assigned slot and any follow-up command printed by the script.

## Guardrails

- Do not manually create or edit `.env.dev`, package `.env.*`, or `.claude/launch.json` unless `pnpm wt:up` fails and the user asks for repair.
- Do not run this from the primary checkout if the script refuses; create or move to a worktree under `~/_worktrees` first.
- Preserve unrelated uncommitted changes. The setup command is expected to write gitignored environment files and local workspace configuration only.
