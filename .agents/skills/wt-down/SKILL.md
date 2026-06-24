---
name: wt-down
description: Run the Jedidiah Platform repo-local `pnpm wt:down` teardown command. Use when the user asks to stop, tear down, remove, or clean up the Docker stack and volumes for the current local worktree.
---

# WT Down

## Overview

Use this skill to shut down the current checkout's Docker stack through the repo-owned teardown script. The command is `pnpm wt:down`, which uses `.env.dev` when present so a worktree tears down its own Compose project.

## Workflow

1. Confirm the current directory is the checkout the user wants to tear down:
   ```bash
   pwd
   git rev-parse --show-toplevel
   ```
2. Check the worktree and uncommitted state for context:
   ```bash
   git worktree list
   git status --short
   ```
3. Run the teardown command from the repo root:
   ```bash
   pnpm wt:down
   ```
4. Report whether Docker removed the stack successfully, including any failure output that needs follow-up.

## Guardrails

- Treat `pnpm wt:down` as destructive for local Docker volumes. If the user did not clearly ask to tear down or remove the worktree stack, confirm before running it.
- Do not substitute `docker compose down -v` by hand unless `pnpm wt:down` is unavailable; the repo command preserves the `.env.dev` worktree boundary.
- Preserve unrelated file changes. This skill manages local Docker resources, not repository source cleanup.
