#!/bin/sh
#
# Configure this worktree to run agents in parallel without port or DB conflicts.
#
# Usage: sh scripts/worktree-setup.sh [slot]
#   [slot] is a small integer >= 1, unique per worktree. The main checkout is
#   slot 0 and keeps the repo's committed defaults — do not run this there.
#   Omit it to auto-assign the lowest free slot (or reuse this worktree's own).
#   A slot is "taken" when another worktree's pkg/db/.env.dev already names its
#   jedidiah_wt<slot> database; requesting a taken slot suggests a free one.
#
# Design (own Docker stack per worktree, static database names):
#   - Each worktree brings up its OWN Docker stack (Postgres + MinIO) on
#     slot-specific host ports; run `pnpm db:up` once per worktree. The stack is
#     namespaced by COMPOSE_PROJECT_NAME, so containers, volumes, and storage
#     bucket are isolated from every other worktree and the primary checkout.
#   - Because the stack is private, the database names stay the committed static
#     defaults (`jedidiah` / `jedidiah_template`); only the host ports differ.
#   - Each worktree gets its own dev-server ports too.
#   - Everything lives in gitignored env files the processes read themselves —
#     no shell sourcing:
#       * `.env.dev` (repo root)  docker compose stack vars (read by `db:up` via --env-file)
#       * `<pkg>/.env.dev`   dev/runtime overrides (loaded with override:true in development)
#       * `<pkg>/.env.test`  test-only TEST_DATABASE_URL (loaded only under NODE_ENV=test)
#       * `pkg/mobile/.env.local`  Expo Metro port (RCT_METRO_PORT, read by @expo/env)
#
# Re-running is safe: each managed block is regenerated in place.

set -eu

# Repo root = parent of this script's directory.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

# Refuse to run on the primary checkout — it is slot 0 and keeps committed defaults.
PRIMARY=$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')
if [ "$ROOT" = "$PRIMARY" ]; then
  echo "This is the primary checkout (slot 0); it keeps committed defaults." >&2
  echo "Create a linked worktree first, then run this from inside it:" >&2
  echo "  git worktree add ~/_worktrees/<name> && cd ~/_worktrees/<name>" >&2
  exit 2
fi

# Slot a worktree is configured for, read from its root .env.dev compose project
# name (COMPOSE_PROJECT_NAME=jedidiah_wt<slot>); empty if not configured.
slot_of() {
  envf="$1/.env.dev"
  [ -f "$envf" ] || return 0
  sed -n 's#^COMPOSE_PROJECT_NAME=jedidiah_wt\([0-9][0-9]*\).*#\1#p' "$envf" | head -1
}

# Slots already claimed by OTHER worktrees (this worktree's own slot stays reusable).
TAKEN=$(
  git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' | while IFS= read -r wt; do
    [ "$wt" = "$ROOT" ] && continue
    slot_of "$wt"
  done | sort -un
)

slot_is_taken() { printf '%s\n' "$TAKEN" | grep -qx "$1"; }

lowest_free_slot() {
  n=1
  while slot_is_taken "$n"; do n=$((n + 1)); done
  printf '%s\n' "$n"
}

SLOT="${1:-}"
case "$SLOT" in
  '' )
    SLOT=$(slot_of "$ROOT")
    if [ -n "$SLOT" ]; then
      echo "No slot given; reusing this worktree's slot ${SLOT}."
    else
      SLOT=$(lowest_free_slot)
      echo "No slot given; auto-assigned the lowest free slot: ${SLOT}."
    fi ;;
  0 )
    echo "Slot 0 is the main checkout; it keeps the committed defaults. Use 1+ for worktrees." >&2
    exit 2 ;;
  *[!0-9]* )
    echo "Slot must be a positive integer, got: ${SLOT}" >&2
    exit 2 ;;
  * )
    if slot_is_taken "$SLOT"; then
      free=$(lowest_free_slot)
      echo "Slot ${SLOT} is already claimed by another worktree." >&2
      echo "Lowest free slot is ${free} — re-run: sh scripts/worktree-setup.sh ${free}" >&2
      exit 1
    fi ;;
esac

