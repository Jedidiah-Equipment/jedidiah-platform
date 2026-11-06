#!/bin/sh
# Take over a named local slot, rebuilding its Docker stack and data on every run.
# `status` reports who holds each slot and changes nothing; `release [N]` gives a slot back.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

USAGE="Usage: pnpm use-slot -- <slot 1-9 | status | release [slot 1-9]>"
usage_error() {
  echo "$1" >&2
  echo "$USAGE" >&2
  exit 2
}

# pnpm forwards the optional separator to shell scripts.
if [ "${1:-}" = "--" ]; then shift; fi
COMMAND=take
SLOT=
case "${1:-}" in
  -h | --help) echo "$USAGE"; exit 0 ;;
  status)
    [ "$#" -eq 1 ] || usage_error "status takes no slot."
    COMMAND=status
    ;;
  release)
    COMMAND=release
    case "$#:${2:-}" in
      1:) ;;
      2:[1-9]) SLOT=$2 ;;
      *) usage_error "Slot must be a single digit from 1 to 9." ;;
    esac
    ;;
  *)
    [ "$#" -eq 1 ] || usage_error "Name one slot."
    case "$1" in
      [1-9]) SLOT=$1 ;;
      *) usage_error "Slot must be a single digit from 1 to 9." ;;
    esac
    ;;
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

# The checkout a directory belongs to, as a physical path; empty when the directory is gone.
checkout_of() {
  [ -n "$1" ] || return 0
  (CDPATH= cd -- "$1" 2>/dev/null && { git rev-parse --show-toplevel 2>/dev/null || pwd -P; }) || true
}
THIS_CHECKOUT=$(checkout_of "$ROOT")

# The directory slot N's Docker stack was started from; empty when it has no stack.
stack_dir() {
  stack_dirs=$(docker ps -a --filter "label=com.docker.compose.project=jedidiah_slot$1" \
    --format '{{.Label "com.docker.compose.project.working_dir"}}') || return 1
  printf '%s\n' "$stack_dirs" | sort -u | head -1
}

# Slot N's web, API, Expo, and lander ports.
dev_ports() {
  echo "$((7000 + $1 * 100 + 1)) $((7000 + $1 * 100 + 2)) $((7000 + $1 * 100 + 3)) $((7000 + $1 * 100 + 4))"
}

# One "port|cwd" line per dev server listening on slot N's dev ports.
slot_listeners() {
  for port in $(dev_ports "$1"); do
    for pid in $(lsof -nP -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true); do
      cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
      printf '%s|%s\n' "$port" "$cwd"
    done
  done
}

print_status() {
  for n in 1 2 3 4 5 6 7 8 9; do
    stack=$(stack_dir "$n")
    listeners=$(slot_listeners "$n")
    state=free
    detail=
    if [ -n "$stack" ]; then
      state=held
      detail="  stack from ${stack}"
      owner=$(checkout_of "$stack")
      if [ -z "$owner" ]; then
        state=abandoned
        detail="${detail} (gone)"
      elif [ "$owner" = "$THIS_CHECKOUT" ]; then
        detail="${detail} (this checkout)"
      fi
    fi
    if [ -n "$listeners" ]; then
      state=held
      detail="${detail}  dev servers $(printf '%s\n' "$listeners" | sed 's/|/:/' | paste -sd ' ' -)"
    fi
    echo "slot ${n}  ${state}${detail}"
  done
}

DB="jedidiah"
TEMPLATE="jedidiah_template"

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

ENV_FILES=".env.dev pkg/web/.env.dev pkg/api/.env.dev pkg/lander/.env.dev pkg/db/.env.dev
pkg/ai/.env.test pkg/api/.env.test pkg/core/.env.test pkg/db/.env.test pkg/integrations/.env.test pkg/lander/.env.test
pkg/mobile/.env.local"

env_block() {
  case "$1" in
    .env.dev) printf '%s' "COMPOSE_PROJECT_NAME=${project}
POSTGRES_HOST_PORT=${pg_port}
TEST_POSTGRES_HOST_PORT=${test_pg_port}
MINIO_API_HOST_PORT=${minio_api_port}
MINIO_CONSOLE_HOST_PORT=${minio_console_port}" ;;
    pkg/web/.env.dev) printf '%s' "PORT=${web_port}
APP_BASE_URL=http://localhost:${web_port}
API_BASE_URL=http://localhost:${api_port}
AUTH_BASE_URL=http://localhost:${api_port}/api/auth" ;;
    pkg/api/.env.dev) printf '%s' "PORT=${api_port}
