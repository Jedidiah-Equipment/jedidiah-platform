#!/bin/sh
#
# Provision and tear down checkout-local parallel slot environments.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_FILE="$ROOT/docker-compose.yml"
COMMAND="${1:-}"

SLOT_PREFIX="jedidiah_slot"
LEGACY_SLOT_PREFIX="jedidiah_wt"

DB="jedidiah"
TEMPLATE="jedidiah_template"

env_files() {
  cat <<EOF
$ROOT/.env.dev
$ROOT/pkg/web/.env.dev
$ROOT/pkg/api/.env.dev
$ROOT/pkg/lander/.env.dev
$ROOT/pkg/db/.env.dev
$ROOT/pkg/ai/.env.test
$ROOT/pkg/api/.env.test
$ROOT/pkg/core/.env.test
$ROOT/pkg/db/.env.test
$ROOT/pkg/lander/.env.test
$ROOT/pkg/mobile/.env.local
EOF
}

usage() {
  cat <<EOF
Usage: sh scripts/parallel-env.sh up|down [slot]

  up [slot]  writes checkout env files, starts the slot stack, migrates, and seeds
  down       stops checkout services, removes the slot stack, and strips generated env blocks
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required for parallel slot environments." >&2
    exit 1
  fi
}

project_slot() {
  case "$1" in
    ${SLOT_PREFIX}[0-9]* ) printf '%s\n' "${1#"$SLOT_PREFIX"}" ;;
    ${LEGACY_SLOT_PREFIX}[0-9]* ) printf '%s\n' "${1#"$LEGACY_SLOT_PREFIX"}" ;;
  esac
}

slot_project() {
  printf '%s%s\n' "$SLOT_PREFIX" "$1"
}

base_for_slot() {
  printf '%s\n' $((7000 + $1 * 100))
}

env_value() {
  file=$1
  key=$2
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -1
}

current_project() {
  env_value "$ROOT/.env.dev" COMPOSE_PROJECT_NAME
}

current_slot() {
  project=$(current_project)
  [ -n "$project" ] || return 0
  project_slot "$project"
}

append_docker_slots() {
  if docker compose ls --all -q >/dev/null 2>&1; then
    docker compose ls --all -q | sed -n \
      -e "s/^${SLOT_PREFIX}\([0-9][0-9]*\)$/\1/p" \
      -e "s/^${LEGACY_SLOT_PREFIX}\([0-9][0-9]*\)$/\1/p"
  fi

  docker ps -a --format '{{.Names}}' 2>/dev/null | sed -n \
    -e "s/^${SLOT_PREFIX}\([0-9][0-9]*\)[_-].*/\1/p" \
    -e "s/^${LEGACY_SLOT_PREFIX}\([0-9][0-9]*\)[_-].*/\1/p"

  docker volume ls --format '{{.Name}}' 2>/dev/null | sed -n \
    -e "s/^${SLOT_PREFIX}\([0-9][0-9]*\)_.*/\1/p" \
    -e "s/^${LEGACY_SLOT_PREFIX}\([0-9][0-9]*\)_.*/\1/p"
}

taken_slots() {
  append_docker_slots | sort -un
}

slot_is_taken() {
  slot=$1
  taken_slots | grep -qx "$slot"
}

lowest_free_slot() {
  slot=1
  while slot_is_taken "$slot"; do
    slot=$((slot + 1))
  done
  printf '%s\n' "$slot"
}