BASE=$((7000 + SLOT * 100))
WEB_PORT=$((BASE + 1))
API_PORT=$((BASE + 2))
EXPO_PORT=$((BASE + 3))
LANDER_PORT=$((BASE + 4))
PG_PORT=$((BASE + 5))
MINIO_API_PORT=$((BASE + 6))
MINIO_CONSOLE_PORT=$((BASE + 7))

# Static names: each worktree has its own private Postgres, so the dev + template
# databases keep the committed defaults; only the host port differs per slot.
DB="jedidiah"
TEMPLATE="jedidiah_template"
DB_HOST="postgres://postgres:postgres@localhost:${PG_PORT}"

BEGIN="# >>> worktree-setup (slot ${SLOT}) — managed, regenerate with scripts/worktree-setup.sh"
END="# <<< worktree-setup"

# write_managed_block <file> <body>
# Strips any prior managed block from <file>, preserving hand-written lines, then
# appends a fresh block. Creates the file if absent.
write_managed_block() {
  file="$1"
  body="$2"
  tmp="${file}.wt.tmp"

  if [ -f "$file" ]; then
    awk '
      index($0, "# >>> worktree-setup") == 1 { skip = 1 }
      skip { if (index($0, "# <<< worktree-setup") == 1) skip = 0; next }
      { print }
    ' "$file" > "$tmp"
    # Collapse trailing blank lines so blocks stay tidy across re-runs.
    awk 'BEGIN{blanks=0} {if($0==""){blanks++;next} for(i=0;i<blanks;i++)print"";blanks=0;print}' "$tmp" > "$tmp.2"
    mv "$tmp.2" "$tmp"
    [ -s "$tmp" ] && printf '\n' >> "$tmp"
  else
    : > "$tmp"
  fi

  {
    printf '%s\n' "$BEGIN"
    printf '%s\n' "$body"
    printf '%s\n' "$END"
  } >> "$tmp"

  mv "$tmp" "$file"
  echo "  wrote ${file#"$ROOT"/}"
}

# write_test_db <package> — gitignored TEST_DATABASE_URL override (test mode only).
write_test_db() {
  cat > "$ROOT/pkg/$1/.env.test" <<EOF
# Generated by scripts/worktree-setup.sh (slot ${SLOT}). Gitignored. Loaded only under NODE_ENV=test.
TEST_DATABASE_URL=${DB_HOST}/${TEMPLATE}
EOF
  echo "  wrote pkg/$1/.env.test"
}

echo "Configuring worktree as slot ${SLOT}:"
echo "  web=${WEB_PORT} api=${API_PORT} expo=${EXPO_PORT} lander=${LANDER_PORT}"
echo "  db=${DB} template=${TEMPLATE} pg=localhost:${PG_PORT}"
echo "  stack=jedidiah_wt${SLOT} minio-api=localhost:${MINIO_API_PORT} minio-console=localhost:${MINIO_CONSOLE_PORT}"

# Best-effort: warn if any of this slot's dev ports are already in use right now.
if command -v lsof >/dev/null 2>&1; then
  busy=
  for p in "$WEB_PORT" "$API_PORT" "$EXPO_PORT" "$LANDER_PORT"; do
    lsof -ti "tcp:$p" >/dev/null 2>&1 && busy="$busy $p"
  done
  [ -n "$busy" ] && echo "  warning: ports already listening:${busy} (another process is using them)"
fi
echo

# --- docker stack vars (read by `pnpm db:up` via `docker compose --env-file`) -
# COMPOSE_PROJECT_NAME namespaces this worktree's containers/volumes/bucket;
# the host-port vars match the placeholders in docker-compose.yml. Existing
# hand-written lines are preserved.
write_managed_block "$ROOT/.env.dev" "COMPOSE_PROJECT_NAME=jedidiah_wt${SLOT}
POSTGRES_HOST_PORT=${PG_PORT}
MINIO_API_HOST_PORT=${MINIO_API_PORT}
MINIO_CONSOLE_HOST_PORT=${MINIO_CONSOLE_PORT}"

# --- dev/runtime overrides (loaded by each package in development) -----------
# web: dev-server port + base URLs (no DB access).
write_managed_block "$ROOT/pkg/web/.env.dev" "PORT=${WEB_PORT}
APP_BASE_URL=http://localhost:${WEB_PORT}
API_BASE_URL=http://localhost:${API_PORT}
AUTH_BASE_URL=http://localhost:${API_PORT}/api/auth"

