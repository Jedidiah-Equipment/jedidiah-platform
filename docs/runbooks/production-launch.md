# Production Launch Runbook

Step-by-step guide to stand up the production environment and go live. Decisions were made
2026-07-07; tracking issue links back here.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Railway topology | Same project, new `production` environment duplicated from `staging` |
| Deploy flow | `production` branch; deploy = PR `main` → `production`, **merge commits only** (never squash/rebase — rewritten SHAs would permanently diverge the branches). Staging keeps deploying `main`. |
| Data | Copy everything except the quote/job clusters, Sue Smith demo user, and soft-deleted catalog/supplier rows plus children that depend on them. Quote/job code sequences start fresh. |
| Credentials | Staging password hashes are never copied (the reader already omits them). Production credential accounts get random unusable passwords; staff set real passwords via the forgot-password flow. Bay-operator shared accounts (`fabrication.operator@`, `assembly.operator@`) get passwords set manually by an admin via the Users page. |
| Domains | Web `app.jedidiahequipment.co.za`, API `api.jedidiahequipment.co.za`, lander apex `jedidiahequipment.co.za` + `www`. An old site currently holds the apex — that DNS move is the final cutover step. |
| Object storage | New Tigris bucket in the existing account; objects copied key-for-key (storage keys are bucket-relative, so no URL rewriting — image links do not break). |
| Landers | Keep **both** staging and production landers (ADR 0007 said drop staging — recreate that ADR). Lander image-cache Railway Volume is deferred. |
| Mobile | Production app trails the web launch. iOS: App Store **unlisted distribution**; Android: Play **closed testing** track. |
| Third parties | Separate everything: new PostHog project, new OpenAI key, production-scoped Resend key, freshly generated `AUTH_SECRET`. |
| reset-db | Removed from the production environment (code guard stays as second defense). |
| Safety nets | Production DB backups enabled + restore verified. Uptime/error monitoring deferred. |

---

## Phase 1 — Code changes (land on `main` before any Railway work)

### 1.1 Seed "promote" mode (`pkg/seed`)

Add a production-import path reusing the existing snapshot machinery
(`snapshot-tables.ts` ordering, object upload, sequence resets):

- [x] New script (e.g. `seed:promote`) that writes a snapshot into a **production** target
      (`DATABASE_URL` + `DOCUMENT_STORAGE_*`).
- [x] Excludes the quote/job clusters as a set: `quote`, `quote_line_items`,
      `quote_selected_assemblies`, `job`, `job_cfo_assembly`, `job_cfo_part`, `job_slot`.
      (`job.quote_id` is NOT NULL + unique, so they can only go together.) Bay
      infrastructure (`job_bay`, `job_bay_operator_assignment`, `product_bay`, calendars,
      `product_serial_sequence`) **is** copied.
- [x] Excludes the Sue Smith demo user (`seed-sue-user`, `sales@jedidiahequipment.co.za`)
      and her `account` / `user_department` rows. All other users copy, including the two
      bay-operator accounts.
- [x] Excludes soft-deleted `supplier`, `product_ranges`, `product_range_variants`, and
      `products` rows. Child rows copy only when their retained parent graph stays valid
      (`parts`, `product_bay`, `product_serial_sequence`, `product_assemblies`,
      `assembly_parts`, `assembly_overrides`).
- [x] Credential accounts are inserted with a **random per-account password hash** instead
      of `SEED_USER_PASSWORD` (`test123`). No one can log in until they reset.
- [x] Hard guard: refuses to run unless `CONFIRM_PRODUCTION_IMPORT=production` is set, and
      refuses if the target `DATABASE_URL` equals `STAGING_DATABASE_URL` is *not* the point —
      here the target **must not** be staging or local-template; mirror the existing
      `assertLocalDatabaseIsNotStaging` pattern in reverse.
- [x] Still resets `quote_code_seq` / `job_code_seq` behavior correctly: with no quote/job
      rows, sequences stay at their defaults (codes start at 1).

### 1.2 Railway config

- [x] `railway.lander.json`: add a `production` environment block (mirror staging; the
      lander never migrates — ADR 0007 invariant holds).

### 1.3 ADR 0007

