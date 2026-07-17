#!/bin/bash
# Snapmaker U1 BambuStudio Compatibility Pack v5.39.0 - Linux Reinstaller
# Stops Bridge, uninstalls, then reinstalls in one step
set -e

BRIDGE_PORT=13628
XDG_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
BRIDGE_CONFIG_DIR="$XDG_CONFIG/BambuStudio-Bridge"
BRIDGE_DATA_DIR="$XDG_DATA/BambuStudio-Bridge"

cyan()   { echo -e "\033[36m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }
green()  { echo -e "\033[32m$*\033[0m"; }

echo ""
cyan "  ======================================================"
cyan "    BambuStudio Compatibility Pack - Linux Reinstaller"
cyan "  ======================================================"
echo ""

# ─── Step 1: Stop Bridge ───
yellow "  [1/3] Stopping Bridge Server..."

if systemctl --user is-active bambustudio-bridge.service &>/dev/null; then
    systemctl --user stop bambustudio-bridge.service 2>/dev/null
    green "  Stopped systemd service"
fi

if ss -tlnp 2>/dev/null | grep -q ":${BRIDGE_PORT}"; then
    EXISTING_PID=$(ss -tlnp 2>/dev/null | grep ":${BRIDGE_PORT}" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
    if [ -n "$EXISTING_PID" ]; then
        kill "$EXISTING_PID" 2>/dev/null || true
        sleep 1
        green "  Stopped Bridge process (PID: $EXISTING_PID)"
    fi
fi
pkill -f "node server.js" 2>/dev/null || true
sleep 1

# ─── Step 2: Remove old Bridge files (keep config) ───
yellow "  [2/3] Removing old Bridge files (preserving config)..."
if [ -d "$BRIDGE_DATA_DIR" ]; then
    rm -rf "$BRIDGE_DATA_DIR"
    green "  Removed old Bridge data"
fi

# ─── Step 3: Run installer ───
yellow "  [3/3] Running installer..."
echo ""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/install.sh"
