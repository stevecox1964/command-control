#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/scripts/stop-frontend.sh"
"$ROOT/scripts/stop-backend.sh"

echo "Command & Control stack stopped."
