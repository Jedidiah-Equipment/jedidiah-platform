#!/bin/sh

set -u

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required to find services on ports 7001, 7002, 7011, and 7012." >&2
  exit 1
fi

pids=$(
  for port in 7001 7002 7011 7012; do
    lsof -ti "tcp:$port" 2>/dev/null || true
  done | awk 'NF && !seen[$0]++'
)

if [ -z "$pids" ]; then
  echo "No services found on ports 7001, 7002, 7011, or 7012."
  exit 0
fi

echo "Killing services on ports 7001, 7002, 7011, and 7012:"
echo "$pids"
kill $pids
