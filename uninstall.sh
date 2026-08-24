#!/bin/bash
# Snapmaker U1 BambuStudio Compatibility Pack v5.44.0 - Linux Uninstaller
set -e

VERSION="5.44.0"
BRIDGE_PORT=13628

# Colors
red()    { echo -e "\033[31m$*\033[0m"; }
green()  { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }
cyan()   { echo -e "\033[36m$*\033[0m"; }
white()  { echo -e "\033[37m$*\033[0m"; }
dark()   { echo -e "\033[90m$*\033[0m"; }

XDG_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
BRIDGE_CONFIG_DIR="$XDG_CONFIG/BambuStudio-Bridge"
BRIDGE_DATA_DIR="$XDG_DATA/BambuStudio-Bridge"

echo ""
cyan "  ======================================================"
cyan "    Snapmaker U1 BambuStudio Compatibility Pack v${VERSION}"
cyan "    Linux Uninstaller"
cyan "  ======================================================"
echo ""

# ─── [1/7] Stop Bridge Server ───
white "  [1/7] Stopping Bridge Server..."

# Try systemd first
if systemctl --user is-active bambustudio-bridge.service &>/dev/null; then
    systemctl --user stop bambustudio-bridge.service 2>/dev/null
    green "  Stopped systemd service"
else
    # Kill by port
    if ss -tlnp 2>/dev/null | grep -q ":${BRIDGE_PORT}"; then
        EXISTING_PID=$(ss -tlnp 2>/dev/null | grep ":${BRIDGE_PORT}" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
        if [ -n "$EXISTING_PID" ]; then
            kill "$EXISTING_PID" 2>/dev/null || true
            sleep 1
            green "  Stopped Bridge process (PID: $EXISTING_PID)"
        fi
    else
        dark "  Bridge not running (OK)"
    fi
fi

# Kill any lingering node server.js
pkill -f "node server.js" 2>/dev/null || true

# ─── [2/7] Disable autostart ───
white "  [2/7] Disabling autostart..."

# Disable systemd service
if systemctl --user is-enabled bambustudio-bridge.service &>/dev/null; then
    systemctl --user disable bambustudio-bridge.service 2>/dev/null
    green "  Disabled systemd service"
fi
rm -f "$XDG_CONFIG/systemd/user/bambustudio-bridge.service"
systemctl --user daemon-reload 2>/dev/null || true

# Remove .desktop autostart
if [ -f "$XDG_CONFIG/autostart/bambustudio-bridge.desktop" ]; then
    rm -f "$XDG_CONFIG/autostart/bambustudio-bridge.desktop"
    green "  Removed .desktop autostart entry"
fi

# Remove cron watchdog
if crontab -l 2>/dev/null | grep -q "bambustudio-bridge"; then
    crontab -l 2>/dev/null | grep -v "bambustudio-bridge" | crontab -
    green "  Removed cron watchdog"
fi

# ─── [3/7] Remove profiles ───
white "  [3/7] Removing Snapmaker profiles..."

# Detect BambuStudio config directory (check Flatpak first, then standard paths)
BAMBU_CONFIG_DIR=""
for dir in \
    "$HOME/.var/app/com.bambulab.BambuStudio/config/BambuStudio" \
    "$HOME/.var/app/com.bambulab.BambuStudio/config/BambuStudioBeta" \
    "$XDG_CONFIG/BambuStudio" \
    "$XDG_CONFIG/BambuStudioBeta"; do
    if [ -d "$dir" ]; then
        BAMBU_CONFIG_DIR="$dir"
        break
    fi
done

if [ -n "$BAMBU_CONFIG_DIR" ]; then
    # Remove from system cache
    if [ -d "$BAMBU_CONFIG_DIR/system/Snapmaker" ]; then
        rm -rf "$BAMBU_CONFIG_DIR/system/Snapmaker"
        rm -f "$BAMBU_CONFIG_DIR/system/Snapmaker.json"
        green "  Removed profiles from system cache"
    fi

    # Remove from resources/profiles/ (search common locations including Flatpak)
    for profiles_dir in \
        "/opt/BambuStudio/resources/profiles" \
        "/opt/bambu-studio/resources/profiles" \
        "/usr/share/bambu-studio/resources/profiles" \
        "$HOME/BambuStudio/resources/profiles" \
        "$HOME/.local/share/BambuStudio/resources/profiles" \
        "$HOME/Downloads/squashfs-root/resources/profiles" \
        "$HOME/squashfs-root/resources/profiles" \
        "/var/lib/flatpak/app/com.bambulab.BambuStudio/current/active/files/share/BambuStudio/profiles" \
        "$HOME/.local/share/flatpak/app/com.bambulab.BambuStudio/current/active/files/share/BambuStudio/profiles"; do
        if [ -f "$profiles_dir/Snapmaker.json" ]; then
            rm -rf "$profiles_dir/Snapmaker" "$profiles_dir/Snapmaker.json"
            green "  Removed profiles from $profiles_dir"
        fi
    done
else
    dark "  No BambuStudio config directory found (OK)"
fi

# ─── [4/7] Clean BambuStudio.conf ───
white "  [4/7] Cleaning BambuStudio.conf..."
if [ -n "$BAMBU_CONFIG_DIR" ] && [ -f "$BAMBU_CONFIG_DIR/BambuStudio.conf" ]; then
    CONF_FILE="$BAMBU_CONFIG_DIR/BambuStudio.conf"
    node -e "
const fs = require('fs');
const p = '$CONF_FILE';
try {
    const raw = fs.readFileSync(p, 'utf-8');
    const conf = JSON.parse(raw);
    let changed = false;
    if (conf.filaments && Array.isArray(conf.filaments)) {
        const before = conf.filaments.length;
        conf.filaments = conf.filaments.filter(f => !f.includes('@U1') && !f.startsWith('Snapmaker '));
        if (conf.filaments.length !== before) changed = true;
    }
    if (conf.nozzle_volume_types && typeof conf.nozzle_volume_types === 'object') {
        for (const key of Object.keys(conf.nozzle_volume_types)) {
            if (key.includes('Snapmaker')) { delete conf.nozzle_volume_types[key]; changed = true; }
        }
    }
    if (changed) {
        fs.copyFileSync(p, p + '.bak');
        fs.writeFileSync(p, JSON.stringify(conf, null, 2), 'utf-8');
        console.log('CLEANED');
    } else {
        console.log('NOCHANGE');
    }
} catch (e) { console.log('SKIP: ' + e.message); }
" 2>&1 | while IFS= read -r line; do
        case "$line" in
            CLEANED*) green "  Cleaned Snapmaker entries from BambuStudio.conf" ;;
            NOCHANGE) dark "  No Snapmaker entries in BambuStudio.conf (OK)" ;;
            *) yellow "  $line" ;;
        esac
    done
