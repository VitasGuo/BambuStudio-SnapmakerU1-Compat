#!/bin/bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"
EXPECTED_NODE_VERSION="v22.23.1"
MOUNT_POINTS=()

cleanup() {
    local mount_point
    for mount_point in "${MOUNT_POINTS[@]:-}"; do
        if [[ -n "$mount_point" && -d "$mount_point" ]]; then
            /usr/bin/hdiutil detach -quiet "$mount_point" 2>/dev/null || true
            rmdir "$mount_point" 2>/dev/null || true
        fi
    done
}
trap cleanup EXIT INT TERM

usage() {
    cat <<'EOF'
Usage: scripts/verify-macos.sh arm64|x86_64 [path-to-app-or-dmg]
       scripts/verify-macos.sh all

With no path, verifies dist/Snapmaker-U1-Bridge-ARCH.app and its DMG if present.
Verification covers Mach-O architecture/minimum OS, signatures, Info.plist,
the bundled Node runtime, production dependencies, web assets, and profiles.
EOF
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

log() {
    printf '[macOS verify] %s\n' "$*"
}

plist_value() {
    /usr/libexec/PlistBuddy -c "Print :$2" "$1"
}

list_macho_files() {
    /usr/bin/python3 - "$1" <<'PY'
import os
import sys

magics = {
    b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe",
    b"\xfe\xed\xfa\xcf", b"\xcf\xfa\xed\xfe",
    b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca",
    b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca",
}
for root, directories, files in os.walk(sys.argv[1]):
    directories.sort()
    files.sort()
    for name in files:
        path = os.path.join(root, name)
        try:
            with open(path, "rb") as source:
                magic = source.read(4)
        except OSError:
            continue
        if magic in magics:
            print(path)
PY
}

assert_single_arch() {
    local binary="$1"
    local expected_arch="$2"
    local description architectures

    description="$(/usr/bin/file -b "$binary")"
    printf '  file %s: %s\n' "${binary##*/}" "$description"
    printf '%s' "$description" | /usr/bin/grep -q 'Mach-O' || die "not a Mach-O executable: $binary"
    architectures="$(/usr/bin/lipo -archs "$binary")"
    [[ "$architectures" == "$expected_arch" ]] || die "wrong architecture in $binary: expected only $expected_arch, got $architectures"
}

assert_macos_11_target() {
    local binary="$1"
    local min_version

    min_version="$(/usr/bin/otool -l "$binary" | /usr/bin/awk '
        $1 == "cmd" && $2 == "LC_BUILD_VERSION" { build = 1; next }
        build && $1 == "minos" { print $2; exit }
        $1 == "cmd" && $2 == "LC_VERSION_MIN_MACOSX" { legacy = 1; next }
        legacy && $1 == "version" { print $2; exit }
    ')"
    [[ "$min_version" == "11.0" || "$min_version" == "11.0.0" ]] || die "unexpected minimum macOS version for $binary: ${min_version:-missing}; expected 11.0"
}

run_node_smoke() {
    local arch="$1"
    local node_bin="$2"
    local result

    if [[ "$(uname -m)" == "arm64" && "$arch" == "x86_64" ]]; then
        /usr/sbin/pkgutil --pkg-info com.apple.pkg.RosettaUpdateAuto >/dev/null 2>&1 || die "Rosetta 2 is required to smoke-test the x86_64 package on Apple Silicon"
        result="$(/usr/bin/arch -x86_64 "$node_bin" -p 'process.version + ":" + process.arch')"
        [[ "$result" == "$EXPECTED_NODE_VERSION:x64" ]] || die "x86_64 Node Rosetta smoke failed: $result"
        log "Rosetta smoke passed: $result"
    elif [[ "$(uname -m)" == "$arch" ]]; then
        result="$($node_bin -p 'process.version + ":" + process.arch')"
        [[ "$result" == "$EXPECTED_NODE_VERSION:$arch" ]] || die "Node smoke failed: $result"
        log "native Node smoke passed: $result"
    else
        log "execution smoke skipped: host $(uname -m) cannot run $arch"
    fi
}

assert_self_test_json() {
    /usr/bin/python3 -c '
import json
import sys
value = json.loads(sys.argv[1])
if value.get("ok") is not True:
    raise SystemExit(f"self-test did not report ok=true: {value!r}")
' "$1"
}

run_app_smoke() {
    local arch="$1"
    local app_binary="$2"
    local result

    if [[ "$(uname -m)" == "arm64" && "$arch" == "x86_64" ]]; then
        /usr/sbin/pkgutil --pkg-info com.apple.pkg.RosettaUpdateAuto >/dev/null 2>&1 || die "Rosetta 2 is required to smoke-test the x86_64 application on Apple Silicon"
        result="$(/usr/bin/arch -x86_64 "$app_binary" --self-test)"
        assert_self_test_json "$result" || die "x86_64 application Rosetta self-test returned invalid JSON: $result"
        log "application Rosetta self-test passed: $result"
    elif [[ "$(uname -m)" == "$arch" ]]; then
        result="$($app_binary --self-test)"
        assert_self_test_json "$result" || die "application self-test returned invalid JSON: $result"
        log "application native self-test passed: $result"
    else
        log "application execution smoke skipped: host $(uname -m) cannot run $arch"
    fi
}

verify_info_plist() {
    local plist="$1"
    local arch="$2"
    local bonjour

    /usr/bin/plutil -lint "$plist" >/dev/null || die "invalid Info.plist"
    [[ "$(plist_value "$plist" CFBundleExecutable)" == "SnapmakerU1Bridge" ]] || die "unexpected CFBundleExecutable"
    [[ "$(plist_value "$plist" CFBundleIdentifier)" == "com.snapmaker.u1bridge" ]] || die "unexpected bundle identifier"
    [[ "$(plist_value "$plist" CFBundleIconFile)" == "AppIcon" ]] || die "CFBundleIconFile must reference AppIcon"
    [[ "$(plist_value "$plist" LSMinimumSystemVersion)" == "11.0" ]] || die "LSMinimumSystemVersion must be 11.0"
    [[ "$(plist_value "$plist" SnapmakerU1TargetArchitecture)" == "$arch" ]] || die "Info.plist architecture guard does not match $arch"
    [[ "$(plist_value "$plist" SnapmakerU1NodeVersion)" == "22.23.1" ]] || die "unexpected bundled Node version declaration"
    [[ -n "$(plist_value "$plist" NSLocalNetworkUsageDescription)" ]] || die "local network usage description is missing"
    bonjour="$(plist_value "$plist" NSBonjourServices)"
    printf '%s' "$bonjour" | /usr/bin/grep -q '_snapmaker\._tcp' || die "_snapmaker._tcp Bonjour service is missing"
}

verify_payload() {
    local app_path="$1"
    local payload="$app_path/Contents/Resources/Payload"
    local required

    for required in \
        "$payload/runtime/bin/node" \
        "$payload/runtime/lib/node_modules/npm/bin/npm-cli.js" \
        "$payload/bridge-node/server.js" \
        "$payload/bridge-node/dialog.js" \
        "$payload/bridge-node/local_access.js" \
        "$payload/bridge-node/moonraker_auth.js" \
        "$payload/bridge-node/proxy_headers.js" \
        "$payload/bridge-node/paths.js" \
        "$payload/bridge-node/print_job.js" \
        "$payload/bridge-node/bridge_status.js" \
        "$payload/bridge-node/slice_agent.js" \
        "$payload/bridge-node/aiClient.js" \
        "$payload/bridge-node/package.json" \
        "$payload/bridge-node/package-lock.json" \
        "$payload/bridge-node/node_modules/express/package.json" \
        "$payload/bridge-node/node_modules/bonjour-service/package.json" \
        "$payload/bridge-node/node_modules/http-proxy-middleware/package.json" \
        "$payload/bridge/web/webui.html" \
        "$payload/bridge/web/ailab.js" \
        "$payload/profiles/Snapmaker.json" \
        "$payload/profiles/Snapmaker/machine/Snapmaker U1.json"; do
        [[ -e "$required" ]] || die "required payload item is missing: $required"
    done

    [[ -s "$app_path/Contents/Resources/AppIcon.icns" ]] || die "AppIcon.icns is missing or empty"

    [[ ! -e "$payload/bridge-node/node_modules/esbuild" ]] || die "development dependency esbuild leaked into production payload"
    [[ ! -d "$payload/bridge-node/test" ]] || die "bridge tests leaked into production payload"
}

verify_all_macho() {
    local app_path="$1"
    local arch="$2"
    local candidate

    while IFS= read -r candidate; do
        if /usr/bin/file -b "$candidate" | /usr/bin/grep -q 'Mach-O'; then
            assert_single_arch "$candidate" "$arch"
        fi
    done < <(list_macho_files "$app_path/Contents")
}

verify_app() {
    local arch="$1"
    local app_path="$2"
    local main_binary="$app_path/Contents/MacOS/SnapmakerU1Bridge"
    local helper_binary="$app_path/Contents/MacOS/SnapmakerU1DialogHelper"
    local node_binary="$app_path/Contents/Resources/Payload/runtime/bin/node"

    [[ -d "$app_path" ]] || die "application not found: $app_path"
    log "verifying $app_path"
    verify_info_plist "$app_path/Contents/Info.plist" "$arch"
    verify_payload "$app_path"

    assert_single_arch "$main_binary" "$arch"
    assert_single_arch "$helper_binary" "$arch"
    assert_single_arch "$node_binary" "$arch"
    assert_macos_11_target "$main_binary"
    assert_macos_11_target "$helper_binary"
    assert_macos_11_target "$node_binary"
    verify_all_macho "$app_path" "$arch"

    /usr/bin/codesign --verify --deep --strict --verbose=2 "$app_path"
    run_app_smoke "$arch" "$main_binary"
    run_node_smoke "$arch" "$node_binary"
    log "passed: $app_path"
}

verify_dmg() {
    local arch="$1"
    local dmg_path="$2"
    local mount_point app_path

    [[ -f "$dmg_path" ]] || die "DMG not found: $dmg_path"
    /usr/bin/hdiutil verify -quiet "$dmg_path" || die "DMG integrity verification failed: $dmg_path"
    mount_point="$(mktemp -d "${TMPDIR:-/tmp}/snapmaker-u1-verify.XXXXXX")"
    MOUNT_POINTS+=("$mount_point")
    /usr/bin/hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mount_point" "$dmg_path"
    app_path="$(find "$mount_point" -maxdepth 1 -type d -name '*.app' -print | head -n 1)"
    [[ -n "$app_path" ]] || die "DMG does not contain an application"
    [[ "$(basename "$app_path")" == "Snapmaker-U1-Bridge-${arch}.app" ]] || die "DMG contains an unexpectedly named application: $(basename "$app_path")"
    [[ -L "$mount_point/Applications" ]] || die "DMG is missing the Applications shortcut"
    verify_app "$arch" "$app_path"
    /usr/bin/hdiutil detach -quiet "$mount_point"
    rmdir "$mount_point" 2>/dev/null || true
    MOUNT_POINTS=()
    log "passed: $dmg_path"
}

verify_one() {
    local arch="$1"
    local supplied_path="${2:-}"
    local default_app="$DIST_DIR/Snapmaker-U1-Bridge-${arch}.app"
    local default_dmg="$DIST_DIR/Snapmaker-U1-Bridge-${arch}.dmg"

    if [[ -n "$supplied_path" ]]; then
        case "$supplied_path" in
            *.app) verify_app "$arch" "$supplied_path" ;;
            *.dmg) verify_dmg "$arch" "$supplied_path" ;;
            *) die "verification path must end in .app or .dmg" ;;
        esac
        return
    fi

    verify_app "$arch" "$default_app"
    if [[ -f "$default_dmg" ]]; then
        verify_dmg "$arch" "$default_dmg"
    fi
}

main() {
    local arch="${1:-}"
    local supplied_path="${2:-}"

    [[ "$(uname -s)" == "Darwin" ]] || die "macOS verification requires a Darwin host"
    [[ $# -ge 1 && $# -le 2 ]] || { usage >&2; exit 2; }
    case "$arch" in
        arm64|x86_64) verify_one "$arch" "$supplied_path" ;;
        all)
            [[ $# -eq 1 ]] || die "the all mode does not accept a custom path"
            verify_one arm64
            verify_one x86_64
            ;;
        -h|--help) usage ;;
        *) usage >&2; die "expected arm64, x86_64, or all" ;;
    esac
}

main "$@"
