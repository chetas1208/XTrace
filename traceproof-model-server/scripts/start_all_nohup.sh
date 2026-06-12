#!/usr/bin/env bash
# Start the HPC GPU model server + Cloudflare quick tunnel under nohup.
# Both processes survive terminal close (PPID 1). Logs and PIDs under outputs/.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p outputs

HOST="${MODEL_SERVER_HOST:-0.0.0.0}"
PORT="${MODEL_SERVER_PORT:-8001}"
UVICORN_LOG="outputs/uvicorn.log"
UVICORN_PID="outputs/uvicorn.pid"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# --- GPU model server (uvicorn) ---
start_uvicorn() {
  if [ -f "$UVICORN_PID" ] && kill -0 "$(cat "$UVICORN_PID" 2>/dev/null)" 2>/dev/null; then
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      echo "uvicorn already healthy (pid $(cat "$UVICORN_PID"))"
      return 0
    fi
    echo "stale uvicorn pid $(cat "$UVICORN_PID"); restarting"
    kill "$(cat "$UVICORN_PID")" 2>/dev/null || true
    sleep 2
  fi

  # Free port if another uvicorn instance holds it
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
    sleep 1
  fi

  PYTHON="python3"
  if [ -x ".venv/bin/python" ]; then
    PYTHON=".venv/bin/python"
  fi

  echo "Starting uvicorn on ${HOST}:${PORT} (log: ${UVICORN_LOG})"
  nohup "$PYTHON" -m uvicorn server:app --host "$HOST" --port "$PORT" >> "$UVICORN_LOG" 2>&1 &
  disown
  echo $! > "$UVICORN_PID"

  for ((i = 0; i < 30; i++)); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      echo "uvicorn healthy (pid $(cat "$UVICORN_PID"))"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: uvicorn did not become healthy within 30s — see $UVICORN_LOG"
  return 1
}

start_uvicorn || exit 1

# --- Cloudflare tunnel (delegates to existing script; already uses nohup) ---
bash scripts/run_tunnel_cloudflare.sh
TUNNEL_EXIT=$?

INFO_FILE="outputs/tunnel_info.json"
if [ ! -f "$INFO_FILE" ]; then
  echo "ERROR: tunnel_info.json not written"
  exit 1
fi

PUBLIC_URL="$(python3 -c "import json; print(json.load(open('$INFO_FILE'))['public_url'] or '')")"
if [ -z "$PUBLIC_URL" ]; then
  echo "ERROR: no public tunnel URL — check outputs/cloudflared_tunnel.log"
  exit "${TUNNEL_EXIT:-1}"
fi

# --- Wire tunnel URL into the Next.js web app .env ---
WEB_ENV="$(cd "$ROOT_DIR/.." && pwd)/.env"
if [ -f "$WEB_ENV" ]; then
  if grep -q '^MODEL_SERVER_URL=' "$WEB_ENV"; then
    sed -i "s|^MODEL_SERVER_URL=.*|MODEL_SERVER_URL=${PUBLIC_URL}|" "$WEB_ENV"
  else
    echo "MODEL_SERVER_URL=${PUBLIC_URL}" >> "$WEB_ENV"
  fi
  echo "Updated MODEL_SERVER_URL in $WEB_ENV"
else
  echo "WARN: web app .env not found at $WEB_ENV — set MODEL_SERVER_URL=${PUBLIC_URL} manually"
fi

echo ""
echo "============================================================"
echo " XTrace GPU stack running under nohup"
echo " Local:  http://127.0.0.1:${PORT}"
echo " Tunnel: ${PUBLIC_URL}"
echo " Logs:   ${UVICORN_LOG}  outputs/cloudflared_tunnel.log"
echo " PIDs:   ${UVICORN_PID}  outputs/cloudflared.pid"
echo "============================================================"
