#!/bin/bash
# Snapmaker U1 BambuStudio Compatibility Pack v5.46.0 - Linux Installer
set -e

VERSION="5.46.0"
BRIDGE_PORT=13628

# Colors
red()    { echo -e "\033[31m$*\033[0m"; }
green()  { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }
cyan()   { echo -e "\033[36m$*\033[0m"; }
white()  { echo -e "\033[37m$*\033[0m"; }
dark()   { echo -e "\033[90m$*\033[0m"; }

PKG_DIR="$(cd "$(dirname "$0")" && pwd)"

# XDG directories
XDG_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
BRIDGE_CONFIG_DIR="$XDG_CONFIG/BambuStudio-Bridge"
BRIDGE_DATA_DIR="$XDG_DATA/BambuStudio-Bridge"

echo ""
cyan "  ======================================================"
cyan "    Snapmaker U1 BambuStudio Compatibility Pack v${VERSION}"
cyan "  ======================================================"
echo ""

# ─── [0/9] Prerequisites check ───
white "  [0/9] Checking prerequisites..."

if ! command -v node &>/dev/null; then
    red "  [X] Node.js is required but not installed!"
    echo "  Please install Node.js LTS from: https://nodejs.org"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo ""
    exit 1
fi
NODE_VERSION=$(node --version)
green "  Node.js: $NODE_VERSION"

if ! command -v curl &>/dev/null; then
    yellow "  [!] curl not found (recommended for printer detection)"
fi

echo ""

# ─── Check BambuStudio not running ───
if pgrep -f -i "[Bb]ambu" &>/dev/null; then
    red "  [!] BambuStudio is running. Please close it first."
    exit 1
fi

# ─── [1/9] Detect BambuStudio ───
white "  [1/9] Detecting BambuStudio..."

detect_bambu() {
    # 1. Check common install directories
    local search_paths=(
        "/opt/BambuStudio"
        "/opt/bambu-studio"
        "/usr/share/bambu-studio"
        "/usr/lib/bambu-studio"
        "$HOME/BambuStudio"
        "$HOME/Applications/BambuStudio"
        "$HOME/.local/share/BambuStudio"
    )
    for p in "${search_paths[@]}"; do
        if [ -d "$p/resources/profiles" ]; then
            echo "$p"
            return 0
        fi
    done

    # 2. Check Flatpak install (system or user)
    local flatpak_profiles="/var/lib/flatpak/app/com.bambulab.BambuStudio/current/active/files/share/BambuStudio/profiles"
    if [ -d "$flatpak_profiles" ]; then
        echo "FLATPAK:$flatpak_profiles"
        return 0
    fi
    local flatpak_user_profiles="$HOME/.local/share/flatpak/app/com.bambulab.BambuStudio/current/active/files/share/BambuStudio/profiles"
    if [ -d "$flatpak_user_profiles" ]; then
        echo "FLATPAK:$flatpak_user_profiles"
        return 0
    fi

    # 3. Check for AppImage (look in common download locations)
    local appimage_dirs=("$HOME/Downloads" "$HOME/Applications" "$HOME/Apps" "$HOME" "/tmp")
    for dir in "${appimage_dirs[@]}"; do
        if [ -d "$dir" ]; then
            local found
            found=$(find "$dir" -maxdepth 1 -name "*.AppImage" -iname "*bambu*" 2>/dev/null | head -1) || true
            if [ -n "$found" ] && [ -x "$found" ]; then
                echo "APPIMAGE:$found"
                return 0
            fi
        fi
    done

    # 4. Check squashfs-root (already extracted AppImage)
    local squash_dirs=("$HOME/Downloads/squashfs-root" "$HOME/squashfs-root" "$HOME/BambuStudio/squashfs-root")
    for p in "${squash_dirs[@]}"; do
        if [ -d "$p/resources/profiles" ]; then
            echo "EXTRACTED:$p"
            return 0
        fi
    done

    return 1
}

