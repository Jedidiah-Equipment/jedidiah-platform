# Railway Multi-Service Deploy Coordination

Date: 2026-07-14

**Question:** Our Railway services (api, web, lander) each build and deploy independently when the
`production` branch is fast-forwarded to `origin/main`. The api can go live while the web is still
building, so for a window the live api and live web run different commits. What platform-level
options does Railway offer to coordinate or align multi-service deployments?

All claims below trace to Railway first-party sources (docs.railway.com, railway.com/changelog,
the public GraphQL API verified by live introspection against
`https://backboard.railway.com/graphql/v2` on 2026-07-14). Location note: this repo keeps research
notes in `docs/notes/` (no `docs/research/` exists), so this file lives here.

## Answer / recommendation

Railway has **no native linked/atomic multi-service deploy** — every service deploys on its own
timeline, and nothing on the platform makes two services cut over together. Options ranked for this
repo (git-branch-triggered deploys from `production`, pnpm monorepo):

1. **Accept the skew and make it safe (recommended baseline, zero platform change).** The window
   is inherent even under orchestration (builds finish at different times; cutover is per-service).
   Keep the api backward compatible for one release with the previous web, and rely on the existing
   `healthcheckPath` + overlap settings for per-service zero-downtime. This is the only approach
   that eliminates user-visible breakage rather than shrinking the window.
2. **CI-orchestrated sequential deploys (best platform-level control).** Disable auto-deploy on
   the `production` branch trigger per service, and have a GitHub Actions job on `push` to
   `production` call the public GraphQL mutation
   `serviceInstanceDeployV2(serviceId, environmentId, commitSha)` for the api, poll
   `deployments`/`latestDeployment` until `SUCCESS`, then deploy web (and lander) at the same SHA.
   This gives deterministic ordering (api always live before the new web) and a known SHA on both
   sides, shrinking the skew window to exactly one build instead of a race. CLI alternative:
   `railway up` waits for `SUCCESS` and exits non-zero on failure, but it uploads the local
   directory rather than building from the GitHub-connected source, so the GraphQL mutation is the
   cleaner fit for branch-based deploys.
3. **Ordering-only tweak without CI:** keep auto-deploy for the api but disable it for web/lander,
   and let a GitHub Actions workflow triggered by Railway's `deployment_status: success` event for
   the api kick the web deploy via the same mutation. Less moving parts than full orchestration,
   same ordering guarantee.

Not viable as coordination gates: `preDeployCommand` (runs pre-start per service and could in
theory poll a sibling's `/health`, but it burns a build-queue slot while waiting, deadlocks if both
services gate on each other, and Railway documents it for tasks like migrations — we already use it
for `pnpm db:migrate` on the api); "Wait for CI" (aligns deploy *starts* after a workflow passes,
not deploy *finishes*).

## Detailed findings

### 1. No native deployment groups / linked / atomic deploys

