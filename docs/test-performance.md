# Test memory and database load

Measurements for [issue #1648](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/1648),
3 October 2026. The retained configuration caps each Vitest runner at four workers, retains Turbo
concurrency two, isolates test Postgres on tmpfs, uses smaller test buffers/WAL limits, and defaults
fixture pools to two connections with one explicit four-connection contention fixture.

The final three uncached runs passed **594 source files / 4,749 tests** each. Median test-process RSS
fell **67.3%**, from **13.27 GiB to 4.34 GiB**. Median runtime rose **30.7%**, from **71.6 s to 93.6 s**.
Simultaneously sampled process-tree + Docker-VM RSS fell **55.1%**. Aggregate Postgres memory rose
**8.3%**, from **250.0 MiB to 270.6 MiB**: isolation buys durable development data, not a stand-alone
memory saving. VM RSS includes unrelated containers and cache; these figures are not total physical
host memory or a prediction for another machine.

## Environment and reproduction

- Baseline commit: `4052e720f649b890a1e58a374f325ee55d9259e5`; candidates change the settings below on that base.
- macOS arm64, 18 CPU cores, 48 GiB RAM; Node 24.15.0, pnpm 12.8.1.
- Docker Desktop: 18 CPUs and 7.75 GiB RAM. User-selected slot 2, project `jedidiah_slot2`.
- The installed package command binaries use Vitest 5.0.3 except `db`, `mobile`, and `seed`, whose existing binaries use 4.1.11. Installations stayed unchanged throughout all comparisons; the effective limits were checked through each actual binary.
- Prerequisite outputs were warmed with `pnpm build`. Every measured invocation uses `TURBO_FORCE=true CI=1 pnpm test`, sequentially, with `VITEST_MAX_WORKERS` unset and zero cached test tasks.
- Main tables use three completed runs per configuration, reporting median (minimum–maximum). Baseline attempts 1, 2 and 4 completed; attempt 3 failed as described below. Other main-table configurations passed all three attempts.
- The entire main comparison was repeated after the game closed and background Docker activity settled. Slot 1, AMS, and the default Jedidiah stack remained present with unchanged Docker resource limits. No dev listeners ran for this checkout. VM cache residency still varied between stages.

The same temporary sampler walks the command process tree with `ps -axo pid=,ppid=,rss=,comm=`
approximately every 250 ms. RSS sums can double-count shared pages. The Docker VM proxy is
`VirtualMachine.xpc`; the tree + VM column uses the maximum of their sum in each same-time sample.

`docker stats --no-stream` supplies memory/CPU samples about every two seconds, alongside
`pg_stat_activity`. The aggregate Postgres column sums both services in the same stats sample;
independent service peaks are never added. Client-backend samples exclude the monitor and include
fixture pools, clone/drop admin clients, separate race clients, and auth work. Brief peaks and lock
waits between samples can be missed. CPU can exceed 100% across cores. All retained runs had zero
sampler errors; each had roughly 250–350 process samples and 35–50 database samples.

Before/after SQL snapshots read `pg_stat_checkpointer.num_requested`, `num_timed`, `write_time`,
`sync_time`, and `pg_stat_wal.wal_bytes` / `wal_fpi`. Counters are service-wide and include background
work. A checkpoint crossing a sampling boundary can report its time separately from its count.

## Configuration steps

| Candidate | Runner configuration | Database configuration | Fixture pools |
| --- | --- | --- | --- |
| baseline | Original commands, no explicit Vitest cap; Turbo concurrency 2 | Shared, volume-backed Postgres 17; durability off, 200 connections, default buffers/WAL | 4 |
| workers + shared config | Four workers in root and eight package configs; five explicit shared-config consumers; Turbo concurrency 2 | Baseline database | 4 |
| isolated, default buffers | Worker candidate | Durable dev volume on 7205; test tmpfs on 7208, durability off; both default to 100 connections; test 128 MiB buffers, 80 MiB min WAL, 1 GiB max WAL | 4 |
| isolated, small buffers | Worker candidate | Isolation with test buffers 32 MiB, min WAL 32 MiB, max WAL 256 MiB | 4 |
| two-connection fixtures | Worker and small-buffer candidates | As above | Core/API/lander 2; one customer contention fixture 4; ordinary clients remain 10 |
| final | As above; four user-authorized smoke cases removed | As above | As above |

## Memory and runtime

| Candidate | Wall seconds | Test tree GiB | Docker VM GiB | Simultaneous tree + VM GiB | Simultaneous Postgres MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 71.6 (70.4–73.1) | 13.27 (12.61–14.73) | 4.54 (4.48–5.57) | 18.18 (17.11–18.41) | 250.0 (247.3–261.0) |
| workers + shared config | 99.3 (95.2–99.3) | 4.34 (4.16–4.36) | 4.35 (4.32–4.36) | 8.63 (8.52–8.70) | 190.1 (177.1–191.1) |
| isolated, default buffers | 96.5 (94.8–98.5) | 4.29 (4.28–4.36) | 4.44 (4.42–4.46) | 8.73 (8.72–8.77) | 375.5 (357.7–383.0) |
| isolated, small buffers | 89.6 (89.0–93.7) | 4.36 (4.23–4.46) | 4.47 (4.46–4.47) | 8.83 (8.69–8.92) | 280.8 (274.0–281.5) |
| two-connection fixtures | 91.3 (89.6–94.6) | 4.36 (4.34–4.39) | 3.80 (3.79–3.81) | 8.15 (8.13–8.20) | 266.9 (263.6–276.7) |
| final, four smoke cases pruned | 93.6 (87.9–94.6) | 4.34 (4.24–4.42) | 3.84 (3.83–3.84) | 8.17 (8.07–8.26) | 270.6 (256.3–285.5) |

| Candidate | Dev peak MiB | Test peak MiB (shared initially) | Dev peak CPU % | Test peak CPU % | Test peak client backends | Test peak lock waits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | shared | 250.0 (247.3–261.0) | shared | 799.2 (792.5–821.0) | 22 (21–23) | 1 (1–2) |
| workers + shared config | shared | 190.1 (177.1–191.1) | shared | 319.1 (304.9–373.2) | 14 (11–15) | 1 (1–2) |
| isolated, default buffers | 24.3 (23.6–30.9) | 353.6 (335.0–359.9) | 1.6 (1.5–1.7) | 328.1 (325.1–352.0) | 13 (12–14) | 1 (0–2) |
| isolated, small buffers | 23.8 (23.7–30.5) | 258.1 (250.6–258.7) | 1.6 (1.4–1.6) | 284.2 (278.0–348.7) | 18 (13–18) | 2 (1–3) |
| two-connection fixtures | 24.6 (24.0–31.2) | 242.9 (239.9–253.0) | 1.6 (1.5–2.0) | 299.1 (275.5–311.6) | 10 (9–10) | 0 (0–2) |
| final, four smoke cases pruned | 24.6 (24.5–28.7) | 247.7 (234.4–263.2) | 1.6 (1.6–1.9) | 323.6 (272.9–330.2) | 9 (8–9) | 2 (2–2) |

## Database work

The following counters belong to the shared test service initially and disposable test service after isolation.

| Candidate | Requested checkpoints | Timed checkpoints | Checkpoint write seconds | Checkpoint sync seconds | WAL GiB | WAL full-page images |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 1304 (1294–1316) | 0 (0–0) | 11.32 (11.27–11.46) | 1.31 (1.30–1.32) | 8.92 (8.91–8.93) | 2345760 (2345760–2345760) |
| workers + shared config | 1583 (1570–1594) | 0 (0–0) | 7.45 (7.27–7.52) | 1.58 (1.57–1.59) | 8.84 (8.84–8.89) | 2345760 (2345760–2345760) |
| isolated, default buffers | 1583 (1579–1585) | 0 (0–0) | 6.72 (6.62–6.79) | 1.58 (1.58–1.58) | 8.83 (8.83–9.59) | 2344140 (2326320–2344140) |
| isolated, small buffers | 1596 (1595–1596) | 0 (0–0) | 5.42 (5.36–5.50) | 1.60 (1.59–1.60) | 9.45 (9.45–9.58) | 2327940 (2326724–2327940) |
| two-connection fixtures | 1595 (1595–1599) | 0 (0–0) | 5.50 (5.45–5.53) | 1.59 (1.59–1.60) | 9.45 (9.45–9.54) | 2327940 (2327060–2327940) |
| final, four smoke cases pruned | 1597 (1596–1598) | 0 (0–0) | 5.37 (5.25–5.38) | 1.60 (1.60–1.60) | 8.87 (8.86–8.87) | 2344140 (2344140–2344140) |

Development received zero sampled test client backends in every isolated run. Its counter deltas are shown
separately; snapshot setup and background checkpoints may still produce activity.

| Candidate | Dev requested / timed checkpoints | Dev write / sync seconds | Dev WAL MiB / full-page images |
| --- | --- | --- | --- |
| isolated, default buffers | 0 (0–0) / 0 (0–1) | 0.00 (0.00–0.00) / 0.00 (0.00–0.00) | 0.00 (0.00–0.00) / 0 (0–0) |
| isolated, small buffers | 0 (0–0) / 0 (0–0) | 0.00 (0.00–0.00) / 0.00 (0.00–0.00) | 0.00 (0.00–0.00) / 0 (0–0) |
| two-connection fixtures | 0 (0–0) / 0 (0–1) | 0.00 (0.00–3.37) / 0.00 (0.00–0.00) | 0.00 (0.00–0.09) / 0 (0–18) |
| final, four smoke cases pruned | 0 (0–0) / 0 (0–1) | 0.00 (0.00–0.00) / 0.00 (0.00–0.00) | 0.00 (0.00–0.00) / 0 (0–0) |

Drops still request checkpoints. Service counters still record full-page images with ordinary full-page writes disabled;
these samples do not attribute them to individual operations. A lower checkpoint/FPI count is not a required outcome.

## Decisions and per-step deltas

- **Keep four workers and shared config selection.** Process RSS falls 67.3% in this stage (13.27 → 4.34 GiB), while runtime rises 38.7% (71.6 → 99.3 s). This stage also removes compiled duplicates; it is not a pure worker-count experiment. Existing pools, isolation, aliases, setup hooks, exclusions and timeouts are preserved. Actual package binaries resolve default 4 and `VITEST_MAX_WORKERS=2` to 2 from every package cwd.
- **Keep isolation for durable development data.** Default buffers raise simultaneous Postgres memory 97.5% (190.1 → 375.5 MiB) relative to the capped shared service. Test process RSS and runtime remain in similar ranges (4.34 → 4.29 GiB; 99.3 → 96.5 s). Development durability returns to PostgreSQL defaults; test restart cannot destroy app data.
- **Reject default test buffers; keep 32/32/256 MiB.** Aggregate Postgres memory drops 25.2% (375.5 → 280.8 MiB) and test-service memory drops from 353.6 to 258.1 MiB. Median runtime is 89.6 versus 96.5 s, with no additional full-suite failures or checkpoint-time penalty. This is a measured service-footprint benefit; test-tree RSS is essentially unchanged.
- **Keep two fixture connections with an explicit contention exception.** Sampled test backends fall from 13–18 to 9–10. Aggregate Postgres median falls 5.0% (280.8 → 266.9 MiB), with overlapping memory ranges; runtime shifts 89.6 → 91.3 s. This step is justified mainly by repeatable lower connection demand without starving real races, not a large extra RSS saving. VM residency shifts independently and is not attributed to pool sizing.
- **Keep default `max_connections=100`.** Sampled demand peaks at 18 after worker caps/isolation and 10 with smaller fixtures, including admin/race clients. Keep substantial headroom instead of imposing an unmeasured aggressive connection ceiling. Ordinary application client default remains 10.
- **Prune four smoke cases under the user's later instruction.** Final runtime is 93.6 s with RSS 4.34 GiB; pruning is maintenance cleanup, not a claimed speedup. All substantive races, auth behavior, theme contracts and business suites stay intact.

## File and test counts

The baseline executes 730 files / 6,060 tests. Three unconfigured packages also discover 134 compiled
`dist` copies with 1,307 duplicate executions. Every omitted compiled file was matched to a retained
`src` file with the same test count. Selecting the existing root config applies its `dist/**` exclusion.
Before intentional pruning, each candidate executes **596 source files / 4,753 tests**. The five
shared-config consumers are domain, schema, docs, changelog and seed. After pruning, every final run
executes **594 source files / 4,749 tests**; no test is newly skipped.

| Package | Baseline files / tests | Worker/isolation/pool candidates | Final files / tests |
| --- | ---: | ---: | ---: |
| ai | 22 / 67 | 22 / 67 | 22 / 67 |
| api | 60 / 751 | 60 / 751 | 60 / 751 |
| changelog | 16 / 100 | 8 / 50 | 8 / 50 |
| core | 81 / 1009 | 81 / 1009 | 81 / 1009 |
| db | 5 / 20 | 5 / 20 | 5 / 20 |
| docs | 5 / 24 | 5 / 24 | 5 / 24 |
| domain | 180 / 1908 | 90 / 954 | 90 / 954 |
| lander | 32 / 250 | 32 / 250 | 32 / 250 |
| mobile | 73 / 338 | 73 / 338 | 73 / 338 |
| pdf | 6 / 51 | 6 / 51 | 6 / 51 |
| schema | 72 / 606 | 36 / 303 | 36 / 303 |
| seed | 6 / 53 | 6 / 53 | 6 / 53 |
| web | 172 / 883 | 172 / 883 | 170 / 879 |

## Failures and discarded comparisons

The matched baseline's third attempt stopped after an existing Sonner timer accessed `window` after
teardown in `PurchaseOrderEditing.test.tsx`. Web's 172 files / 883 assertions had passed, but Vitest
reported an unhandled `ReferenceError: window is not defined`; Turbo cancelled unfinished API/mobile
tasks. That attempt took 66.7 s and is excluded from completed-run medians. A fourth baseline attempt
passed. The changed final configuration had no such failure in its three runs.

An earlier exploratory series used the same runtime/resources but a game started during the small-buffer
stage. Those timings are excluded from the main comparison. Baseline, workers and isolation each passed
three runs; small buffers passed three despite increased host load; the first two-pool attempt failed
mobile's existing 5 s `scheme-half-contract.test.ts` timeout at 486.0 s and cancelled unfinished tasks.
The theme contract is retained and its timeout unchanged. All configurations were remeasured after the
background load settled, rather than claiming savings from mismatched runs.

| Earlier exploratory candidate | Passed / attempted | Wall seconds | Test tree GiB | Simultaneous Postgres MiB |
| --- | ---: | ---: | ---: | ---: |
| baseline | 3/3 | 72.8 (72.2–76.9) | 14.18 (12.72–14.33) | 257.2 (245.6–265.6) |
| workers | 3/3 | 102.2 (97.1–102.5) | 4.35 (4.27–4.48) | 221.7 (210.5–225.5) |
| isolated-default-buffers | 3/3 | 94.6 (93.4–98.6) | 4.31 (4.31–4.34) | 385.8 (369.1–401.5) |
| isolated-small-buffers | 3/3 | 187.5 (94.7–299.1) | 4.33 (4.28–4.44) | 289.7 (263.0–294.7) |
| two-connection-fixtures | 0/1 | 486.0 (486.0–486.0) | 3.81 (3.81–3.81) | 272.3 (272.3–272.3) |

Negative-path tests deliberately log transient-loader, image-decoder and expected service errors;
these messages are not failed test verdicts. Counts above use Vitest summaries and process exit codes.

## Correctness and recovery evidence

- `node --test scripts/use-slot.test.mjs`: all 13 cases pass. Split-port assertions went red before implementation and green afterward, including generated env files and bootstrap exports, secret preservation, takeover/switching, and failure paths.
- Every package test command ran from its package cwd in the uncached suites. Effective limits were also resolved from each actual command binary: default 4, environment override 2. Mobile AsyncStorage alias and lander setup remain intact.
- Recovery passed on **slot 2** (dev 7205 / tests 7208) and **default ports** (5432 / 5433), using the README commands: restart only `postgres-test`, then `pnpm db:up:template`. The tmpfs template disappeared after restart and was rebuilt with all **168 migrations** and both Equipment/Contracting schemas.
- Each environment then passed all five selected suites (`ai`, `db`, `lander`, `core`, `api`): **200 files / 2,097 cases**. The real DB cleanup tests drained tracked leftovers, swept dead-process databases, preserved live-process databases, and handled concurrent sweeps. Global-setup failure handling also passed.
- The development marker survived restart, template rebuild, and DB suites. Development container ID/start time and user count stayed unchanged (slot 71; defaults 72). Only the temporary marker schema was removed afterward. Default checks temporarily hid the slot's gitignored env overrides and restored their exact bytes afterward.
- On both environments, `SHOW fsync`, `SHOW synchronous_commit`, and `SHOW full_page_writes` return `on` for dev and `off` for tests. Both show `max_connections=100`; tests show buffers/WAL `32MB` / `32MB` / `256MB`.
- Idempotent `pnpm db:migrate` targets development in both environments. Actual seed env loading resolves development port 7205 or 5432; slot takeover migrated both databases and seeded development. Snapshot seeding remains separate from template migration.
- Three final focused repetitions each passed the five core contention files (73 cases) and API customer router (31 cases). Existing gates, row locks, lock-wait observations, crossing merges and independent race clients remain unchanged. Only the holder/removal/observer/merge case explicitly allocates four fixture connections.
- `CI=1 TURBO_FORCE=true pnpm verify` passed lint, typecheck, build and all 594 files / 4,749 cases with no worker override, new skip, or increased timeout. The test phase reported 21 successful tasks and zero cached tasks. The pruned web package also passed its typecheck; no staff procedure changed.

## Pruning record

The issue originally requested retaining all current tests. The user subsequently explicitly authorized
removing flaky/heavy low-value tests. Scope: the branch's two changed test files plus a targeted audit of
DepartmentIcon, DashboardList, ProductTranslationsTabTrigger and JobQuoteCode. **35 kept / 4 pruned.**
No failing test was deleted to make a run green. Removed files used no dedicated external helpers.

| File / case | Verdict | Deciding rubric |
| --- | --- | --- |
| DepartmentIcon: renders an icon for every Department | Prune | Render smoke; TS already enforces the exhaustive switch |
| DepartmentIcon: uses the hammer as the canonical Fabrication icon | Prune | Prop echo; repeats the chosen icon's class |
| DashboardList: owns the shared divider and row spacing | Prune | Prop echo; repeats literal classes and markup |
| DashboardList: provides the shared fixed-height scroll region | Prune | Prop echo; repeats the implementation's height constant |
| Slot: requires one explicit slot from 1–9 before touching services or env files | Keep | Behavior |
| Slot: an unavailable Docker daemon leaves handwritten env and services alone | Keep | Behavior |
| Slot: copies a missing worktree snapshot from the primary checkout, including objects | Keep | Behavior |
| Slot: copies a empty worktree snapshot from the primary checkout, including objects | Keep | Behavior |
| Slot: keeps an existing local snapshot instead of copying the primary checkout | Keep | Behavior |
| Slot: a failed copy leaves the missing local snapshot retryable and services untouched | Keep | Behavior |
| Slot: a failed copy leaves the empty local snapshot retryable and services untouched | Keep | Behavior |
| Slot: a missing primary snapshot leaves services, volumes, and handwritten env alone | Keep | Behavior |
| Slot: takes over the named stack, preserves handwritten lines, and migrates both databases before seeding | Keep | Behavior |
| Slot: rerunning rebuilds the slot; switching replaces managed values without accumulating blocks | Keep | Behavior |
| Slot: bootstrap failures stop before later commands and never report readiness | Keep | Behavior |
| Slot: stops a previous holder’s listener and its supervisor before rebuilding Docker | Keep | Behavior |
| Slot: refuses to kill its own process group before changing Docker or env files | Keep | Behavior |
| Customer: changes only the named field and leaves the rest untouched | Keep | Behavior |
| Customer: clears a nullable field on an explicit null | Keep | Behavior |
| Customer: maps customer rows to customer DTOs | Keep | Logic |
| Customer: requires the merge to know every Customer reference and keeps them restrictive | Keep | Contract |
| Customer: fills empty survivor contact fields, preserves populated values, and audits both Customers | Keep | Behavior |
| Customer: keeps the MRB reassignment history, Owner and both Quotes locked after merge | Keep | Regression pin |
| Customer: moves every Quote status and counts only Units currently owned in preview and audit | Keep | Behavior |
| Customer: preserves the vacated survivor Quote lock when a Unit moves on to a third Customer | Keep | Behavior |
| Customer: still reverses an Allocation sale to Stock when its Customer was merged | Keep | Behavior |
| Customer: refuses self merges and missing Customers without changing the survivor | Keep | Behavior |
| Customer: serialises crossing merges with shared ownership history without deadlocking | Keep | Behavior |
| Customer: releases Quote locks while a Unit writer holds the Unit and then needs that Quote | Keep | Behavior |
| Customer: lets Customer removal fail its restrictive FK while a merge backs off | Keep | Behavior |
| Customer: waits for a Quote edit before merging and preserves the edit | Keep | Behavior |
| Customer: matches case and whitespace only and returns every matching Customer | Keep | Behavior |
| Customer: inline Quote creation requires an explicit choice and can reuse a matching Customer | Keep | Behavior |
| Customer: concurrent unacknowledged creates leave one Customer and offer the other caller its match | Keep | Behavior |
| Translation tab: shows the existing tab-attention dot when any Product translation field needs review | Keep | Behavior |
| Translation tab: does not show attention when every Product and Assembly field is fresh | Keep | Behavior |
| Job Quote code: links the Job Sheet Quote code back to the Quote form and closes the sheet | Keep | Behavior |
| Job Quote code: leaves a Stock Build without a Quote link | Keep | Behavior |
| Job Quote code: leaves the Quote code as text when the user cannot open Quotes | Keep | Behavior |

Staff-facing procedures are unchanged; existing `pkg/docs` pages and HELP_TOPICS remain accurate.
Temporary measurement/recovery scripts, logs, raw results and prompts are removed before publishing;
this is the one retained findings document.