- [x] Delete `docs/adr/0007-public-lander-direct-core-access.md` and recreate it: both a
      staging lander (staging DB/bucket, staging subdomain) and a production lander
      (production DB/bucket, apex) exist. Keep the read-only / no-migrations invariants and
      the deferred image-cache-volume note.

### 1.4 Staging mobile trusted origin

- [x] Verify staging's `AUTH_TRUSTED_ORIGINS` includes `jedidiahopsstaging://` (the staging
      mobile deep-link scheme). Keep local examples/tests covering both staging and production
      schemes.

Publish all of the above via the normal PR flow (`/blast-it`), merge to `main`.

---

## Phase 2 — Provision third parties

- [x] **Tigris**: create the production bucket in the existing account + a dedicated
      access key pair. Record bucket name, keys.
- [x] **PostHog**: create a new project "Jedidiah Production"; record project token (+ APIs
      key / project id if sourcemap upload is wanted for web).
- [x] **OpenAI**: create a production API key (separate cost attribution, independently
      revocable).
- [x] **Resend**: confirm `jedidiahequipment.co.za` is a verified sending domain; create a
      production-scoped API key. Password-reset email delivery is a **launch blocker** —
      no one can log in without it.
- [x] Generate a fresh `AUTH_SECRET`: `openssl rand -base64 48`.

---

## Phase 3 — Railway production environment

- [x] In the Railway dashboard, confirm which branch the **staging** environment deploys
      from (expected: `main`) — this mapping lives only in the dashboard.
- [x] **Duplicate the staging environment**, name it `production`. This clones services
      and variables; the Postgres service comes up new and empty.
- [x] **Delete the `reset-db` service** from the production environment.
- [ ] Enable **daily backups** on the production Postgres service.
- [x] Create the `production` git branch from current `main` and push it:
      `git push origin main:refs/heads/production`.
- [x] Point every production-environment service's deploy trigger at the `production`
      branch. Verify staging services still track `main`.
- [ ] GitHub: protect the `production` branch (require PR; disable squash/rebase for PRs
      targeting it if possible — merge commits only).

### Environment variables (production env, per service)

**api**

| Var | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | production Postgres (Railway internal URL) |
| `APP_BASE_URL` | `https://app.jedidiahequipment.co.za` |
| `API_BASE_URL` | `https://api.jedidiahequipment.co.za` |
| `AUTH_SECRET` | fresh (Phase 2) |
| `AUTH_TRUSTED_ORIGINS` | `https://app.jedidiahequipment.co.za,jedidiahops://` |
| `DOCUMENT_STORAGE_*` | production Tigris bucket/keys, endpoint `https://t3.storageapi.dev`, region `auto`, path-style per staging |
| `OPENAI_API_KEY` | production key |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | production key |
| `EMAIL_FROM` | `noreply@jedidiahequipment.co.za` (or current staging value) |
| `POSTHOG_PROJECT_TOKEN` | production project token (`POSTHOG_ENABLED` defaults true in production) |

**web**

| Var | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `APP_BASE_URL` | `https://app.jedidiahequipment.co.za` |
| `API_BASE_URL` | `https://api.jedidiahequipment.co.za` |
| `AUTH_BASE_URL` | `https://api.jedidiahequipment.co.za/api/auth` |
| PostHog client vars | production project values |

**lander**

| Var | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | production Postgres |
| `DOCUMENT_STORAGE_*` | production bucket (same as api) |
| `VITE_SITE_URL` | `https://jedidiahequipment.co.za` |
| `RESEND_API_KEY` | production key (contact form) |
| `CONTACT_EMAIL_FROM` / `CONTACT_EMAIL_TO` | confirm defaults |
| `VITE_POSTHOG_KEY` | production project token |

Diff every service's variables against staging afterwards — duplication copies staging
secrets; every secret above must be **overridden**, not inherited.

---

## Phase 4 — First deploy + internal verification

- [x] Open a PR `main` → `production`; merge with a **merge commit**. The api service's
      pre-deploy `pnpm db:migrate` runs all migrations against the empty production DB.
- [x] Verify `/health` on web, api, lander via their Railway-generated domains.
- [x] Add custom domains in Railway: `app.` (web), `api.` (api). Create the DNS CNAMEs.
      These are new subdomains — safe to do now, independent of the apex cutover.
