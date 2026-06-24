---
name: parallel-down
description: Run the Jedidiah Platform repo-local `pnpm parallel:down` slot teardown command. Use when the user asks to stop, tear down, remove, or clean up the Docker stack, services, volumes, and generated env files for the current local parallel slot.
---

# Parallel Down

## Overview

Use this skill to shut down the current checkout's parallel slot through the repo-owned teardown script. The command is `pnpm parallel:down`, which stops this checkout's dev services, removes the configured slot's Docker stack and volumes, and strips generated env blocks while preserving hand-written local env values.

## Workflow

1. Confirm the repo root and current state for context:
   ```bash
   git rev-parse --show-toplevel
   git status --short
   ```
2. Run the teardown command from the repo root:
   ```bash
   pnpm parallel:down
   ```
3. Report whether dev services stopped, Docker removed the slot stack, and generated env blocks were cleaned. Include any failure output that needs follow-up.

## Guardrails

- Treat `pnpm parallel:down` as destructive for the current slot's Docker volumes and generated local env blocks.
- Do not substitute `docker compose down -v` by hand unless `pnpm parallel:down` is unavailable; the repo command preserves the slot boundary and cleans generated env blocks.
- Preserve unrelated source changes and hand-written ignored env values. This skill manages local Docker resources and generated env blocks, not repository source cleanup.
