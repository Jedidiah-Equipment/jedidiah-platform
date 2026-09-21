# @pkg/mobile

Expo managed React Native app for JedidiahOps. See [AGENTS.md](AGENTS.md) for code conventions.

## Commands

All are `pnpm --filter @pkg/mobile <script>`:

- `dev` — Expo for the dev client on port `7003`; `android` / `ios` build and launch the native dev client
- `dev:staging-api`, `android:staging-api`, `ios:staging-api` — the same, authenticating against
  `https://staging-api.jedidiahequipment.co.za` instead of a local API
- `doctor` — Expo Doctor for the staging variant
- `typecheck`, `test`
- `version:bump patch` — bump the store-facing app version (`minor` and `major` are also supported)
- `android-eas-build-staging` / `ios-eas-build-staging` and the matching `…-eas-submit-staging` scripts

## Local API

`EXPO_PUBLIC_API_BASE_URL` defaults to `http://10.0.2.2:7002` on the Android emulator and
`http://localhost:7002` on the iOS simulator and web. For a physical device, point it at the API machine's
LAN URL.

The Expo dev server runs on `http://localhost:7003` and staging builds use `jedidiahopsstaging://`; both
must stay in the API's `AUTH_TRUSTED_ORIGINS`.

## Observability contract

Mobile observability is business-blind infrastructure in `src/lib/observability.ts`. It is the only module
that imports `posthog-react-native`; Equipment and Contracting code emit through that API. The client is
disabled when `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` is unset, so local development and `pnpm verify` do not
send analytics. Touch autocapture, session replay, and native crash capture are deliberately off. Enabling
any of them requires a separate masking, retention, native-symbol upload, and staging-symbolication review.

Business-action event names are lowercase `<object> <past-tense verb>` with spaces. The explicit auth and
platform names in the catalog below are stable exceptions. Every capture includes these super
properties: `app: 'mobile'`, `appEnv`, `appVersion`, `runtimeVersion`, `updateId`, `platform`, `appVariant`,
and `business` (`equipment`, `contracting`, or `null`). Manual `$screen` events use a catalogued route
pattern such as `/equipment/jobs/[jobId]`, never the concrete identifier. A test walks `app/` and fails when
a page is missing from that catalog.

The named event catalog is:

- Auth: `signed in`, `sign in failed` (`reason` category only), `signed out`, `password reset requested`.
- Contracting: `reading captured` (`role`, `hasPhoto`, `offline`), `reading synced` (`role`, `hasPhoto`,
  `queueAgeSeconds`), `reading sync failed` (`role`, `hasPhoto`, `queueAgeSeconds`, `stage`, `code`, plus the
  existing version/platform properties), `reading attention resolved` (`resolution`), and
  `machine added to job` (`jobId`, `machineId`).
- Equipment mutations: `quote created`, `quote updated`, `quote cancelled`, `quote document generated`,
  `department timing started`, `department timing updated`, `department timing completed`, `part checked out`,
  `part returned to store`, `part received`, `part returned to supplier`, `stock count posted`,
  `stocktake opened`, `stocktake closed`, `job closed out`, `feedback submitted`, and `activity marked seen`.
  The central React Query mutation cache emits exactly once after success and reports unexpected failures
  once with the tRPC procedure path.
- Equipment actions: `stores actor selected`, `stores actor expired`, `assistant message sent`
  (`messageCount`, `outcome`), and `document opened`, `document shared`, `document downloaded`.
- Platform: `app update offered`, `app update installed`, `app update dismissed`, `app update failed`, and
  `offline gate shown`. PostHog's default installed/updated/opened/backgrounded lifecycle events remain on.

The **breadcrumb trail** is the last 50 bounded, in-memory navigation, lifecycle, connectivity, auth,
network, OTA, Contracting-queue, and Equipment-action entries. It is attached as `breadcrumbs` to every
captured exception. Network entries contain only method, route pattern or procedure path, status, and
duration—never bodies, query parameters, cookies, or headers. The SDK also adds PostHog tracing headers for
the configured API hostname.