else
    dark "  BambuStudio.conf not found (OK)"
fi

# ─── [5/7] Restore user machine configs ───
white "  [5/7] Restoring user machine configs..."
if [ -n "$BAMBU_CONFIG_DIR" ] && [ -d "$BAMBU_CONFIG_DIR/user" ]; then
    RESTORED=0
    while IFS= read -r -d '' mf; do
        if [[ "$(basename "$mf")" == *Snapmaker* ]]; then
            node -e "
const fs = require('fs');
const p = '$mf';
try {
    const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
    let changed = false;
    if (json.print_host === 'http://127.0.0.1:${BRIDGE_PORT}') {
        delete json.print_host;
        changed = true;
    }
    if (json.print_host_webui === 'http://127.0.0.1:${BRIDGE_PORT}') {
        delete json.print_host_webui;
        changed = true;
    }
    if (json.host_type === 'octoprint') {
        delete json.host_type;
        changed = true;
    }
    if (changed) {
        fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf-8');
        console.log('RESTORED:' + require('path').basename(p));
    }
} catch (e) {}
" 2>&1 | while IFS= read -r line; do
                if [[ "$line" == "RESTORED:"* ]]; then
                    green "  Restored: ${line#RESTORED:}"
                fi
            done
            RESTORED=$((RESTORED + 1))
        fi
    done < <(find "$BAMBU_CONFIG_DIR/user" -name "*.json" -print0)
    if [ "$RESTORED" -eq 0 ]; then
        dark "  No machine configs to restore (OK)"
    fi
else
    dark "  No user configs directory (OK)"
fi

# ─── [6/7] Remove Bridge files ───
white "  [6/7] Removing Bridge Server files..."
if [ -d "$BRIDGE_DATA_DIR" ]; then
    rm -rf "$BRIDGE_DATA_DIR"
    green "  Removed: $BRIDGE_DATA_DIR"
else
    dark "  Bridge data directory not found (OK)"
fi

# ─── [7/7] Remove Bridge config ───
white "  [7/7] Removing Bridge configuration..."
echo -n "  Also remove Bridge config and logs? ($BRIDGE_CONFIG_DIR) [y/N] "
read -r rm_config
if [[ "$rm_config" == "y" || "$rm_config" == "Y" ]]; then
    rm -rf "$BRIDGE_CONFIG_DIR"
    green "  Removed: $BRIDGE_CONFIG_DIR"
else
    dark "  Preserved: $BRIDGE_CONFIG_DIR"
fi

# ─── Done ───
echo ""
green "  ======================================================"
green "    Uninstallation Complete!"
green "  ======================================================"
echo ""
dark "  Snapmaker U1 profiles and Bridge Server have been removed."
dark "  BambuStudio's own configuration was preserved."
echo ""
