#!/bin/sh
#
# Stop services started by `pnpm dev` for this checkout, or best-effort across
# known Jedidiah parallel slot ports with --all.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DRY_RUN=0
ALL=0

if [ "${1:-}" = "--" ]; then
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -- ) ;;
    --all ) ALL=1 ;;
    --dry-run ) DRY_RUN=1 ;;
    -h | --help )
      cat <<EOF
Usage: sh scripts/kill-dev-services.sh [--all] [--dry-run]

Stops pnpm dev services for the current checkout.
Use --all for a best-effort cleanup across known Jedidiah parallel slot ports.
EOF
      exit 0
      ;;
    * )
      echo "Unknown option: $1" >&2
      echo "Usage: sh scripts/kill-dev-services.sh [--all] [--dry-run]" >&2
      exit 2
      ;;
  esac
  shift
done

PORTS=$(mktemp)
MATCHED=$(mktemp)
PGIDS=$(mktemp)
trap 'rm -f "$PORTS" "$MATCHED" "$PGIDS"' EXIT INT HUP TERM

env_value() {
  file=$1
  key=$2
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -1
}

add_port() {
  port=$1
  case "$port" in
    "" | *[!0-9]* ) return 0 ;;
    * ) printf '%s\n' "$port" >> "$PORTS" ;;
  esac
}

add_checkout_ports() {
  checkout=$1
  add_port "$(env_value "$checkout/pkg/web/.env.dev" PORT)"
  add_port "$(env_value "$checkout/pkg/web/.env" PORT)"
  add_port "$(env_value "$checkout/pkg/api/.env.dev" PORT)"
  add_port "$(env_value "$checkout/pkg/api/.env" PORT)"
  add_port "$(env_value "$checkout/pkg/lander/.env.dev" PORT)"
  add_port "$(env_value "$checkout/pkg/lander/.env" PORT)"
  add_port "$(env_value "$checkout/pkg/mobile/.env.local" RCT_METRO_PORT)"
  add_port "$(env_value "$checkout/pkg/mobile/.env" RCT_METRO_PORT)"
}

project_slot() {
  case "$1" in
    jedidiah_slot[0-9]* ) printf '%s\n' "${1#jedidiah_slot}" ;;
    jedidiah_wt[0-9]* ) printf '%s\n' "${1#jedidiah_wt}" ;;
  esac
}

append_docker_slots() {
  if docker compose ls --all -q >/dev/null 2>&1; then
    docker compose ls --all -q | sed -n \
      -e 's/^jedidiah_slot\([0-9][0-9]*\)$/\1/p' \
      -e 's/^jedidiah_wt\([0-9][0-9]*\)$/\1/p'
  fi

  docker ps -a --format '{{.Names}}' 2>/dev/null | sed -n \
    -e 's/^jedidiah_slot\([0-9][0-9]*\)[_-].*/\1/p' \
    -e 's/^jedidiah_wt\([0-9][0-9]*\)[_-].*/\1/p'

  docker volume ls --format '{{.Name}}' 2>/dev/null | sed -n \
    -e 's/^jedidiah_slot\([0-9][0-9]*\)_.*/\1/p' \
    -e 's/^jedidiah_wt\([0-9][0-9]*\)_.*/\1/p'
}

add_slot_ports() {
  slot=$1
  case "$slot" in
    "" | *[!0-9]* ) return 0 ;;
  esac
  base=$((7000 + slot * 100))
  add_port $((base + 1))
  add_port $((base + 2))
  add_port $((base + 3))
  add_port $((base + 4))
}

add_checkout_ports "$ROOT"

if [ "$ALL" -eq 1 ] && command -v docker >/dev/null 2>&1; then
  append_docker_slots | sort -un | while IFS= read -r slot; do
    add_slot_ports "$slot"
  done
fi

sort -u "$PORTS" -o "$PORTS"

ps -axo pid=,ppid=,pgid=,command= | awk -v root="$ROOT" -v all="$ALL" '
  {
    pid = $1
    pgid = $3
    $1 = ""
    $2 = ""
    $3 = ""
    sub(/^ +/, "")
    command = $0

    in_scope = index(command, root "/") > 0 || index(command, root " ") > 0
    if (all) {
      in_scope = in_scope || index(command, "/jedidiah-platform/") > 0 || index(command, "/jedidiah-platform ") > 0
    }
    if (!in_scope) {
      next
    }

    is_dev_service = command ~ /turbo run dev/ ||
      command ~ /\/pkg\/web\/.*\/vite(\/bin\/vite\.js|\.js)?( |$)/ ||
      command ~ /\/pkg\/lander\/.*\/vite(\/bin\/vite\.js|\.js)?( |$)/ ||
      command ~ /\/pkg\/mobile\/.*\/expo\/bin\/cli start/ ||
      command ~ /tsx\/dist\/cli\.mjs watch src\/main\.ts/ ||
      command ~ /tsx\/dist\/loader\.mjs src\/main\.ts/

    if (is_dev_service) {
      print pid, pgid, command
    }
  }
' > "$MATCHED"

awk '{ print $2 }' "$MATCHED" >> "$PGIDS"

if command -v lsof >/dev/null 2>&1; then
  while IFS= read -r port; do
    lsof -nP -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | while IFS= read -r pid; do
      pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
      [ -n "$pgid" ] && printf '%s\n' "$pgid" >> "$PGIDS"
    done
  done < "$PORTS"
fi

self_pgid=$(ps -o pgid= -p "$$" | tr -d ' ')
sort -un "$PGIDS" | awk -v self="$self_pgid" '$1 != "" && $1 != self' > "$PGIDS.sorted"
mv "$PGIDS.sorted" "$PGIDS"

if [ ! -s "$PGIDS" ]; then
  if [ "$ALL" -eq 1 ]; then
    echo "No pnpm dev services found for this checkout or known parallel slots."
  else
    echo "No pnpm dev services found for this checkout."
  fi
  exit 0
fi

echo "Matched pnpm dev process groups:"
while IFS= read -r pgid; do
  printf '  %s\n' "$pgid"
  ps -axo pid=,pgid=,command= | awk -v pgid="$pgid" '$2 == pgid { print "    pid " $1 ": " substr($0, index($0, $3)) }'
done < "$PGIDS"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run only; no processes were killed."
  exit 0
fi

while IFS= read -r pgid; do
  kill -TERM "-$pgid" 2>/dev/null || true
done < "$PGIDS"

sleep 2

while IFS= read -r pgid; do
  if ps -axo pgid= | awk -v pgid="$pgid" '$1 == pgid { found = 1 } END { exit found ? 0 : 1 }'; then
    kill -KILL "-$pgid" 2>/dev/null || true
  fi
done < "$PGIDS"

if [ "$ALL" -eq 1 ]; then
  echo "Stopped pnpm dev services for this checkout and known parallel slots."
else
  echo "Stopped pnpm dev services for this checkout."
fi