write_managed_block() {
  managed_target=$1
  managed_slot=$2
  managed_body=$3
  managed_tmp="${managed_target}.parallel.tmp"
  managed_begin="# >>> parallel-env (slot ${managed_slot}) managed, regenerate with pnpm parallel:up"
  managed_end="# <<< parallel-env"

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
    index($0, "# >>> parallel-env") == 1 { skip = "parallel"; next }
    index($0, "# >>> worktree-setup") == 1 { skip = "worktree"; next }
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

cleanup_env_files() {
  env_files | while IFS= read -r cleanup_target; do
    [ -f "$cleanup_target" ] || continue
    cleanup_tmp="${cleanup_target}.parallel.tmp"
    strip_generated_blocks "$cleanup_target" > "$cleanup_tmp"
    trim_trailing_blank_lines "$cleanup_tmp"
    if [ -s "$cleanup_tmp" ]; then
      mv "$cleanup_tmp" "$cleanup_target"
      echo "  cleaned ${cleanup_target#"$ROOT"/}"
    else
      rm -f "$cleanup_tmp" "$cleanup_target"
      echo "  removed ${cleanup_target#"$ROOT"/}"
    fi
  done
}

write_env_files() {
  slot=$1
  project=$(slot_project "$slot")
  base=$(base_for_slot "$slot")
  web_port=$((base + 1))
  api_port=$((base + 2))
  expo_port=$((base + 3))
  lander_port=$((base + 4))
  pg_port=$((base + 5))
  minio_api_port=$((base + 6))
  minio_console_port=$((base + 7))
  db_host="postgres://postgres:postgres@localhost:${pg_port}"

  echo "Configuring parallel slot ${slot}:"
  echo "  web=${web_port} api=${api_port} expo=${expo_port} lander=${lander_port}"
  echo "  db=${DB} template=${TEMPLATE} pg=localhost:${pg_port}"
  echo "  stack=${project} minio-api=localhost:${minio_api_port} minio-console=localhost:${minio_console_port}"
  echo

  write_managed_block "$ROOT/.env.dev" "$slot" "COMPOSE_PROJECT_NAME=${project}
POSTGRES_HOST_PORT=${pg_port}
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
TEST_DATABASE_URL=${db_host}/${TEMPLATE}"

  for pkg in ai api core db lander; do
    write_managed_block "$ROOT/pkg/$pkg/.env.test" "$slot" "TEST_DATABASE_URL=${db_host}/${TEMPLATE}"
  done

  write_managed_block "$ROOT/pkg/mobile/.env.local" "$slot" "RCT_METRO_PORT=${expo_port}
EXPO_PUBLIC_API_PORT=${api_port}
EXPO_PUBLIC_LANDER_ORIGIN=http://localhost:${lander_port}"
}

run_compose_down() {
  project=$1
  COMPOSE_PROJECT_NAME="$project" docker compose -f "$COMPOSE_FILE" down -v
}

run_up() {
  require_docker
  requested_slot="${1:-}"
  existing_slot=$(current_slot || true)

  if [ -n "$requested_slot" ]; then
    case "$requested_slot" in
      0 | *[!0-9]* )
        echo "Slot must be a positive integer, got: ${requested_slot}" >&2
        exit 2
        ;;
    esac
    slot=$requested_slot
    if [ "$slot" != "$existing_slot" ] && slot_is_taken "$slot"; then
      echo "Slot ${slot} is already occupied by Docker state." >&2
      echo "Lowest free slot is $(lowest_free_slot)." >&2
      exit 1
    fi
  elif [ -n "$existing_slot" ]; then
    slot=$existing_slot
    echo "No slot given; reusing this checkout's slot ${slot}."
  else
    slot=$(lowest_free_slot)
    echo "No slot given; auto-assigned the lowest Docker-free slot: ${slot}."
  fi

  write_env_files "$slot"
  echo
  pnpm compose:up
  pnpm --filter @pkg/db db:up:template
  pnpm db:migrate
  pnpm db:seed
}

run_down() {
  require_docker
  project=$(current_project)
  slot=$(project_slot "$project" || true)

  pnpm dev:kill

  if [ -n "$slot" ]; then
    echo "Removing Docker stack ${project}..."
    run_compose_down "$project"
  elif [ -n "$project" ]; then
    echo "Ignoring non-slot Docker project ${project} in .env.dev."
  else
    echo "No parallel slot Docker stack found in .env.dev."
  fi

  echo "Cleaning generated parallel env blocks..."
  cleanup_env_files
}

case "$COMMAND" in
  up )
    shift
    run_up "${1:-}"
    ;;
  down )
    shift
    if [ "$#" -gt 0 ]; then
      echo "parallel:down does not accept a slot; it tears down the current checkout's configured slot." >&2
      exit 2
    fi
    run_down
    ;;
  -h | --help | help )
    usage
    ;;
  * )
    usage >&2
    exit 2
    ;;
esac
