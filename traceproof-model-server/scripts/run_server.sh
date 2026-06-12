#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

HOST="${MODEL_SERVER_HOST:-0.0.0.0}"
PORT="${MODEL_SERVER_PORT:-8001}"

exec uvicorn server:app --host "$HOST" --port "$PORT"
