#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/scripts/start-backend.sh"
"$ROOT/scripts/start-frontend.sh"

echo "Command & Control stack started cleanly."
