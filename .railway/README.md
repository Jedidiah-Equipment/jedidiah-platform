# Railway configuration

The whole project is defined in [railway.ts](railway.ts), using the same `railway/iac` pattern as AMS.
The SDK and CLI are pinned root dev dependencies; install them with `pnpm install`.

The file selects settings from the linked environment:

| Setting | staging | production |
| --- | --- | --- |
| GitHub branch | `main` | `production` |
| Services | api, web, lander, Postgres | api, web, lander, docs, Postgres |
| Postgres volume | 500 MB | 5000 MB |
| Idle sleep | api, web, lander | docs |

Resource names, custom domains, private endpoints, storage, and staging API limits were imported from
Railway. Variable values stay in Railway: `preserve()` retains them, and naming an absent variable does
not create a value. Keep existing variable names until intentionally removing them; omitting a variable
or resource from this whole-project definition deletes it when applied.

## Preview and apply

Authenticate once with `pnpm exec railway login`, then preview and apply the desired environment:

```sh
pnpm railway:plan:staging
pnpm railway:apply:staging

pnpm railway:plan:production
pnpm railway:apply:production
```

Each command links this checkout to `Jedidiah Equipment` and the named environment before running.
Planning is read-only; applying previews changes and asks for confirmation before changing the selected
environment. Railway evaluates this file through the CLI, not during an application deploy,
so pushing a config edit alone does not apply it. `pnpm verify` includes its TypeScript check.

Before the first apply in each environment, clear every app service's legacy **Railway Config File**
setting. Ordinary `railway config apply` does not clear these paths, even when the plan succeeds. The
old paths were `/railway.api.json`, `/railway.web.json`, `/railway.lander.json`, `/railway.docs.json`, and
`/railway.reset-db.json`. Their build commands, start commands, migration hook, healthchecks, and restart
policies now live here. The CLI's migration scanner
only discovers files named `railway.json` or `railway.toml`, so it does not discover those custom paths.

## Staging data

Staging data is managed from the local checkout through the seed tools; it needs no Railway reset
service. To refresh staging from production, read the production snapshot, load it locally, then copy
the current local data and referenced document-store objects to staging:

```sh
pnpm --filter @pkg/seed seed:read:production
pnpm db:seed
APP_ENV=staging CONFIRM_STAGING_SEED=replace-staging pnpm db:seed:staging
```

This replaces staging data and gives imported credential users the seed password `test123`. Configure
complete `STAGING_*` and `PRODUCTION_*` targets in gitignored `pkg/seed/.env.dev`, as described in the
[root README](../README.md#commands). The writer checks that staging and production targets differ.
