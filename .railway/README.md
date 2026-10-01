# Railway configuration

The whole project is defined in [railway.ts](railway.ts), using the same `railway/iac` pattern as AMS.
The SDK is a pinned root dev dependency; install it with `pnpm install`.

The file selects settings from the linked environment:

| Setting | staging | production |
| --- | --- | --- |
| GitHub branch | `main` | `production` |
| Services | api, web, lander, reset-db, Postgres | api, web, lander, docs, Postgres |
| Postgres volume | 500 MB | 5000 MB |
| Idle sleep | api, web, lander, reset-db | docs |

Resource names, custom domains, private endpoints, storage, and staging API limits were imported from
Railway. Variable values stay in Railway: `preserve()` retains them, and naming an absent variable does
not create a value. Keep existing variable names until intentionally removing them; omitting a variable
or resource from this whole-project definition deletes it when applied.

## Preview and apply

Link this checkout to the environment you intend to manage, then review its plan:

```sh
railway link --project 'Jedidiah Equipment' --environment staging
railway config plan
railway config apply
```

Repeat with `--environment production` to manage production. Planning is read-only; applying changes
the selected environment. Railway evaluates this file through the CLI, not during an application deploy,
so pushing a config edit alone does not apply it. `pnpm verify` includes its TypeScript check.

If Railway reports that a service is still managed by Config as Code, clear that service's **Railway
Config File** setting before applying. The old paths were `/railway.api.json`, `/railway.web.json`,
`/railway.lander.json`, `/railway.docs.json`, and `/railway.reset-db.json`. Their build commands, start
commands, migration hook, healthchecks, and restart policies now live here. The CLI's migration scanner
only discovers files named `railway.json` or `railway.toml`, so it does not discover those custom paths.

## Manual staging reset

`reset-db` uses a watch path that does not exist so pushes never trigger it, and it never restarts
automatically. A manual source redeploy still runs:

```sh
railway link --project 'Jedidiah Equipment' --environment staging
railway redeploy --service reset-db --from-source
```

The existing reset command requires `APP_ENV=staging`, `CONFIRM_DB_RESET=staging`, and distinct
`STAGING_DATABASE_URL` and `PRODUCTION_DATABASE_URL` values set in Railway. It destroys staging data,
replays migrations, and creates demo users. The production URL is required only for its target guard.