BAMBU_MODE=""
BAMBU_DIR=""
BAMBU_APPIMAGE=""
BAMBU_PROFILES_DIR=""

detect_result=$(detect_bambu || true)
if [ -z "$detect_result" ]; then
    yellow "  [!] Cannot auto-detect BambuStudio installation."
    echo "  Common paths checked:"
    dark "    - /opt/BambuStudio"
    dark "    - /usr/share/bambu-studio"
    dark "    - ~/BambuStudio"
    dark "    - ~/Downloads/*.AppImage"
    echo ""
    echo "  Options:"
    echo "    - Enter BambuStudio install path (or AppImage path)"
    echo "    - Enter 'skip' to install Bridge only (profiles can be added later)"
    echo "    - Enter 'quit' to abort"
    echo ""
    echo -n "  Your choice: "
    read -r user_input
    user_input="${user_input//\~/$HOME}"

    if [ "$user_input" = "quit" ] || [ "$user_input" = "q" ]; then
        yellow "  Installation cancelled."
        exit 0
    fi

    if [ "$user_input" = "skip" ] || [ "$user_input" = "s" ]; then
        yellow "  Skipping BambuStudio profiles installation (Bridge only mode)."
        BAMBU_MODE="skip"
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudio"
    elif [ -f "$user_input" ] && [[ "$user_input" == *.AppImage ]]; then
        detect_result="APPIMAGE:$user_input"
    elif [ -d "$user_input/resources/profiles" ]; then
        detect_result="$user_input"
    elif [ -d "$user_input" ]; then
        detect_result="EXTRACTED:$user_input"
    else
        red "  [X] Invalid path: $user_input"
        red "  The 'resources/profiles' directory was not found."
        echo "  Enter 'skip' to install Bridge only, or 'quit' to abort."
        exit 1
    fi
fi

if [[ "$detect_result" == FLATPAK:* ]]; then
    BAMBU_MODE="flatpak"
    BAMBU_PROFILES_DIR="${detect_result#FLATPAK:}"
    green "  Found Flatpak: com.bambulab.BambuStudio"
    dark "  Profiles dir: $BAMBU_PROFILES_DIR"
    # Flatpak config directory
    BAMBU_CONFIG_DIR="$HOME/.var/app/com.bambulab.BambuStudio/config/BambuStudio"
    if [ ! -d "$BAMBU_CONFIG_DIR" ]; then
        BAMBU_CONFIG_DIR="$HOME/.var/app/com.bambulab.BambuStudio/config/BambuStudioBeta"
    fi
elif [[ "$detect_result" == APPIMAGE:* ]]; then
    BAMBU_MODE="appimage"
    BAMBU_APPIMAGE="${detect_result#APPIMAGE:}"
    BAMBU_DIR=""
    yellow "  Found AppImage: $BAMBU_APPIMAGE"
    yellow "  AppImage is read-only. Profiles will be installed to user config directory."
    # BambuStudio config directory (try both names)
    if [ -d "$XDG_CONFIG/BambuStudio" ]; then
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudio"
    elif [ -d "$XDG_CONFIG/BambuStudioBeta" ]; then
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudioBeta"
    else
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudio"
    fi
    BAMBU_PROFILES_DIR=""
elif [[ "$detect_result" == EXTRACTED:* ]]; then
    BAMBU_MODE="extracted"
    BAMBU_DIR="${detect_result#EXTRACTED:}"
    BAMBU_PROFILES_DIR="$BAMBU_DIR/resources/profiles"
    green "  Found (extracted): $BAMBU_DIR"
    # Determine BambuStudio config directory
    if [ -d "$XDG_CONFIG/BambuStudio" ]; then
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudio"
    elif [ -d "$XDG_CONFIG/BambuStudioBeta" ]; then
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudioBeta"
    else
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudio"
    fi
