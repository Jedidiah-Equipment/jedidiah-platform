---
name: run-dev
description: Run the Jedidiah Platform repo-local `pnpm dev` development server command. Use when the user asks to start, run, or bring up the local dev server for the current checkout or worktree.
---

# Run Dev

## Overview

Use this skill to start the current checkout's dev processes with the repo command `pnpm dev`.

## Workflow

1. Run the dev command from the repo root:
   ```bash
   pnpm dev
   ```
4. Keep the command running until the user asks to stop, or until it exits on its own.
5. Report the local URLs printed by the dev server. For worktree slots, these usually come from `.env.dev`.

## Guardrails

- Do not run database bootstrap commands here. Use `wt-up` when the user needs the worktree environment prepared.
- Preserve unrelated uncommitted changes. This skill starts processes; it does not edit source files.
- When the user asks to stop, send Ctrl-C to the running command and confirm it exited.
