#!/usr/bin/env bash
# Usage: readiness-check.sh [URL] [max_attempts] [sleep_seconds]
# Example (on server after systemctl restart): ./scripts/readiness-check.sh http://127.0.0.1:3000 40 1
set -euo pipefail
URL="${1:-http://127.0.0.1:3000}"
MAX="${2:-40}"
SLEEP="${3:-1}"

for ((i = 1; i <= MAX; i++)); do
  if curl -fsS -o /dev/null --max-time 5 "$URL"; then
    echo "readiness OK: $URL (attempt $i/$MAX)"
    exit 0
  fi
  echo "readiness wait… $i/$MAX ($URL)"
  sleep "$SLEEP"
done

echo "readiness FAILED after $MAX attempts: $URL" >&2
exit 1
