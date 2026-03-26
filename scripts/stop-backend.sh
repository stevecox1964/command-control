#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.run/backend.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Backend is not running (no PID file)."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped backend (PID $PID)"
else
  echo "Backend PID $PID was not running"
fi

rm -f "$PID_FILE"