- [ ] Add apex + `www` to the production lander in Railway but **do not** change apex DNS
      yet (old site still live).
- [ ] Give the staging lander its own staging subdomain (e.g.
      `staging-www.jedidiahequipment.co.za`) if it doesn't have one.

---

## Phase 5 — Data promote (one-time staging → production import)

- [x] Take a fresh staging snapshot: `pnpm --filter @pkg/seed seed:read` (staging creds
      from `pkg/seed/.env.dev`; downloads all referenced objects).
- [x] Add production targets to `pkg/seed/.env.dev` as `PRODUCTION_DATABASE_URL` and
      `PRODUCTION_DOCUMENT_STORAGE_*`. Use the Railway **public** Postgres URL from a
      workstation.
- [x] Run the promote import against production: `APP_ENV=production
      CONFIRM_PRODUCTION_IMPORT=production pnpm --filter @pkg/seed seed:promote`.
- [x] Verify: row counts for users/customers/suppliers/products/ranges/parts/assemblies/
      bays match staging (minus Sue Smith); `quote`/`job` empty; spot-check product images
      and range logos render via the api image routes; documents table is empty (expected —
      documents were never in the snapshot).

---

## Phase 6 — Accounts + smoke test

- [x] Do a forgot-password reset for your own account at
      `https://app.jedidiahequipment.co.za/forgot-password` — this proves Resend + auth
      end-to-end.
- [x] Admin sets passwords for the two bay-operator accounts via Users → edit (admin
      set-password).
- [x] Smoke test: log in, browse products/ranges (images load), create a throwaway quote →
      accept → job appears in Bay Queue → delete/void the test data.
- [x] Lander: browse product pages on the Railway domain (images stream), submit the
      contact form, confirm the email arrives.
- [ ] Trigger a restore-test of the production DB backup (restore to a scratch service,
      confirm tables, delete).

---

## Phase 7 — Go-live cutover

- [ ] Lower the apex DNS TTL a day ahead.
- [ ] Point apex + `www` at the production lander per Railway's DNS instructions
      (ALIAS/ANAME or apex-CNAME flattening depending on the DNS host). **Do not touch MX
      or other mail records** — `@jedidiahequipment.co.za` mailboxes must keep working.
- [ ] Verify the old site is gone, lander serves the apex, and email still flows
      (send/receive test).
- [ ] Notify staff: production is live at `app.jedidiahequipment.co.za`; first login is
      via "Forgot password" with their staging email address.
- [ ] Agree on a staging-freeze-for-data moment before Phase 5 so nothing entered in
      staging after the snapshot is silently lost (quotes/jobs excluded anyway; this is
      about catalog/customer edits).

**Rollback:** web/api/lander — redeploy the previous Railway deployment, or revert the
merge PR on `production`. Apex — repoint DNS at the old host (TTL still low).

---

## Phase 8 — Mobile (trails web launch)

- [ ] App Store Connect: create the production app record for
      `za.co.jedidiahequipment.ops`; add its `ascAppId` to the production submit profile in
      `pkg/mobile/eas.json`.
- [ ] Build both platforms: `eas build --profile production --platform all`
      (`APP_VARIANT=production` → yellow icon, scheme `jedidiahops`, API baked to
      `https://api.jedidiahequipment.co.za`).
- [ ] iOS: submit, then request **unlisted distribution** via the App Store Connect
      support form *before* release approval. Distribute the install link to staff.
- [ ] Android: submit to a **closed testing** track; add staff Google accounts / a testers
      group; share the opt-in link.
- [ ] Verify production deep-link auth: `AUTH_TRUSTED_ORIGINS` already includes
      `jedidiahops://`.
- [ ] OTA policy: JS-only changes ship with `eas update --channel production`; native
      changes require a new store build (fingerprint runtime policy gates OTA
      compatibility automatically). Both are manual, aligned with production web deploys
      when the API contract changed.

---

## Deferred (post-launch backlog)

- Railway Volume for the lander image cache (`LANDER_IMAGE_CACHE_DIR`).
- Uptime monitoring on `/health` endpoints; error alerting to Slack.