API error classification is shared with web through `shouldReportApiMutationError` in `@pkg/schema`:
errors with an `appCode` and `BAD_REQUEST` outcomes are expected and only keep their operator-facing message;
everything else is reported. Query failures use the same rule through `QueryCache.onError`. The root,
protected, Equipment, and Contracting Expo Router layouts export the branded recovery boundary.

The property allow-list is strict: internal business-record IDs, enums, booleans, counts, durations, status
codes, and bounded reason/error categories are allowed. Never capture email, names, comments, notes, machine
serials or VINs, photo/file paths, scanned badge or Part values, assistant text, cookies, request bodies,
query strings, or any form value.

### Staging verification

1. Set the EAS build secrets `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`, and (for US Cloud)
   `POSTHOG_CLI_HOST=https://us.posthog.com`, then build and submit both staging platforms. The Expo config
   plugin uploads JavaScript source maps during the native build; the optional native plugin is not shipped.
2. Sign in on staging and move through public, Equipment, and Contracting routes. In PostHog, verify `$screen`
   names are patterns and every event has all shared properties with the correct `business`.
3. Trigger one handled failure, one unhandled exception, one unhandled rejection, and one render-boundary
   failure in a temporary staging-only test build. Confirm each exception has navigation, network, and
   lifecycle breadcrumbs and resolves to repository source. Confirm Reload recovers the boundary.
4. Sign out and sign in as a second internal user. Confirm the first event after the switch uses only the
   second internal user ID and carries no profile properties.
5. Force one queued reading failure with and without a photo. Confirm the `reading sync failed` event carries
   `stage`, `code`, `queueAgeSeconds`, `hasPhoto`, and `role` alongside the shared properties, and no machine,
   photo-path, or comment data.
6. Publish with `ota:staging`. The script uploads `dist` Hermes maps after EAS Update; force another exception
   and confirm its OTA stack resolves to repository source.

## Release

Staging builds use `APP_VARIANT=staging`, identifier `za.co.jedidiahequipment.ops.staging`, and the EAS
`staging` channel. EAS Submit uses the platform credentials stored in Expo for the matching Android package
or iOS bundle identifier. Android sends staging builds to Google Play closed testing (`alpha`) and
production builds to the `production` track.

Once an OTA update is published, running apps prompt for it — on launch, and on returning to the
foreground (throttled) — and install it when the user accepts. Dismissing holds for that session and for
that update only, so anything published after it asks again; expo applies a downloaded update on the next
cold start anyway, so a dismissed update usually lands without being asked for twice. A change that moves
the native fingerprint is not an OTA update and reaches users through the store instead, which nothing
prompts for.

The runtime version is the native fingerprint with the store version left out (`fingerprint.config.js`),
so the `version:bump` every mobile change set makes never blocks an OTA update on its own. Before exporting
or publishing, the `ota:*` script queries the latest finished EAS store build for each platform on the
profile's channel and compares its runtime version to the current fingerprint. It stops if no build exists,
EAS cannot verify it, or the fingerprints differ; in the last case, a full build and publish is required.
EAS build completion does not establish that the build is available from the store or installed on phones,
so confirm that separately before expecting an OTA to reach them. For details on a fingerprint difference,
compare fingerprints manually:

```sh
APP_VARIANT=production eas fingerprint:compare
```

Publish with the profile's script. It applies that profile's eas.json `env` (which `eas update` otherwise
ignores, shipping local `EXPO_PUBLIC_*` defaults) and uses the last commit subject unless `--message` is
given. Set `STAGING_POSTHOG_CLI_API_KEY`, `STAGING_POSTHOG_CLI_PROJECT_ID`, and
`STAGING_POSTHOG_CLI_HOST` in the gitignored `pkg/mobile/.env.dev` for staging, with the matching
`PRODUCTION_` names for production. Keep the unprefixed PostHog credentials in EAS for native builds.
The script maps the selected profile's complete set to the names PostHog CLI expects. Leave all three
values empty to use the release shell; a partial set stops the release. It refuses to publish without the
required key and project ID, exports both native bundles, uploads their Hermes maps in symbol-set mode,
and only then publishes that already-built `dist` directory:

```sh
pnpm --filter @pkg/mobile ota:staging
pnpm --filter @pkg/mobile ota:production --message "..."
```
