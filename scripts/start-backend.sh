#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/backend.pid"
LOG_FILE="$RUN_DIR/backend.log"
VENV_PY="$ROOT/.venv/bin/python"
PORT=8000

mkdir -p "$RUN_DIR"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

pkill -f "uvicorn backend.app:app --host 0.0.0.0 --port $PORT" 2>/dev/null || true
pkill -f ".venv/bin/python -m uvicorn backend.app:app.*--port $PORT" 2>/dev/null || true
sleep 1

if [[ ! -x "$VENV_PY" ]]; then
  echo "Virtualenv python not found at $VENV_PY"
  echo "Create the venv and install backend requirements first."
  exit 1
fi

if ss -ltn "sport = :$PORT" | grep -q LISTEN; then
  echo "Port $PORT is still in use. Could not start backend cleanly."
  exit 1
fi

cd "$ROOT"
: > "$LOG_FILE"
nohup "$VENV_PY" -m uvicorn backend.app:app --host 0.0.0.0 --port "$PORT" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
sleep 2

if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Backend failed to start. Check $LOG_FILE"
  exit 1
fi

if ! grep -q "0.0.0.0:$PORT" "$LOG_FILE"; then
  echo "Backend did not bind expected port $PORT. Check $LOG_FILE"
  exit 1
fi

echo "Backend started on port $PORT (PID $(cat "$PID_FILE"))"
echo "Log: $LOG_FILE"
