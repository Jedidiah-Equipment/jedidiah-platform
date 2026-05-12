#!/bin/sh

set -u

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required to find services on ports 7001 and 7002." >&2
  exit 1
fi

pids=$(
  for port in 7001 7002; do
    lsof -ti "tcp:$port" 2>/dev/null || true
  done | awk 'NF && !seen[$0]++'
)

if [ -z "$pids" ]; then
  echo "No services found on ports 7001 or 7002."
  exit 0
fi

echo "Killing services on ports 7001 and 7002:"
echo "$pids"
kill $pids
