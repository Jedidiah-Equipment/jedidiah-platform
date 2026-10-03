#!/bin/sh
# Take over a named local slot, rebuilding its Docker stack and data on every run.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

# pnpm forwards the optional separator to shell scripts.
if [ "${1:-}" = "--" ]; then shift; fi
if [ "$#" -ne 1 ]; then
  echo "Usage: pnpm use-slot -- <slot 1-9>" >&2
  exit 2
fi
SLOT=$1
case "$SLOT" in
  [1-9]) ;;
  -h | --help) echo "Usage: pnpm use-slot -- <slot 1-9>"; exit 0 ;;
  *) echo "Slot must be a single digit from 1 to 9." >&2; exit 2 ;;
esac

for tool in docker lsof pnpm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool is required to use a local slot." >&2
    exit 1
  fi
done
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

DB="jedidiah"
TEMPLATE="jedidiah_template"
PROJECT="jedidiah_slot${SLOT}"
BASE=$((7000 + SLOT * 100))

run() {
  echo "+ $*"
  if "$@"; then return 0; else
    status=$?
    echo "Failed (exit ${status}): $*" >&2
    exit "$status"
  fi
}

write_managed_block() {
  managed_target=$1
  managed_slot=$2
  managed_body=$3
  managed_tmp="${managed_target}.use-slot.tmp"
  managed_begin="# >>> use-slot (slot ${managed_slot}) managed, regenerate with pnpm use-slot"
  managed_end="# <<< use-slot"

  mkdir -p "$(dirname "$managed_target")"

  if [ -f "$managed_target" ]; then
    strip_generated_blocks "$managed_target" > "$managed_tmp"
    trim_trailing_blank_lines "$managed_tmp"
    [ -s "$managed_tmp" ] && printf '\n' >> "$managed_tmp"
  else
    : > "$managed_tmp"
  fi

  {
    printf '%s\n' "$managed_begin"
    printf '%s\n' "$managed_body"
    printf '%s\n' "$managed_end"
  } >> "$managed_tmp"

  mv "$managed_tmp" "$managed_target"
  echo "  wrote ${managed_target#"$ROOT"/}"
}

strip_generated_blocks() {
  awk '
    index($0, "# >>> use-slot") == 1 { skip = "slot"; next }
    index($0, "# >>> parallel-env") == 1 { skip = "parallel"; next }
    index($0, "# >>> worktree-setup") == 1 { skip = "worktree"; next }
    skip == "slot" {
      if (index($0, "# <<< use-slot") == 1) skip = ""
      next
    }
    skip == "parallel" {
      if (index($0, "# <<< parallel-env") == 1) skip = ""
      next
    }
    skip == "worktree" {
      if (index($0, "# <<< worktree-setup") == 1) skip = ""
      next
    }
    { print }
  ' "$1"
}

trim_trailing_blank_lines() {
  trim_target=$1
  trim_tmp="${trim_target}.trim"
  awk '
    { lines[NR] = $0 }
    END {
      last = NR
      while (last > 0 && lines[last] == "") last--
      for (i = 1; i <= last; i++) print lines[i]
    }
  ' "$trim_target" > "$trim_tmp"
  mv "$trim_tmp" "$trim_target"
}

write_env_files() {
  slot=$1
  project="jedidiah_slot${slot}"
  base=$((7000 + slot * 100))
  web_port=$((base + 1))
  api_port=$((base + 2))
  expo_port=$((base + 3))
  lander_port=$((base + 4))
  pg_port=$((base + 5))
  test_pg_port=$((base + 8))
  minio_api_port=$((base + 6))
  minio_console_port=$((base + 7))
  db_host="postgres://postgres:postgres@localhost:${pg_port}"
  test_db_host="postgres://postgres:postgres@localhost:${test_pg_port}"

  echo "Configuring slot ${slot}:"
  echo "  web=${web_port} api=${api_port} expo=${expo_port} lander=${lander_port}"
  echo "  db=${DB} pg=localhost:${pg_port} template=${TEMPLATE} test-pg=localhost:${test_pg_port}"
  echo "  stack=${project} minio-api=localhost:${minio_api_port} minio-console=localhost:${minio_console_port}"
  echo

  write_managed_block "$ROOT/.env.dev" "$slot" "COMPOSE_PROJECT_NAME=${project}
POSTGRES_HOST_PORT=${pg_port}
TEST_POSTGRES_HOST_PORT=${test_pg_port}
MINIO_API_HOST_PORT=${minio_api_port}
MINIO_CONSOLE_HOST_PORT=${minio_console_port}"

  write_managed_block "$ROOT/pkg/web/.env.dev" "$slot" "PORT=${web_port}
APP_BASE_URL=http://localhost:${web_port}
API_BASE_URL=http://localhost:${api_port}
AUTH_BASE_URL=http://localhost:${api_port}/api/auth"

  write_managed_block "$ROOT/pkg/api/.env.dev" "$slot" "PORT=${api_port}
APP_BASE_URL=http://localhost:${web_port}
API_BASE_URL=http://localhost:${api_port}
AUTH_TRUSTED_ORIGINS=http://localhost:${web_port},http://localhost:${api_port},http://localhost:${expo_port},jedidiahops://
DATABASE_URL=${db_host}/${DB}
DOCUMENT_STORAGE_ENDPOINT=http://localhost:${minio_api_port}"

  write_managed_block "$ROOT/pkg/lander/.env.dev" "$slot" "PORT=${lander_port}
DATABASE_URL=${db_host}/${DB}
DOCUMENT_STORAGE_ENDPOINT=http://localhost:${minio_api_port}"

  write_managed_block "$ROOT/pkg/db/.env.dev" "$slot" "DATABASE_URL=${db_host}/${DB}
TEST_DATABASE_URL=${test_db_host}/${TEMPLATE}"

  for pkg in ai api core db lander; do
    write_managed_block "$ROOT/pkg/$pkg/.env.test" "$slot" "TEST_DATABASE_URL=${test_db_host}/${TEMPLATE}"
  done

  write_managed_block "$ROOT/pkg/mobile/.env.local" "$slot" "RCT_METRO_PORT=${expo_port}
EXPO_PUBLIC_API_PORT=${api_port}
EXPO_PUBLIC_LANDER_ORIGIN=http://localhost:${lander_port}"
}

