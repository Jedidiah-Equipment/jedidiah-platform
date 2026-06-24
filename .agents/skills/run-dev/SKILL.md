---
name: run-dev
description: Run the Jedidiah Platform repo-local `pnpm dev` development server command. Use when the user asks to start, run, or bring up the local dev server for the current checkout or parallel slot.
---

# Run Dev

## Overview

Use this skill to start the current checkout's dev processes with the repo command `pnpm dev`.

## Workflow

1. Run the dev command from the repo root:
   ```bash
   pnpm dev
   ```
2. Keep the command running until the user asks to stop, or until it exits on its own.
3. Report the local URLs printed by the dev server. For parallel slots, these usually come from generated ignored env files.

## Guardrails

- Do not run database bootstrap commands here. Use `parallel-up` when the user needs an isolated slot prepared.
- Preserve unrelated uncommitted changes. This skill starts processes; it does not edit source files.
- When the user asks to stop, send Ctrl-C to the running command and confirm it exited.