APP_BASE_URL=http://localhost:${web_port}
API_BASE_URL=http://localhost:${api_port}
AUTH_TRUSTED_ORIGINS=http://localhost:${web_port},http://localhost:${api_port},http://localhost:${expo_port},jedidiahops://,jedidiahopsstaging://
DATABASE_URL=${db_host}/${DB}
DOCUMENT_STORAGE_ENDPOINT=http://localhost:${minio_api_port}" ;;
    pkg/lander/.env.dev) printf '%s' "PORT=${lander_port}
DATABASE_URL=${db_host}/${DB}
DOCUMENT_STORAGE_ENDPOINT=http://localhost:${minio_api_port}" ;;
    pkg/db/.env.dev) printf '%s' "DATABASE_URL=${db_host}/${DB}
TEST_DATABASE_URL=${test_db_host}/${TEMPLATE}" ;;
    pkg/*/.env.test) printf '%s' "TEST_DATABASE_URL=${test_db_host}/${TEMPLATE}" ;;
    pkg/mobile/.env.local) printf '%s' "RCT_METRO_PORT=${expo_port}
EXPO_PUBLIC_API_PORT=${api_port}
EXPO_PUBLIC_LANDER_ORIGIN=http://localhost:${lander_port}" ;;
    *) echo "No use-slot block for $1." >&2; return 1 ;;
  esac
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

  for file in $ENV_FILES; do
    body=$(env_block "$file")
    write_managed_block "$ROOT/$file" "$slot" "$body"
  done
}

# Remove generated blocks from this checkout's env files, deleting a file left with no lines of its own.
clear_env_files() {
  for file in $ENV_FILES; do
    target="$ROOT/$file"
    [ -f "$target" ] || continue
    strip_generated_blocks "$target" > "${target}.use-slot.tmp"
    if cmp -s "${target}.use-slot.tmp" "$target"; then
      rm -f "${target}.use-slot.tmp"
      continue
    fi
    trim_trailing_blank_lines "${target}.use-slot.tmp"
    if [ -s "${target}.use-slot.tmp" ]; then
      mv "${target}.use-slot.tmp" "$target"
    else
      rm -f "${target}.use-slot.tmp" "$target"
    fi
    echo "  cleared ${file}"
  done
}

# Stop listener groups on slot N's dev ports so Turbo and tsx watch cannot restart their servers.
stop_dev_servers() {
  self_pgid=$(ps -o pgid= -p "$$" | tr -d ' ')
  for port in $(dev_ports "$1"); do
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
}

own_slot=$(sed -n 's/^COMPOSE_PROJECT_NAME=jedidiah_slot\([1-9]\)$/\1/p' .env.dev 2>/dev/null | tail -1)

# Free a slot unless a checkout that still exists elsewhere holds its stack or runs its dev servers.
release_slot() {
  slot=${SLOT:-$own_slot}
  if [ -z "$slot" ]; then
    echo "This checkout holds no slot; name one: pnpm use-slot -- release <slot 1-9>." >&2
    exit 1
  fi
  stack=$(stack_dir "$slot")
  owner=$(checkout_of "$stack")
  if [ -n "$owner" ] && [ "$owner" != "$THIS_CHECKOUT" ]; then
    echo "Slot ${slot} is held by ${stack}; release it from there, or take it with: pnpm use-slot -- ${slot}" >&2
    exit 1
  fi
  listeners=$(slot_listeners "$slot")
  while IFS='|' read -r port cwd; do
    [ -n "$port" ] || continue
    owner=$(checkout_of "$cwd")
    if [ -z "$cwd" ] || { [ -n "$owner" ] && [ "$owner" != "$THIS_CHECKOUT" ]; }; then
      echo "Slot ${slot} has a dev server from ${cwd:-an unknown directory} on ${port}; stop it there first." >&2
      exit 1
    fi
  done <<LISTENERS
$listeners
LISTENERS

  echo "Releasing slot ${slot} (jedidiah_slot${slot})..."
  stop_dev_servers "$slot"
  run docker compose -p "jedidiah_slot${slot}" -f "$ROOT/docker-compose.yml" down -v --remove-orphans
  if [ "$slot" = "$own_slot" ]; then
    clear_env_files
    echo "This checkout's env files are back on slot 0's defaults."
  fi
  echo "Slot ${slot} is free."
}

case "$COMMAND" in
  status) print_status; exit 0 ;;
  release) release_slot; exit 0 ;;
esac

PROJECT="jedidiah_slot${SLOT}"

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

holder=$(stack_dir "$SLOT")
echo "Taking slot ${SLOT} (${PROJECT}); its data will be replaced."
if [ -n "$holder" ]; then echo "  previous holder: ${holder}"; fi
if [ -n "$own_slot" ] && [ "$own_slot" != "$SLOT" ]; then
  echo "  this checkout was on jedidiah_slot${own_slot}; that stack is left running, free it with: pnpm use-slot -- release ${own_slot}"
fi

stop_dev_servers "$SLOT"

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