else
    BAMBU_MODE="dir"
    BAMBU_DIR="$detect_result"
    BAMBU_PROFILES_DIR="$BAMBU_DIR/resources/profiles"
    green "  Found: $BAMBU_DIR"
    # Determine BambuStudio config directory
    if [ -d "$XDG_CONFIG/BambuStudio" ]; then
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudio"
    elif [ -d "$XDG_CONFIG/BambuStudioBeta" ]; then
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudioBeta"
    else
        BAMBU_CONFIG_DIR="$XDG_CONFIG/BambuStudio"
    fi
fi

echo ""

# Confirm
if [ "$BAMBU_MODE" = "skip" ]; then
    echo -n "  Install Bridge Server only? (Y/N) "
else
    echo -n "  Install Snapmaker U1 profiles + Bridge Server? (Y/N) "
fi
read -r confirm
if [[ "$confirm" != "Y" && "$confirm" != "y" ]]; then
    yellow "  Cancelled."
    exit 0
fi

echo ""

# ─── Steps 2-6: BambuStudio profiles (skip in Bridge-only mode) ───
if [ "$BAMBU_MODE" != "skip" ]; then

# ─── [2/9] Clear BambuStudio system cache ───
white "  [2/9] Clearing BambuStudio system cache..."
SYSTEM_CACHE="$BAMBU_CONFIG_DIR/system"
if [ -d "$SYSTEM_CACHE/Snapmaker" ]; then
    rm -rf "$SYSTEM_CACHE/Snapmaker"
    rm -f "$SYSTEM_CACHE/Snapmaker.json"
    green "  Cleared system cache directory"
else
    dark "  No system cache found (OK)"
fi

# ─── [3/9] Preserve user custom presets ───
white "  [3/9] Preserving user custom presets..."
if [ -d "$BAMBU_CONFIG_DIR/user" ]; then
    green "  User presets directory found (preserved)"
else
    dark "  No user presets directory (OK)"
fi

# ─── [4/9] Clean filament cache in BambuStudio.conf ───
white "  [4/9] Cleaning filament cache in BambuStudio.conf..."
CONF_FILE="$BAMBU_CONFIG_DIR/BambuStudio.conf"
if [ -f "$CONF_FILE" ]; then
    # Use node to handle JSON safely (node is a prerequisite)
    node -e "
const fs = require('fs');
const path = '$CONF_FILE';
try {
    const raw = fs.readFileSync(path, 'utf-8');
    const conf = JSON.parse(raw);
    let changed = false;
    if (conf.filaments && Array.isArray(conf.filaments)) {
        const before = conf.filaments.length;
        conf.filaments = conf.filaments.filter(f => !f.includes('@U1') && !f.startsWith('Snapmaker '));
        if (conf.filaments.length !== before) {
            console.log('  Removed ' + (before - conf.filaments.length) + ' cached filament entries');
            changed = true;
        }
    }
    if (conf.nozzle_volume_types && typeof conf.nozzle_volume_types === 'object') {
        for (const key of Object.keys(conf.nozzle_volume_types)) {
            if (key.includes('Snapmaker')) {
                delete conf.nozzle_volume_types[key];
                changed = true;
            }
        }
    }
    if (changed) {
        fs.copyFileSync(path, path + '.bak');
        fs.writeFileSync(path, JSON.stringify(conf, null, 2), 'utf-8');
        console.log('CLEANED');
    } else {
        console.log('NOCHANGE');
    }
} catch (e) {
    // Regex fallback
    try {
        let content = fs.readFileSync(path, 'utf-8');
        let changed = false;
        // Remove @U1 filament entries
        const re1 = /\"[^\"]*@U1\"\s*,?\s*$/gm;
        if (re1.test(content)) { content = content.replace(re1, ''); changed = true; }
        // Remove Snapmaker filament entries
        const re2 = /\"Snapmaker (PLA|PLA Basic|PLA Matte|PLA Silk|PLA SnapSpeed|PLA-CF|PETG|PETG HF|ABS|TPU|TPU 90A|TPU 95A HF)[^\"]*\"\s*,?\s*$/gm;
        if (re2.test(content)) { content = content.replace(re2, ''); changed = true; }
        // Clean up trailing commas
        content = content.replace(/,(\s*[\]\}])/g, '\$1');
        if (changed) {
            fs.copyFileSync(path, path + '.bak');
            fs.writeFileSync(path, content, 'utf-8');
            console.log('CLEANED (regex fallback)');
        } else {
            console.log('NOCHANGE');
        }
    } catch (e2) {
        console.log('FAILED: ' + e2.message);
    }
}
" 2>&1 | while IFS= read -r line; do
        if [[ "$line" == "CLEANED"* ]]; then
            green "  Cleaned filament cache in BambuStudio.conf (backup: .bak)"
        elif [[ "$line" == "NOCHANGE" ]]; then
            dark "  No Snapmaker/U1 cache to clean (OK)"
        elif [[ "$line" == "FAILED"* ]]; then
            yellow "  [!] $line"
        else
            dark "  $line"
        fi
    done
