#!/bin/bash
# BambuStudio Bridge Linux launcher
# Starts the Node.js Bridge server for Snapmaker U1 compatibility
BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BRIDGE_DIR"

# Use node from PATH (or override with NODE_PATH env var)
NODE_BIN="${NODE_PATH:-$(which node)}"

exec "$NODE_BIN" server.js
