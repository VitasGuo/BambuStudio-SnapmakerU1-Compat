#!/bin/bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGING_DIR="$ROOT_DIR/macos/Packaging"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"
CACHE_DIR="${CACHE_DIR:-$ROOT_DIR/.cache/macos-build}"

NODE_VERSION="22.23.1"
NODE_BASE_URL="https://nodejs.org/download/release/v${NODE_VERSION}"
NODE_ARM64_SHA256="ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953"
NODE_X86_64_SHA256="b8da981b8a0b1241b70249204916da76c63573ddf5814dbd2d1e41069105cb81"
MACOS_DEPLOYMENT_TARGET="11.0"

TMP_DIRS=()

cleanup() {
    local path
    for path in "${TMP_DIRS[@]:-}"; do
        if [[ -n "$path" && -d "$path" ]]; then
            rm -rf "$path"
        fi
    done
}
trap cleanup EXIT INT TERM

usage() {
    cat <<'EOF'
Usage: scripts/build-macos.sh arm64|x86_64|all

Builds architecture-specific macOS 11 applications and compressed DMGs in dist/.
The x86_64 build can be produced and verified through Rosetta on Apple Silicon.

Environment overrides:
  DIST_DIR=/path       Output directory (default: ./dist)
  CACHE_DIR=/path      Download/npm cache (default: ./.cache/macos-build)
EOF
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

log() {
    printf '[macOS build] %s\n' "$*"
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

sha256_file() {
    /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

verify_sha256() {
    local file="$1"
    local expected="$2"
    local actual
    actual="$(sha256_file "$file")"
    [[ "$actual" == "$expected" ]] || die "SHA-256 mismatch for $(basename "$file"): expected $expected, got $actual"
}

download_node_archive() {
    local arch="$1"
    local archive_name expected cache_path partial_path

    case "$arch" in
        arm64)
            archive_name="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
            expected="$NODE_ARM64_SHA256"
            ;;
        x86_64)
            archive_name="node-v${NODE_VERSION}-darwin-x64.tar.gz"
            expected="$NODE_X86_64_SHA256"
            ;;
        *) die "unsupported architecture: $arch" ;;
    esac

    mkdir -p "$CACHE_DIR/node"
    cache_path="$CACHE_DIR/node/$archive_name"
    partial_path="$cache_path.partial"

    if [[ -f "$cache_path" ]]; then
        if [[ "$(sha256_file "$cache_path")" == "$expected" ]]; then
            printf '%s\n' "$cache_path"
            return
        fi
        log "discarding cached Node archive with an invalid digest: $archive_name" >&2
        rm -f "$cache_path"
    fi

    log "downloading $archive_name" >&2
    rm -f "$partial_path"
    /usr/bin/curl --fail --location --retry 3 --retry-delay 2 \
        --output "$partial_path" "$NODE_BASE_URL/$archive_name"
    verify_sha256 "$partial_path" "$expected"
    mv "$partial_path" "$cache_path"
    printf '%s\n' "$cache_path"
}