- The deployments docs, config-as-code reference, and monorepo guide describe only per-service
  triggers, builds, and cutover; none document any grouping or linking of deploys across services.
  ([config-as-code](https://docs.railway.com/reference/config-as-code),
  [monorepo](https://docs.railway.com/guides/monorepo),
  [deployments reference](https://docs.railway.com/deployments/reference))
- The [changelog](https://railway.com/changelog) through 2026-07 has no entry for deployment
  groups, linked deploys, or atomic multi-service deploys. Recent deployment-related entries are
  orthogonal: "Higher Deploy Concurrency" (2025-06-06), "Sandboxes, Infrastructure as Code"
  (2026-06-05), multi-region replicas (2024-12-06).
- Targeted searches of railway.com for "deployment group" / "linked deploys" surface only the
  generic autodeploy and CLI pages.

**Conclusion: as of 2026-07-14, Railway has no deployment-group or atomic multi-service deploy
feature.**

### 2. Healthchecks and zero-downtime are per-service only

- Traffic cuts over to a new deployment only after the healthcheck endpoint returns HTTP 200
  within the timeout: "Only then will the new deployment be made active and the previous
  deployment inactive." Default timeout 300s, tunable via `healthcheckTimeout` /
  `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`. Railway does not monitor the endpoint after go-live.
  ([healthchecks](https://docs.railway.com/guides/healthchecks))
- Teardown of the old deploy is governed by `overlapSeconds` ("the previous deploy will overlap
  with the newest one") and `drainingSeconds` (SIGTERM→SIGKILL window), settable in config-as-code
  or via `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` / `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`.
  ([deployment teardown](https://docs.railway.com/deployments/deployment-teardown),
  [config-as-code](https://docs.railway.com/reference/config-as-code))
- The healthcheck gates *that service's* cutover only. In principle a web `/health` could return
  non-200 until the api reports the matching commit, delaying the web cutover — but nothing can
  hold the *api* back for the web, and Railway documents no cross-service condition. This only
  helps if the desired ordering is exactly "api first", which is cheaper to get via CI ordering.

### 3. `preDeployCommand` is not a coordination gate

- Runs "between building and deploying your application", in a separate container with the app's
  env vars and private-network access; volumes not mounted; non-zero exit fails the deployment
  with no retry; it occupies a build queue slot, so it "should complete in reasonable time".
  ([pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command))
- Because it runs before the new container starts and has private-network access, a wait-loop
  polling a sibling service is *possible*, but Railway gives no primitive to ask "what commit is
  the sibling on", there is no documented hard timeout to rely on, and mutual gating deadlocks.
  Documented use is migrations/setup tasks, which is how `railway.api.json` already uses it.

### 4. Public GraphQL API supports full CI orchestration

Endpoint `https://backboard.railway.com/graphql/v2`; auth via account/workspace token
(`Authorization: Bearer`) or project token (`Project-Access-Token`); rate limits 1k/h Hobby,
10k/h Pro. ([public API](https://docs.railway.com/reference/public-api))

Verified by live schema introspection (2026-07-14) plus the
[API cookbook](https://docs.railway.com/integrations/api/api-cookbook) and
[manage deployments](https://docs.railway.com/integrations/api/manage-deployments):

- `serviceInstanceDeployV2(serviceId: String, environmentId: String, commitSha: String)` —
  trigger a deploy of a **specific commit SHA** per service. (v1 `serviceInstanceDeploy` also
  takes `commitSha` / `latestCommit: Boolean`.)
- `serviceInstanceRedeploy(serviceId, environmentId)`, `deploymentRedeploy(id,
  usePreviousImageTag)`, `deploymentRollback(id)`, `deploymentCancel(id)`, `deploymentStop(id)`.
- `serviceInstanceAutoDeployUpdate(input: {projectId, serviceId, environmentId, enabled})` —
  toggle auto-deploy per service programmatically.
- `deploymentTriggerCreate/Update` — manage the GitHub branch trigger per service, including
  `branch`, `rootDirectory`, and `checkSuites: Boolean` (the "Wait for CI" flag).
- Status polling: `deployments(input: DeploymentListInput, first: N)` /
  `latestDeployment(...)` return `status` from enum `BUILDING, DEPLOYING, INITIALIZING, QUEUED,
  WAITING, NEEDS_APPROVAL, SUCCESS, FAILED, CRASHED, SKIPPED, REMOVING, REMOVED, SLEEPING`; the
  `Deployment` object also exposes `meta` (webhook payloads show it carries `commitHash`,
  `branch`, etc.).
- `deploymentApprove(id)` exists, but `NEEDS_APPROVAL` is Railway's gate for pushes from users
  outside the project team, not a coordination feature
  ([Help Station](https://station.railway.com/questions/my-deployment-needs-approval-e9fe235a)).

So a GitHub Actions job can deploy both services at one SHA and wait for both to reach `SUCCESS`
— or sequence them — entirely through the public API.

### 5. CLI

- `railway up` scans/uploads the current directory, builds with Railpack/Dockerfile, and by
  default attaches and waits; exit code 0 on `SUCCESS`, 1 on failure. Flags: `--ci` ("stream build
  logs only, then exit"), `--detach`, `--service`, `--environment`, `--path-as-root`.
  ([cli/up](https://docs.railway.com/cli/up),
  [deploying with the CLI](https://docs.railway.com/cli/deploying))
- Caveat for this repo: `railway up` deploys the *uploaded working tree*, not the connected GitHub
  branch, so using it in CI changes the build source semantics (it does keep the whole-repo root,
  which suits the shared pnpm monorepo).
- `railway redeploy` re-runs the latest deployment without new code; `railway deployment list
  --json` exposes statuses for polling; there is no `railway deployment approve` and no documented
  "wait for deployment by id" command.
  ([cli/deployment](https://docs.railway.com/cli/deployment))
- Auto-deploy on push can be disabled per service in Service Settings; manual deploys then go via
  Command Palette "Deploy Latest Commit" (or the API mutations above).
  ([GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys))

### 6. Config-as-code

Relevant per-service fields (no cross-service fields exist): `preDeployCommand`,
`healthcheckPath`, `healthcheckTimeout`, `overlapSeconds`, `drainingSeconds`, `watchPatterns`
("array of patterns used to conditionally trigger a deploys").
([config-as-code](https://docs.railway.com/reference/config-as-code))

### 7. Monorepo guidance and deploy events

- The monorepo guide covers shared vs isolated repos, per-service config files, and watch paths to
  avoid unnecessary rebuilds — nothing about coordinating deploy *timing* across services.
  ([monorepo](https://docs.railway.com/guides/monorepo))
- "Wait for CI" (`checkSuites`) holds a deployment in `WAITING` until the GitHub workflow for the
  push succeeds, and `SKIPPED` on failure. It synchronizes deploy *starts* against CI, not deploy
  *completion* across services. ([GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys))
- Railway reports each deployment's status to GitHub as a native `deployment_status` event, so a
  workflow can trigger on `deployment_status: states: [success]` and filter by
  `github.event.deployment.environment` — the documented hook for post-deploy chaining.
  ([GitHub Actions post-deploy](https://docs.railway.com/guides/github-actions-post-deploy))
- Project webhooks fire on deployment state changes with payloads including `status`, `branch`,
  `commitHash`, and service/environment IDs — an alternative signal for an external coordinator.
  ([webhooks](https://docs.railway.com/guides/webhooks))

### 8. Application-level mitigations Railway documents

Railway documents none specific to cross-service version skew. The only adjacent guidance is
per-service zero-downtime (healthcheck + overlap + draining, above). Compatibility windows between
services (backward-compatible APIs, tolerant clients) are standard practice but not covered by
Railway docs — noting explicitly that this claim has no first-party Railway source.

## What does not exist (as of 2026-07-14)

- **Deployment groups / linked deploys / atomic multi-service deploys** — absent from docs and
  changelog; searches of railway.com return nothing.
- **Cross-service conditions in config-as-code** — the schema has no field referencing another
  service's deploy state.
- **A "wait for deployment" CLI command or CLI deployment approval** — `railway deployment` has
  `list`/`up`/`redeploy` only.
- **Staged/canary rollout across services** — multi-region replicas and PR environments exist, but
  no canary or percentage rollout feature appears in docs or changelog.
- **Documented pre-deploy timeout** — the pre-deploy docs specify no hard limit, which is part of
  why it is unsafe as a wait-gate.

## Sources

- https://docs.railway.com/reference/config-as-code
- https://docs.railway.com/guides/healthchecks
- https://docs.railway.com/deployments/deployment-teardown
- https://docs.railway.com/deployments/pre-deploy-command
- https://docs.railway.com/deployments/github-autodeploys
- https://docs.railway.com/guides/github-actions-post-deploy
- https://docs.railway.com/guides/webhooks
- https://docs.railway.com/guides/monorepo
- https://docs.railway.com/reference/public-api
- https://docs.railway.com/integrations/api/manage-deployments
- https://docs.railway.com/integrations/api/api-cookbook
- https://docs.railway.com/cli/deploying
- https://docs.railway.com/cli/up
- https://docs.railway.com/cli/deployment
- https://railway.com/changelog
- Live GraphQL schema introspection of `https://backboard.railway.com/graphql/v2` (2026-07-14)
- https://station.railway.com/questions/my-deployment-needs-approval-e9fe235a (NEEDS_APPROVAL context)
