#!/usr/bin/env bash
# Install or verify cloudflared for the TraceProofAI model server.
#
# Resolution order:
#   1. cloudflared already on PATH
#   2. ./bin/cloudflared already present
#   3. apt-get install (only if sudo works non-interactively)
#   4. download the official static binary into ./bin/cloudflared
#   5. copy a known-good local cloudflared binary (e.g. /tmp/cloudflared) as a last resort
#
# All steps are logged to outputs/cloudflared_install.log. This script never
# silently fails: it always exits 0 with a verified --version, or exits
# non-zero with a clear error in the log.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p outputs bin
LOG_FILE="outputs/cloudflared_install.log"
: > "$LOG_FILE"

log() {
  echo "$@" | tee -a "$LOG_FILE"
}

# 1. Already on PATH?
if command -v cloudflared >/dev/null 2>&1; then
  VERSION="$(cloudflared --version 2>&1)"
  log "cloudflared already installed on PATH."
  log "Version: $VERSION"
  log "Verify with: cloudflared --version"
  exit 0
fi

# 2. Already in bin/?
if [ -x "$ROOT_DIR/bin/cloudflared" ]; then
  VERSION="$("$ROOT_DIR/bin/cloudflared" --version 2>&1)"
  log "cloudflared already installed at bin/cloudflared."
  log "Version: $VERSION"
  log "Verify with: ./bin/cloudflared --version"
  exit 0
fi

log "cloudflared not found on PATH or in bin/. Beginning install."

OS="$(uname -s)"
ARCH="$(uname -m)"
log "Detected OS=$OS ARCH=$ARCH"

if [ "$OS" != "Linux" ]; then
  log "ERROR: this installer only supports Linux. Detected: $OS"
  log "Download cloudflared manually from https://github.com/cloudflare/cloudflared/releases"
  exit 1
fi

case "$ARCH" in
  x86_64|amd64) CF_ARCH="amd64" ;;
  aarch64|arm64) CF_ARCH="arm64" ;;
  armv7l) CF_ARCH="arm" ;;
  *)
    log "ERROR: unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# 3. apt-get path (only if sudo works non-interactively)
if command -v apt-get >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  log "sudo is available non-interactively; attempting apt-get install of cloudflared..."
  {
    sudo -n mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo -n tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs 2>/dev/null || echo bookworm) main" \
      | sudo -n tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
    sudo -n apt-get update
    sudo -n apt-get install -y cloudflared
  } >> "$LOG_FILE" 2>&1
  if command -v cloudflared >/dev/null 2>&1; then
    VERSION="$(cloudflared --version 2>&1)"
    log "Installed cloudflared via apt-get."
    log "Version: $VERSION"
    log "Verify with: cloudflared --version"
    exit 0
  fi
  log "apt-get install did not result in a usable cloudflared; falling back to binary download."
else
  log "sudo not usable non-interactively (or apt-get missing); skipping apt-get and downloading binary directly."
fi

# 4. Download static binary into bin/
DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
log "Downloading cloudflared binary from $DOWNLOAD_URL"
if curl -fsSL "$DOWNLOAD_URL" -o "$ROOT_DIR/bin/cloudflared" >> "$LOG_FILE" 2>&1; then
  chmod +x "$ROOT_DIR/bin/cloudflared"
  if VERSION="$("$ROOT_DIR/bin/cloudflared" --version 2>&1)"; then
    log "Downloaded cloudflared to bin/cloudflared."
    log "Version: $VERSION"
    log "NOTE: bin/cloudflared is not on PATH. Either run it as ./bin/cloudflared,"
    log "      or add 'traceproof-model-server/bin' to your PATH:"
    log "      export PATH=\"$ROOT_DIR/bin:\$PATH\""
    log "Verify with: ./bin/cloudflared --version"
    exit 0
  fi
  log "ERROR: downloaded binary at bin/cloudflared failed --version check."
  rm -f "$ROOT_DIR/bin/cloudflared"
else
  log "ERROR: download from $DOWNLOAD_URL failed."
fi

# 5. Last resort: reuse a known-good local cloudflared binary if one exists on this host.
for candidate in /tmp/cloudflared "$HOME/cloudflared" "$HOME/bin/cloudflared"; do
  if [ -x "$candidate" ]; then
    log "Found existing cloudflared binary at $candidate; copying to bin/cloudflared"
    cp "$candidate" "$ROOT_DIR/bin/cloudflared"
    chmod +x "$ROOT_DIR/bin/cloudflared"
    if VERSION="$("$ROOT_DIR/bin/cloudflared" --version 2>&1)"; then
      log "Version: $VERSION"
      log "NOTE: bin/cloudflared is not on PATH. Either run it as ./bin/cloudflared,"
      log "      or add 'traceproof-model-server/bin' to your PATH:"
      log "      export PATH=\"$ROOT_DIR/bin:\$PATH\""
      log "Verify with: ./bin/cloudflared --version"
      exit 0
    fi
    log "ERROR: copied binary at bin/cloudflared from $candidate failed --version check."
    rm -f "$ROOT_DIR/bin/cloudflared"
  fi
done

log "ERROR: cloudflared install failed. See $LOG_FILE for details."
log "Manual install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
exit 1