snapshot_has_content() {
  for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do
    if [ -e "$entry" ] || [ -L "$entry" ]; then return 0; fi
  done
  return 1
}

# Worktrees omit the gitignored snapshot. Copy it before taking over any services or volumes.
snapshot="$ROOT/pkg/seed/snapshot"
if ! snapshot_has_content "$snapshot"; then
  if ! worktrees=$(git -C "$ROOT" -c core.quotePath=false worktree list --porcelain); then
    echo "Cannot locate the primary checkout for the seed snapshot." >&2
    exit 1
  fi
  primary=$(printf '%s\n' "$worktrees" | sed -n '1s/^worktree //p')
  primary_snapshot="$primary/pkg/seed/snapshot"
  if [ -z "$primary" ] || ! snapshot_has_content "$primary_snapshot"; then
    echo "No seed snapshot in this checkout or at ${primary_snapshot}. Run pnpm --filter @pkg/seed seed:read in the primary checkout." >&2
    exit 1
  fi
  echo "Copying seed snapshot from ${primary_snapshot}"
  run mkdir -p "$ROOT/pkg/seed"
  snapshot_tmp=$(mktemp -d "$ROOT/pkg/seed/.snapshot-copy-XXXXXX")
  trap 'rm -rf "$snapshot_tmp"' 0
  trap 'exit 1' HUP INT TERM
  run cp -R "$primary_snapshot/." "$snapshot_tmp/"
  if [ -e "$snapshot" ] || [ -L "$snapshot" ]; then run rmdir "$snapshot"; fi
  run mv "$snapshot_tmp" "$snapshot"
  trap - 0 HUP INT TERM
fi

previous=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env.dev 2>/dev/null | tail -1)
holder=$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
  --format '{{.Label "com.docker.compose.project.working_dir"}}' | sort -u)
echo "Taking slot ${SLOT} (${PROJECT}); its data will be replaced."
if [ -n "$holder" ]; then echo "  previous holder: ${holder}"; fi
if [ -n "$previous" ] && [ "$previous" != "$PROJECT" ]; then
  echo "  this checkout was on ${previous}; that stack is left running"
fi

# Stop listener groups so Turbo and tsx watch cannot restart the old checkout's servers.
self_pgid=$(ps -o pgid= -p "$$" | tr -d ' ')
for offset in 1 2 3 4; do
  port=$((BASE + offset))
  pids=$(lsof -nP -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Stopping dev servers on ${port}..."
    pgids=$(for pid in $pids; do ps -o pgid= -p "$pid"; done | sort -un)
    for pgid in $pgids; do
      if [ "$pgid" = "$self_pgid" ]; then
        echo "Port ${port} shares this command's process group; stop its dev server first." >&2
        exit 1
      fi
      kill -TERM "-$pgid" 2>/dev/null || true
      attempts=0
      # Ignore zombies waiting for their parent to reap them.
      while ps -axo pgid=,stat= | awk -v group="$pgid" \
        '$1 == group && $2 !~ /^Z/ { found = 1 } END { exit found ? 0 : 1 }'; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge 5 ]; then
          kill -KILL "-$pgid" 2>/dev/null || true
          break
        fi
        sleep 1
      done
    done
    attempts=0
    while lsof -nP -ti "tcp:${port}" -sTCP:LISTEN >/dev/null 2>&1; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 5 ]; then
        echo "Port ${port} is still occupied after stopping its listeners." >&2
        exit 1
      fi
      sleep 1
    done
  fi
done

run docker compose -p "$PROJECT" -f "$ROOT/docker-compose.yml" down -v --remove-orphans
write_env_files "$SLOT"

# Pin bootstrap targets even when the invoking shell has its own env overrides.
export COMPOSE_PROJECT_NAME="$PROJECT"
export POSTGRES_HOST_PORT="$pg_port"
export TEST_POSTGRES_HOST_PORT="$test_pg_port"
export MINIO_API_HOST_PORT="$minio_api_port"
export MINIO_CONSOLE_HOST_PORT="$minio_console_port"
export DATABASE_URL="${db_host}/${DB}"
export TEST_DATABASE_URL="${test_db_host}/${TEMPLATE}"
export DOCUMENT_STORAGE_ENDPOINT="http://localhost:${minio_api_port}"
export NODE_ENV=development APP_ENV=development
run pnpm compose:up
run pnpm db:migrate
run pnpm db:migrate:test
run pnpm db:seed

echo
echo "Slot ${SLOT} is ready:"
echo "  web       http://localhost:${web_port}"
echo "  api       http://localhost:${api_port}"
echo "  expo      http://localhost:${expo_port}"
echo "  lander    http://localhost:${lander_port}"
echo "  database  ${DATABASE_URL}"
echo "  test      ${TEST_DATABASE_URL}"
echo "  minio     http://localhost:${minio_api_port} (console http://localhost:${minio_console_port})"