else
    dark "  BambuStudio.conf not found (OK for first install)"
fi

# ─── [5/9] Patch user machine configs ───
white "  [5/9] Patching user machine configs (print_host -> Bridge)..."
PATCH_HOST="http://127.0.0.1:${BRIDGE_PORT}"
PATCH_WEBUI="http://127.0.0.1:${BRIDGE_PORT}"
PATCHED_COUNT=0
if [ -d "$BAMBU_CONFIG_DIR/user" ]; then
    while IFS= read -r -d '' mf; do
        # Only process machine configs with Snapmaker in name
        if [[ "$mf" == */machine/* ]] && [[ "$(basename "$mf")" == *Snapmaker* ]]; then
            PATCH_HOST="$PATCH_HOST" PATCH_WEBUI="$PATCH_WEBUI" node -e "
const fs = require('fs');
const p = '$mf';
const HOST = process.env.PATCH_HOST, WEBUI = process.env.PATCH_WEBUI;
try {
    const raw = fs.readFileSync(p, 'utf-8');
    if (!raw.includes('Snapmaker')) process.exit(0);
    const json = JSON.parse(raw);
    let changed = false;
    if (json.print_host && json.print_host !== HOST) {
        console.log('    print_host: ' + json.print_host + ' -> ' + HOST);
        json.print_host = HOST;
        changed = true;
    } else if (!json.print_host) {
        json.print_host = HOST;
        changed = true;
    }
    if (json.host_type && json.host_type !== 'octoprint') {
        json.host_type = 'octoprint';
        changed = true;
    } else if (!json.host_type) {
        json.host_type = 'octoprint';
        changed = true;
    }
    if (json.print_host_webui && json.print_host_webui !== WEBUI) {
        json.print_host_webui = WEBUI;
        changed = true;
    }
    if (changed) {
        fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf-8');
        console.log('PATCHED:' + require('path').basename(p));
    }
} catch (e) {}
" 2>&1 | while IFS= read -r line; do
                if [[ "$line" == "PATCHED:"* ]]; then
                    green "  Patched: ${line#PATCHED:}"
                else
                    dark "$line"
                fi
            done
            PATCHED_COUNT=$((PATCHED_COUNT + 1))
        fi
    done < <(find "$BAMBU_CONFIG_DIR/user" -name "*.json" -print0)
fi
if [ "$PATCHED_COUNT" -eq 0 ]; then
    dark "  No user machine configs needed patching (OK)"
fi

# ─── [6/9] Installing profiles ───
white "  [6/9] Installing profiles..."

if [ "$BAMBU_MODE" = "flatpak" ]; then
    # Flatpak: install to resources/profiles/ with sudo (vendor list is read from here)
    yellow "  Flatpak mode: installing profiles to resources/profiles/ (requires sudo)"
    if sudo cp -f "$PKG_DIR/Snapmaker.json" "$BAMBU_PROFILES_DIR/Snapmaker.json" 2>/dev/null; then
        sudo rm -rf "$BAMBU_PROFILES_DIR/Snapmaker"
        sudo cp -rf "$PKG_DIR/Snapmaker" "$BAMBU_PROFILES_DIR/Snapmaker"
        FILE_COUNT=$(find "$BAMBU_PROFILES_DIR/Snapmaker" -name "*.json" 2>/dev/null | wc -l)
        green "  Snapmaker.json"
        green "  Snapmaker/ directory ($FILE_COUNT files)"
        green "  Profiles installed to: $BAMBU_PROFILES_DIR"
        yellow "  Note: BambuStudio Flatpak updates will overwrite these profiles."
        yellow "  Re-run install.sh after BambuStudio updates."
    else
        red "  [!] sudo failed. Cannot write to $BAMBU_PROFILES_DIR"
        red "  Please run: sudo cp -r Snapmaker* $BAMBU_PROFILES_DIR/"
        VERIFY_OK=false
    fi
    # Also copy to system/ as backup
    USER_PROFILES="$BAMBU_CONFIG_DIR/system"
    mkdir -p "$USER_PROFILES"
    cp -f "$PKG_DIR/Snapmaker.json" "$USER_PROFILES/Snapmaker.json"
    rm -rf "$USER_PROFILES/Snapmaker"
    cp -rf "$PKG_DIR/Snapmaker" "$USER_PROFILES/Snapmaker"

elif [ "$BAMBU_MODE" = "appimage" ]; then
    # AppImage: install profiles to user config system directory as fallback
    yellow "  AppImage mode: installing profiles to user config directory"
    dark "  Note: If profiles don't appear, extract AppImage and run installer again:"
    dark "    ./${BAMBU_APPIMAGE##*/} --appimage-extract"
    dark "    Then point installer to squashfs-root/"

    USER_PROFILES="$BAMBU_CONFIG_DIR/system"
    mkdir -p "$USER_PROFILES"
    cp -f "$PKG_DIR/Snapmaker.json" "$USER_PROFILES/Snapmaker.json"
    rm -rf "$USER_PROFILES/Snapmaker"
    cp -rf "$PKG_DIR/Snapmaker" "$USER_PROFILES/Snapmaker"
    FILE_COUNT=$(find "$USER_PROFILES/Snapmaker" -name "*.json" 2>/dev/null | wc -l)
    green "  Snapmaker.json"
    green "  Snapmaker/ directory ($FILE_COUNT files)"
    green "  Profiles installed to: $USER_PROFILES"
else
    # Directory or extracted: install to resources/profiles/
    if [ ! -w "$BAMBU_PROFILES_DIR" ]; then
        yellow "  [!] resources/profiles/ is not writable, trying sudo..."
        sudo cp -f "$PKG_DIR/Snapmaker.json" "$BAMBU_PROFILES_DIR/Snapmaker.json"
        sudo rm -rf "$BAMBU_PROFILES_DIR/Snapmaker"
        sudo cp -rf "$PKG_DIR/Snapmaker" "$BAMBU_PROFILES_DIR/Snapmaker"
    else
        cp -f "$PKG_DIR/Snapmaker.json" "$BAMBU_PROFILES_DIR/Snapmaker.json"
        rm -rf "$BAMBU_PROFILES_DIR/Snapmaker"
        cp -rf "$PKG_DIR/Snapmaker" "$BAMBU_PROFILES_DIR/Snapmaker"
    fi
    FILE_COUNT=$(find "$BAMBU_PROFILES_DIR/Snapmaker" -name "*.json" 2>/dev/null | wc -l)
    green "  Snapmaker.json"
    green "  Snapmaker/ directory ($FILE_COUNT files)"
fi

fi  # end of "if BAMBU_MODE != skip"

# ─── [7/9] Installing Bridge Server ───
white "  [7/9] Installing Bridge Server (Node.js)..."

BRIDGE_SRC="$PKG_DIR/bridge-node"
WEB_SRC="$PKG_DIR/bridge/web"
BRIDGE_INSTALL_DIR="$BRIDGE_DATA_DIR/bridge"

if [ ! -d "$BRIDGE_SRC" ]; then
    yellow "  [!] Bridge source not found, skipping Bridge installation"
else
    # Create install directory
    mkdir -p "$BRIDGE_DATA_DIR"

    # Copy bridge-node
    rm -rf "$BRIDGE_INSTALL_DIR"
    cp -rf "$BRIDGE_SRC" "$BRIDGE_INSTALL_DIR"
    green "  Bridge files copied to $BRIDGE_INSTALL_DIR"

    # Copy web resources
    if [ -d "$WEB_SRC" ]; then
        rm -rf "$BRIDGE_INSTALL_DIR/web"
        cp -rf "$WEB_SRC" "$BRIDGE_INSTALL_DIR/web"
        green "  Web UI files copied to $BRIDGE_INSTALL_DIR/web"
    else
        yellow "  [!] Web UI source not found at $WEB_SRC"
    fi

    # Install npm dependencies
    white "  Installing npm dependencies..."
    (cd "$BRIDGE_INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund 2>&1) | while IFS= read -r line; do
        dark "    $line"
    done
    green "  npm dependencies installed"

    # Copy start-bridge.sh launcher
    if [ -f "$BRIDGE_INSTALL_DIR/start-bridge.sh" ]; then
        chmod +x "$BRIDGE_INSTALL_DIR/start-bridge.sh"
    fi
fi

# ─── [8/9] Verifying ───
white "  [8/9] Verifying..."

VERIFY_OK=true

if [ "$BAMBU_MODE" != "skip" ]; then
    if [ "$BAMBU_MODE" = "flatpak" ]; then
        # Flatpak: verify in resources/profiles/
        VENDOR_OK="no";   [ -f "$BAMBU_PROFILES_DIR/Snapmaker.json" ] && VENDOR_OK="yes"
        U1_OK="no";       [ -f "$BAMBU_PROFILES_DIR/Snapmaker/machine/Snapmaker U1.json" ] && U1_OK="yes"
        PROCESS_OK="no";  [ -f "$BAMBU_PROFILES_DIR/Snapmaker/process/0.20 Standard @Snapmaker U1.json" ] && PROCESS_OK="yes"
        FILAMENT_OK="no"; [ -f "$BAMBU_PROFILES_DIR/Snapmaker/filament/Snapmaker PLA Basic @U1.json" ] && FILAMENT_OK="yes"
    elif [ "$BAMBU_MODE" = "appimage" ]; then
        VENDOR_OK="no";   [ -f "$BAMBU_CONFIG_DIR/system/Snapmaker.json" ] && VENDOR_OK="yes"
        U1_OK="no";       [ -f "$BAMBU_CONFIG_DIR/system/Snapmaker/machine/Snapmaker U1.json" ] && U1_OK="yes"
        PROCESS_OK="no";  [ -f "$BAMBU_CONFIG_DIR/system/Snapmaker/process/0.20 Standard @Snapmaker U1.json" ] && PROCESS_OK="yes"
        FILAMENT_OK="no"; [ -f "$BAMBU_CONFIG_DIR/system/Snapmaker/filament/Snapmaker PLA Basic @U1.json" ] && FILAMENT_OK="yes"
    else
        VENDOR_OK="no";   [ -f "$BAMBU_PROFILES_DIR/Snapmaker.json" ] && VENDOR_OK="yes"
        U1_OK="no";       [ -f "$BAMBU_PROFILES_DIR/Snapmaker/machine/Snapmaker U1.json" ] && U1_OK="yes"
        PROCESS_OK="no";  [ -f "$BAMBU_PROFILES_DIR/Snapmaker/process/0.20 Standard @Snapmaker U1.json" ] && PROCESS_OK="yes"
        FILAMENT_OK="no"; [ -f "$BAMBU_PROFILES_DIR/Snapmaker/filament/Snapmaker PLA Basic @U1.json" ] && FILAMENT_OK="yes"
    fi

    if [ "$VENDOR_OK" = "yes" ] && [ "$U1_OK" = "yes" ] && [ "$PROCESS_OK" = "yes" ] && [ "$FILAMENT_OK" = "yes" ]; then
        green "  Profile verification passed!"
    else
        red "  [X] Profile verification failed!"
        [ "$VENDOR_OK" = "yes" ] || red "  Missing: Snapmaker.json"
        [ "$U1_OK" = "yes" ] || red "  Missing: Snapmaker U1.json"
        [ "$PROCESS_OK" = "yes" ] || red "  Missing: process file"
        [ "$FILAMENT_OK" = "yes" ] || red "  Missing: Snapmaker filament file"
        VERIFY_OK=false
    fi
else
    dark "  Profiles: skipped (Bridge-only mode)"
fi

BRIDGE_OK="no"; [ -n "$BRIDGE_INSTALL_DIR" ] && [ -f "$BRIDGE_INSTALL_DIR/server.js" ] && BRIDGE_OK="yes"

if [ "$BRIDGE_OK" = "yes" ]; then
    green "  Bridge Server (Node.js): installed"
else
    yellow "  Bridge Server: not installed"
fi

# ─── [9/9] Starting Bridge Server + autostart ───
white "  [9/9] Starting Bridge Server..."

mkdir -p "$BRIDGE_CONFIG_DIR"

# Stop existing bridge process
if ss -tlnp 2>/dev/null | grep -q ":${BRIDGE_PORT}"; then
    EXISTING_PID=$(ss -tlnp 2>/dev/null | grep ":${BRIDGE_PORT}" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
    if [ -n "$EXISTING_PID" ]; then
        kill "$EXISTING_PID" 2>/dev/null || true
        sleep 1
    fi
fi

# Create start-bridge.sh launcher (if not bundled)
create_launcher() {
    local launcher="$BRIDGE_INSTALL_DIR/start-bridge.sh"
    cat > "$launcher" << 'LAUNCHER'
#!/bin/bash
# BambuStudio Bridge Linux launcher
BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BRIDGE_DIR"
exec node server.js
LAUNCHER
    chmod +x "$launcher"
}

if [ ! -f "$BRIDGE_INSTALL_DIR/start-bridge.sh" ]; then
    create_launcher
fi

# Try systemd user service first (best option: autostart + watchdog)
SYSTEMD_DIR="$XDG_CONFIG/systemd/user"
SERVICE_NAME="bambustudio-bridge.service"
SERVICE_FILE="$SYSTEMD_DIR/$SERVICE_NAME"

setup_systemd() {
    mkdir -p "$SYSTEMD_DIR"
    NODE_PATH=$(which node)
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=BambuStudio Bridge Server
After=network.target

[Service]
Type=simple
ExecStart=$NODE_PATH server.js
WorkingDirectory=$BRIDGE_INSTALL_DIR
Restart=always
RestartSec=5
Environment=HOME=$HOME

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload 2>/dev/null
    systemctl --user enable "$SERVICE_NAME" 2>/dev/null
    systemctl --user start "$SERVICE_NAME" 2>/dev/null
    return $?
}

# Try systemd, fallback to autostart .desktop + nohup
if systemctl --user info 2>/dev/null | grep -q "default.target"; then
    if setup_systemd; then
        green "  Bridge started via systemd user service"
        green "  Autostart enabled (systemctl --user enable)"
        green "  Watchdog: automatic restart on crash (Restart=always)"
    else
        yellow "  [!] systemd user service failed, using .desktop autostart"
        USE_AUTOSTART=true
    fi
else
    USE_AUTOSTART=true
fi

if [ "${USE_AUTOSTART:-false}" = true ]; then
    # Fallback: .desktop autostart + nohup
    AUTOSTART_DIR="$XDG_CONFIG/autostart"
    mkdir -p "$AUTOSTART_DIR"
    cat > "$AUTOSTART_DIR/bambustudio-bridge.desktop" << EOF
[Desktop Entry]
Type=Application
Name=BambuStudio Bridge
Exec=$BRIDGE_INSTALL_DIR/start-bridge.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Comment=BambuStudio Bridge Server for Snapmaker U1
EOF
    green "  Autostart entry created: $AUTOSTART_DIR/bambustudio-bridge.desktop"

    # Start bridge now with nohup
    nohup "$BRIDGE_INSTALL_DIR/start-bridge.sh" > "$BRIDGE_CONFIG_DIR/bridge.log" 2>&1 &
    sleep 2

    # Create a simple watchdog cron script
    WATCHDOG_SCRIPT="$BRIDGE_CONFIG_DIR/watchdog.sh"
    cat > "$WATCHDOG_SCRIPT" << 'WDEOF'
#!/bin/bash
# BambuStudio Bridge watchdog - restart if crashed
BRIDGE_PORT=13628
BRIDGE_SCRIPT="$1"
LOG_FILE="$2"
if ! ss -tlnp 2>/dev/null | grep -q ":${BRIDGE_PORT}"; then
    nohup "$BRIDGE_SCRIPT" > "$LOG_FILE" 2>&1 &
fi
WDEOF
    chmod +x "$WATCHDOG_SCRIPT"

    # Add cron entry (every 2 minutes)
    CRON_CMD="*/2 * * * * $WATCHDOG_SCRIPT $BRIDGE_INSTALL_DIR/start-bridge.sh $BRIDGE_CONFIG_DIR/bridge.log"
    (crontab -l 2>/dev/null | grep -v "bambustudio-bridge"; echo "$CRON_CMD") | crontab -
    green "  Watchdog cron job installed (checks every 2 min)"
fi

# Verify bridge is running
sleep 2
if ss -tlnp 2>/dev/null | grep -q ":${BRIDGE_PORT}"; then
    green "  Bridge Server is running on http://127.0.0.1:${BRIDGE_PORT}"
else
    yellow "  [!] Bridge may not have started correctly."
    yellow "  Try running manually: $BRIDGE_INSTALL_DIR/start-bridge.sh"
fi

# ─── Done ───
echo ""
green "  ======================================================"
green "    Installation Successful!"
green "  ======================================================"
echo ""
white "  Installed:"
if [ "$BAMBU_MODE" != "skip" ]; then
    green "    - Snapmaker U1 profiles -> BambuStudio"
fi
green "    - Bridge Server (Node.js) -> $BRIDGE_INSTALL_DIR"
green "    - Auto-start -> systemd user service / .desktop autostart"
echo ""
if [ "$BAMBU_MODE" = "skip" ]; then
    white "  Next steps:"
    yellow "    1. Install BambuStudio (AppImage or .deb from bambulab.com)"
    yellow "    2. Re-run ./install.sh to add Snapmaker U1 profiles"
    echo ""
    dark "  Bridge is running now. Open http://127.0.0.1:${BRIDGE_PORT} to configure."
else
    white "  Next steps:"
    white "    1. Start BambuStudio"
    dark "    2. Add Printer -> Snapmaker -> Snapmaker U1"
    dark "    3. Slice and click Print -> native dialog will appear"
    echo ""
    dark "  Bridge auto-detects your printer via mDNS (no manual IP needed)."
    dark "  If auto-detection fails, open http://127.0.0.1:${BRIDGE_PORT} in browser to configure."
    dark "  Using BambuStudio AWAY from home? Open http://127.0.0.1:${BRIDGE_PORT} ->"
    dark "  settings -> Remote Bridge, and point it at your home Bridge (Tailscale)."
fi
echo ""
dark "  Bridge config: $BRIDGE_CONFIG_DIR/"
dark "  Bridge log: $BRIDGE_CONFIG_DIR/bridge.log"
echo ""
if [ "$BAMBU_MODE" = "appimage" ]; then
    yellow "  Note: AppImage profiles may not persist after BambuStudio restart."
    yellow "  For permanent installation, extract AppImage and re-run installer:"
    yellow "    ./${BAMBU_APPIMAGE##*/} --appimage-extract && ./install.sh"
    echo ""
fi
