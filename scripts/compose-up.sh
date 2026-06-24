#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ -f "$ROOT/.env.dev" ]; then
  docker compose --env-file "$ROOT/.env.dev" -f "$ROOT/docker-compose.yml" up -d --wait
else
  docker compose -f "$ROOT/docker-compose.yml" up -d --wait
fi
