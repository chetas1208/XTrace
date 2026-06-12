#!/usr/bin/env bash
# Start (or reuse) a Cloudflare quick tunnel for the local model server and
# write outputs/tunnel_info.json describing it.
#
# - Uses cloudflared from PATH if available, else ./bin/cloudflared.
# - Runs `cloudflared tunnel --url http://localhost:8001` detached in the
#   background so it survives this script exiting.
# - Saves stdout/stderr to outputs/cloudflared_tunnel.log and the PID to
#   outputs/cloudflared.pid.
# - Waits up to TUNNEL_TIMEOUT seconds (default 60) for a *.trycloudflare.com
#   URL to appear in the log, then writes outputs/tunnel_info.json.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p outputs

LOCAL_URL="http://localhost:8001"
LOG_FILE="outputs/cloudflared_tunnel.log"
PID_FILE="outputs/cloudflared.pid"
INFO_FILE="outputs/tunnel_info.json"
TIMEOUT="${TUNNEL_TIMEOUT:-60}"

write_tunnel_info() {
  # args: status url pid
  python3 - "$1" "$2" "$3" "$LOG_FILE" "$INFO_FILE" <<'PYEOF'
import json
import sys
from pathlib import Path

status, url, pid, log_file, info_file = sys.argv[1:6]
data = {
    "provider": "cloudflare",
    "local_url": "http://localhost:8001",
    "public_url": url or None,
    "status": status,
    "log_file": log_file,
    "pid": int(pid) if pid.strip().isdigit() else None,
}
Path(info_file).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(json.dumps(data, indent=2))
PYEOF
}

# Resolve cloudflared binary
if command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED="cloudflared"
elif [ -x "$ROOT_DIR/bin/cloudflared" ]; then
  CLOUDFLARED="$ROOT_DIR/bin/cloudflared"
else
  {
    echo "ERROR: cloudflared not found on PATH or in bin/."
    echo "Run scripts/install_cloudflared.sh first."
  } | tee "$LOG_FILE" >&2
  write_tunnel_info "failed" "" ""
  exit 1
fi

# Reuse an existing healthy tunnel process if one is already running
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
  EXISTING_URL="$(grep -oE 'https://[A-Za-z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | tail -n1 || true)"
  if [ -n "$EXISTING_URL" ]; then
    echo "Existing cloudflared (pid $(cat "$PID_FILE")) — reusing $EXISTING_URL"
    write_tunnel_info "running" "$EXISTING_URL" "$(cat "$PID_FILE")"
    exit 0
  fi
  echo "Existing cloudflared pid $(cat "$PID_FILE") but no URL in log; restarting tunnel." | tee -a "$LOG_FILE"
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  sleep 2
fi

{
  echo "Using cloudflared: $CLOUDFLARED"
  "$CLOUDFLARED" --version
} >> "$LOG_FILE" 2>&1

echo "Starting cloudflared tunnel: $LOCAL_URL" | tee -a "$LOG_FILE"
nohup "$CLOUDFLARED" tunnel --url "$LOCAL_URL" --no-autoupdate >> "$LOG_FILE" 2>&1 &
disown
echo $! > "$PID_FILE"

PID="$(cat "$PID_FILE")"

# Wait for the trycloudflare.com URL to appear in the log
URL=""
for ((i = 0; i < TIMEOUT; i++)); do
  URL="$(grep -oE 'https://[A-Za-z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" | head -n1 || true)"
  if [ -n "$URL" ]; then
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "cloudflared process (pid $PID) exited unexpectedly." | tee -a "$LOG_FILE"
    break
  fi
  sleep 1
done

if [ -n "$URL" ]; then
  echo "Tunnel URL detected: $URL" | tee -a "$LOG_FILE"
  write_tunnel_info "running" "$URL" "$PID"
  exit 0
fi

echo "Could not detect a trycloudflare.com URL within ${TIMEOUT}s." | tee -a "$LOG_FILE"
echo "Open $LOG_FILE and copy the trycloudflare.com URL." | tee -a "$LOG_FILE"
write_tunnel_info "failed" "" "$PID"
exit 1
