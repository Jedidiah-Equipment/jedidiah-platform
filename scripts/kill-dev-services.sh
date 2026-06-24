#!/bin/sh
#
# Stop every service started by `pnpm dev` for the main checkout and all linked
# worktree slots. The script targets dev process groups discovered from repo
# worktree paths, then falls back to the configured dev ports for each checkout.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DRY_RUN=0
CURRENT_ONLY=0

if [ "${1:-}" = "--" ]; then
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --current ) CURRENT_ONLY=1 ;;
    --dry-run ) DRY_RUN=1 ;;
    -h | --help )
      cat <<EOF
Usage: sh scripts/kill-dev-services.sh [--current] [--dry-run]

Stops pnpm dev services across the main checkout and all linked worktrees.
Use --current to target only this checkout.
EOF
      exit 0
      ;;
    * )
      echo "Unknown option: $1" >&2
      echo "Usage: sh scripts/kill-dev-services.sh [--current] [--dry-run]" >&2
      exit 2
      ;;
  esac
  shift
done

WORKTREES=$(mktemp)
PORTS=$(mktemp)
MATCHED=$(mktemp)
PGIDS=$(mktemp)
trap 'rm -f "$WORKTREES" "$PORTS" "$MATCHED" "$PGIDS"' EXIT INT HUP TERM

if [ "$CURRENT_ONLY" -eq 1 ]; then
  printf '%s\n' "$ROOT" > "$WORKTREES"
elif git -C "$ROOT" worktree list --porcelain >/dev/null 2>&1; then
  git -C "$ROOT" worktree list --porcelain | awk '/^worktree / { print substr($0, 10) }' > "$WORKTREES"
else
  printf '%s\n' "$ROOT" > "$WORKTREES"
fi

env_value() {
  file=$1
  key=$2
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | head -1
}

add_port() {
  port=$1
  case "$port" in
    "" | *[!0-9]* ) return 0 ;;
    * ) printf '%s\n' "$port" >> "$PORTS" ;;
  esac
}

while IFS= read -r worktree; do
  add_port "$(env_value "$worktree/pkg/web/.env.dev" PORT)"
  add_port "$(env_value "$worktree/pkg/web/.env" PORT)"
  add_port "$(env_value "$worktree/pkg/api/.env.dev" PORT)"
  add_port "$(env_value "$worktree/pkg/api/.env" PORT)"
  add_port "$(env_value "$worktree/pkg/lander/.env.dev" PORT)"
  add_port "$(env_value "$worktree/pkg/lander/.env" PORT)"
  add_port "$(env_value "$worktree/pkg/mobile/.env.local" RCT_METRO_PORT)"
  add_port "$(env_value "$worktree/pkg/mobile/.env" RCT_METRO_PORT)"
done < "$WORKTREES"

sort -u "$PORTS" -o "$PORTS"

ps -axo pid=,ppid=,pgid=,command= | awk '
  NR == FNR {
    roots[++root_count] = $0
    next
  }

  {
    pid = $1
    pgid = $3
    $1 = ""
    $2 = ""
    $3 = ""
    sub(/^ +/, "")
    command = $0

    in_repo = 0
    for (i = 1; i <= root_count; i++) {
      if (index(command, roots[i] "/") > 0 || index(command, roots[i] " ") > 0) {
        in_repo = 1
      }
    }
    if (!in_repo) {
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
' "$WORKTREES" - > "$MATCHED"

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
  if [ "$CURRENT_ONLY" -eq 1 ]; then
    echo "No pnpm dev services found for this checkout."
  else
    echo "No pnpm dev services found for this repo's main checkout or worktrees."
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

if [ "$CURRENT_ONLY" -eq 1 ]; then
  echo "Stopped pnpm dev services for this checkout."
else
  echo "Stopped pnpm dev services across main and linked worktrees."
fi