# api: port, base URLs, trusted origins (web + api + mobile-web Expo port +
# native scheme), dev DB, and this worktree's MinIO endpoint (overrides the
# committed default of :9000). Existing hand-written lines (real OPENAI/RESEND
# keys etc.) are preserved.
write_managed_block "$ROOT/pkg/api/.env.dev" "PORT=${API_PORT}
APP_BASE_URL=http://localhost:${WEB_PORT}
API_BASE_URL=http://localhost:${API_PORT}
AUTH_TRUSTED_ORIGINS=http://localhost:${WEB_PORT},http://localhost:${API_PORT},http://localhost:${EXPO_PORT},jedidiahops://
DATABASE_URL=${DB_HOST}/${DB}
DOCUMENT_STORAGE_ENDPOINT=http://localhost:${MINIO_API_PORT}"

# lander: port + direct DB access + this worktree's MinIO endpoint.
write_managed_block "$ROOT/pkg/lander/.env.dev" "PORT=${LANDER_PORT}
DATABASE_URL=${DB_HOST}/${DB}
DOCUMENT_STORAGE_ENDPOINT=http://localhost:${MINIO_API_PORT}"

# db: dev DB for migrate + seed (seed reads pkg/db/.env.dev), plus the template
# URL that `db:up:template` reads in development mode (NODE_ENV is unset there, so
# .env.test does not apply). Existing hand-written lines (STAGING_DATABASE_URL
# etc.) are preserved.
write_managed_block "$ROOT/pkg/db/.env.dev" "DATABASE_URL=${DB_HOST}/${DB}
TEST_DATABASE_URL=${DB_HOST}/${TEMPLATE}"

# --- test DB override for DB-backed test packages ---------------------------
write_test_db api
write_test_db core
write_test_db db
write_test_db lander

# --- mobile: Expo Metro port + slot API port (Expo reads .env.local itself) --
# RCT_METRO_PORT sets the dev-server port; EXPO_PUBLIC_API_PORT points the app at
# this slot's API instead of the default 7002 (api-base-url.ts keeps the
# platform-specific host, e.g. 10.0.2.2 on the Android emulator).
cat > "$ROOT/pkg/mobile/.env.local" <<EOF
# Generated by scripts/worktree-setup.sh (slot ${SLOT}). Gitignored.
RCT_METRO_PORT=${EXPO_PORT}
EXPO_PUBLIC_API_PORT=${API_PORT}
EOF
echo "  wrote pkg/mobile/.env.local"

# --- preview: match .claude/launch.json ports to this slot -------------------
# launch.json is tracked, so we patch the worktree copy in place and mark it
# skip-worktree so `git add -A` (e.g. /blast-it) never commits slot-specific
# ports. Undo with: git update-index --no-skip-worktree .claude/launch.json
LAUNCH="$ROOT/.claude/launch.json"
if [ -f "$LAUNCH" ]; then
  WEB_PORT="$WEB_PORT" API_PORT="$API_PORT" EXPO_PORT="$EXPO_PORT" LANDER_PORT="$LANDER_PORT" \
    node -e '
      const fs = require("fs");
      const f = process.argv[1];
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      const ports = { web: +process.env.WEB_PORT, api: +process.env.API_PORT, "mobile-web": +process.env.EXPO_PORT, lander: +process.env.LANDER_PORT };
      for (const c of j.configurations ?? []) if (c.name in ports) c.port = ports[c.name];
      fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
    ' "$LAUNCH"
  git -C "$ROOT" update-index --skip-worktree .claude/launch.json 2>/dev/null || true
  echo "  patched .claude/launch.json (skip-worktree)"
fi

cat <<EOF

Done — no shell sourcing needed. Next steps in this worktree:

  pnpm db:up                            # bring up THIS worktree's own Docker stack (jedidiah_wt${SLOT})
  pnpm db:up:template                   # build ${TEMPLATE} for this branch's migrations
  pnpm db:migrate && pnpm db:seed       # migrate + seed the ${DB} dev database

Then \`pnpm dev\`, \`pnpm test\`, and \`pnpm --filter @pkg/mobile dev\` use slot ${SLOT}'s
ports and databases automatically.
EOF
