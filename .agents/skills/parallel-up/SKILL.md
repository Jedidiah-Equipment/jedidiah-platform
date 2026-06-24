---
name: parallel-up
description: Run the Jedidiah Platform repo-local `pnpm parallel:up` slot setup command. Use when the user asks to bring up, initialize, configure, repair, or prepare an isolated local parallel slot environment for this repo.
---

# Parallel Up

## Overview

Use this skill to run the repo-owned parallel slot setup flow instead of hand-editing ports, env files, or Docker project names. The command is `pnpm parallel:up`, which assigns or reuses a Docker-backed slot, writes gitignored env files, starts the slot stack, refreshes the template database, migrates, and seeds.

## Workflow

1. Confirm the repo root and current state for context:
   ```bash
   git rev-parse --show-toplevel
   git status --short
   ```
2. Run the setup command from the repo root:
   ```bash
   pnpm parallel:up
   ```
   To request a specific slot, pass it after `--`:
   ```bash
   pnpm parallel:up -- 2
   ```
3. Report the assigned slot, configured ports, Docker project name, and whether setup, template refresh, migration, and seed succeeded. If any command fails, stop and report the failing command plus the relevant error output.

## Guardrails

- Do not manually create or edit `.env.dev`, package `.env.*`, or `pkg/mobile/.env.local` unless `pnpm parallel:up` fails and the user asks for repair.
- Do not patch tracked launch files for slot ports; the parallel slot flow is env-file driven.
- Preserve unrelated uncommitted changes. The setup command is expected to write gitignored environment files and local Docker state only.
- Do not run `pnpm db:up` as part of this skill. `pnpm db:up` drops Docker volumes for the configured environment; `pnpm parallel:up` already performs the intended slot bootstrap.
