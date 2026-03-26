#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.run/frontend.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Frontend is not running (no PID file)."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped frontend (PID $PID)"
else
  echo "Frontend PID $PID was not running"
fi

rm -f "$PID_FILE"