compile_swift_component() {
    local arch="$1"
    local source_dir="$2"
    local module_name="$3"
    local output="$4"
    local sdk_path="$5"
    local source
    local sources=()

    [[ -d "$source_dir" ]] || die "missing Swift source directory: $source_dir"
    while IFS= read -r source; do
        sources+=("$source")
    done < <(find "$source_dir" -maxdepth 1 -type f -name '*.swift' -print | LC_ALL=C sort)
    [[ "${#sources[@]}" -gt 0 ]] || die "no Swift sources found in $source_dir"

    log "compiling $module_name for $arch"
    xcrun swiftc \
        -sdk "$sdk_path" \
        -target "${arch}-apple-macos${MACOS_DEPLOYMENT_TARGET}" \
        -parse-as-library \
        -O \
        -whole-module-optimization \
        -module-name "$module_name" \
        "${sources[@]}" \
        -framework AppKit \
        -framework SwiftUI \
        -framework ServiceManagement \
        -o "$output"
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

render_info_plist() {
    local arch="$1"
    local app_version="$2"
    local build_version="$3"
    local destination="$4"

    /usr/bin/sed \
        -e "s/__TARGET_ARCH__/$arch/g" \
        -e "s/__APP_VERSION__/$app_version/g" \
        -e "s/__BUILD_VERSION__/$build_version/g" \
        "$PACKAGING_DIR/Info.plist.in" > "$destination"
    /usr/bin/plutil -lint "$destination" >/dev/null
}

generate_app_icon() {
    local destination="$1"
    local source_png="$ROOT_DIR/Snapmaker/Snapmaker U1_cover.png"
    local icon_work iconset name size
    local specifications=(
        "icon_16x16.png:16"
        "icon_16x16@2x.png:32"
        "icon_32x32.png:32"
        "icon_32x32@2x.png:64"
        "icon_128x128.png:128"
        "icon_128x128@2x.png:256"
        "icon_256x256.png:256"
        "icon_256x256@2x.png:512"
        "icon_512x512.png:512"
        "icon_512x512@2x.png:1024"
    )

    [[ -f "$source_png" ]] || die "application icon source is missing: $source_png"
    icon_work="$(mktemp -d "${TMPDIR:-/tmp}/snapmaker-u1-icon.XXXXXX")"
    TMP_DIRS+=("$icon_work")
    iconset="$icon_work/AppIcon.iconset"
    mkdir -p "$iconset"

    log "generating AppIcon.icns from Snapmaker U1_cover.png"
    for specification in "${specifications[@]}"; do
        name="${specification%%:*}"
        size="${specification##*:}"
        /usr/bin/sips -z "$size" "$size" "$source_png" --out "$iconset/$name" >/dev/null
    done
    /usr/bin/iconutil -c icns "$iconset" -o "$destination"
}

run_target_npm_ci() {
    local arch="$1"
    local runtime="$2"
    local bridge_dir="$3"
    local node_bin="$runtime/bin/node"
    local npm_cli="$runtime/lib/node_modules/npm/bin/npm-cli.js"
    local npm_arch

    [[ -x "$node_bin" ]] || die "bundled Node executable is missing: $node_bin"
    [[ -f "$npm_cli" ]] || die "bundled npm CLI is missing: $npm_cli"
    if [[ "$arch" == "x86_64" ]]; then
        npm_arch="x64"
    else
        npm_arch="arm64"
    fi

    log "installing locked production dependencies for $arch"
    (
        cd "$bridge_dir"
        npm_config_arch="$npm_arch" \
        npm_config_platform="darwin" \
        "$node_bin" "$npm_cli" ci \
            --omit=dev \
            --ignore-scripts \
            --no-audit \
            --no-fund \
            --cache "$CACHE_DIR/npm"
    )
}

sign_app() {
    local app_path="$1"
    local main_binary="$app_path/Contents/MacOS/SnapmakerU1Bridge"
    local candidate

    log "applying ad-hoc signatures"
    while IFS= read -r candidate; do
        # codesign treats CFBundleExecutable as the enclosing app. Sign every
        # nested Mach-O first so cross-compiled, initially unsigned helpers do
        # not make signing the main executable fail.
        if [[ "$candidate" == "$main_binary" ]]; then
            continue
        fi
        if /usr/bin/file -b "$candidate" | /usr/bin/grep -q 'Mach-O'; then
            /usr/bin/codesign --force --sign - --timestamp=none "$candidate"
        fi
    done < <(list_macho_files "$app_path/Contents")
    /usr/bin/codesign --force --sign - --timestamp=none "$main_binary"
    /usr/bin/codesign --force --sign - --timestamp=none "$app_path"
}

create_dmg() {
    local arch="$1"
    local app_path="$2"
    local dmg_path="$3"
    local work_dir stage_dir temp_dmg volume_name

    work_dir="$(mktemp -d "${TMPDIR:-/tmp}/snapmaker-u1-dmg.XXXXXX")"
    TMP_DIRS+=("$work_dir")
    stage_dir="$work_dir/stage"
    temp_dmg="$work_dir/$(basename "$dmg_path")"
    volume_name="Snapmaker U1 Bridge $arch"

    mkdir -p "$stage_dir"
    /usr/bin/ditto "$app_path" "$stage_dir/$(basename "$app_path")"
    ln -s /Applications "$stage_dir/Applications"

    log "creating $(basename "$dmg_path")"
    /usr/bin/hdiutil create \
        -quiet \
        -ov \
        -fs HFS+ \
        -format UDZO \
        -imagekey zlib-level=9 \
        -volname "$volume_name" \
        -srcfolder "$stage_dir" \
        "$temp_dmg"
    mv "$temp_dmg" "$dmg_path"
}

write_checksums() {
    local checksum_file="$DIST_DIR/SHA256SUMS"
    local dmg
    local dmgs=()

    while IFS= read -r dmg; do
        dmgs+=("$dmg")
    done < <(find "$DIST_DIR" -maxdepth 1 -type f -name 'Snapmaker-U1-Bridge-*.dmg' -print | LC_ALL=C sort)

    : > "$checksum_file"
    for dmg in "${dmgs[@]:-}"; do
        if [[ -n "$dmg" ]]; then
            printf '%s  %s\n' "$(sha256_file "$dmg")" "$(basename "$dmg")" >> "$checksum_file"
            printf '%s  %s\n' "$(sha256_file "$dmg")" "$(basename "$dmg")" > "$dmg.sha256"
        fi
    done
}

build_arch() {
    local arch="$1"
    local app_version build_version sdk_path archive archive_root
    local work_dir extracted_dir app_path dmg_path contents payload bridge_payload

    app_version="$(/usr/bin/awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$ROOT_DIR/bridge-node/package.json")"
    [[ -n "$app_version" ]] || die "could not read app version from bridge-node/package.json"
    if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        build_version="$(git -C "$ROOT_DIR" rev-list --count HEAD)"
    else
        build_version="1"
    fi

    sdk_path="$(xcrun --sdk macosx --show-sdk-path)"
    archive="$(download_node_archive "$arch")"
    verify_sha256 "$archive" "$([[ "$arch" == "arm64" ]] && printf '%s' "$NODE_ARM64_SHA256" || printf '%s' "$NODE_X86_64_SHA256")"

    work_dir="$(mktemp -d "${TMPDIR:-/tmp}/snapmaker-u1-${arch}.XXXXXX")"
    TMP_DIRS+=("$work_dir")
    extracted_dir="$work_dir/node"
    mkdir -p "$extracted_dir"
    /usr/bin/tar -xzf "$archive" -C "$extracted_dir"
    archive_root="$(find "$extracted_dir" -mindepth 1 -maxdepth 1 -type d -print | head -n 1)"
    [[ -n "$archive_root" ]] || die "Node archive did not contain an expected top-level directory"

    mkdir -p "$DIST_DIR"
    app_path="$DIST_DIR/Snapmaker-U1-Bridge-${arch}.app"
    dmg_path="$DIST_DIR/Snapmaker-U1-Bridge-${arch}.dmg"
    rm -rf "$app_path"
    rm -f "$dmg_path" "$dmg_path.sha256"

    contents="$app_path/Contents"
    payload="$contents/Resources/Payload"
    bridge_payload="$payload/bridge-node"
    mkdir -p "$contents/MacOS" "$payload/runtime" "$payload/profiles"

    render_info_plist "$arch" "$app_version" "$build_version" "$contents/Info.plist"
    printf 'APPL????' > "$contents/PkgInfo"
    generate_app_icon "$contents/Resources/AppIcon.icns"

    compile_swift_component \
        "$arch" \
        "$ROOT_DIR/macos/Sources/SnapmakerU1Bridge" \
        "SnapmakerU1Bridge" \
        "$contents/MacOS/SnapmakerU1Bridge" \
        "$sdk_path"
    compile_swift_component \
        "$arch" \
        "$ROOT_DIR/macos/Sources/U1PrintDialog" \
        "SnapmakerU1DialogHelper" \
        "$contents/MacOS/SnapmakerU1DialogHelper" \
        "$sdk_path"

    /usr/bin/ditto "$archive_root" "$payload/runtime"
    /usr/bin/ditto "$ROOT_DIR/bridge-node" "$bridge_payload"
    rm -rf "$bridge_payload/node_modules" "$bridge_payload/dist" "$bridge_payload/test"
    rm -f "$bridge_payload/watchdog.ps1"
    [[ -f "$bridge_payload/package-lock.json" ]] || die "bridge-node/package-lock.json is required for reproducible npm ci"
    run_target_npm_ci "$arch" "$payload/runtime" "$bridge_payload"

    /usr/bin/ditto "$ROOT_DIR/bridge" "$payload/bridge"
    /usr/bin/ditto "$ROOT_DIR/Snapmaker.json" "$payload/profiles/Snapmaker.json"
    /usr/bin/ditto "$ROOT_DIR/Snapmaker" "$payload/profiles/Snapmaker"
    /usr/bin/ditto "$ROOT_DIR/LICENSE" "$contents/Resources/LICENSE.txt"

    find "$app_path" -name '.DS_Store' -delete
    /usr/bin/xattr -cr "$app_path" 2>/dev/null || true
    chmod -R u+rwX,go+rX "$app_path"
    chmod 755 "$contents/MacOS/SnapmakerU1Bridge" \
        "$contents/MacOS/SnapmakerU1DialogHelper" \
        "$payload/runtime/bin/node"

    sign_app "$app_path"
    "$SCRIPT_DIR/verify-macos.sh" "$arch" "$app_path"
    create_dmg "$arch" "$app_path" "$dmg_path"
    "$SCRIPT_DIR/verify-macos.sh" "$arch" "$dmg_path"

    log "completed $arch: $app_path"
    log "completed $arch: $dmg_path"
}

main() {
    local requested_arch="${1:-}"

    [[ "$(uname -s)" == "Darwin" ]] || die "macOS builds require a Darwin host"
    [[ $# -eq 1 ]] || { usage >&2; exit 2; }
    case "$requested_arch" in
        arm64|x86_64|all) ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; die "expected arm64, x86_64, or all" ;;
    esac

    for command_name in awk codesign curl ditto file find hdiutil iconutil otool plutil python3 sed shasum sips tar xattr xcrun; do
        require_command "$command_name"
    done
    [[ -f "$PACKAGING_DIR/Info.plist.in" ]] || die "missing Info.plist template"
    [[ -f "$ROOT_DIR/bridge-node/package-lock.json" ]] || die "bridge-node/package-lock.json is missing"

    if [[ "$requested_arch" == "all" ]]; then
        build_arch arm64
        build_arch x86_64
    else
        build_arch "$requested_arch"
    fi
    write_checksums

    log "SHA-256 manifest: $DIST_DIR/SHA256SUMS"
}

main "$@"
