#!/bin/bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXPECTED_VERSION="02.07.01.62"
WORK_DIR=""

cleanup() {
    if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
        if [[ "${KEEP_TEMP:-0}" == "1" ]]; then
            printf '[profile verify] kept temporary files: %s\n' "$WORK_DIR" >&2
        else
            rm -rf "$WORK_DIR"
        fi
    fi
}
trap cleanup EXIT INT TERM

usage() {
    cat <<'EOF'
Usage: scripts/verify-bambustudio-profile.sh /path/to/BambuStudio.app

Runs a real Bambu Studio 2.7.1.62 CLI slice against the repository's Snapmaker
U1 machine, 0.20 Standard process, and PLA Basic profiles. All merged settings
and slicing output are written to a temporary directory.

Set KEEP_TEMP=1 to retain the temporary settings, logs, result.json and G-code.
EOF
}

die() {
    printf 'error: %s\n' "$*" >&2
    if [[ -n "$WORK_DIR" && -f "$WORK_DIR/stderr.log" ]]; then
        printf '%s\n' '--- Bambu Studio stderr (last 40 lines) ---' >&2
        tail -n 40 "$WORK_DIR/stderr.log" >&2 || true
    fi
    exit 1
}

log() {
    printf '[profile verify] %s\n' "$*"
}

require_file() {
    [[ -f "$1" ]] || die "required file not found: $1"
}

merge_json() {
    local destination="$1"
    shift

    /usr/bin/python3 - "$destination" "$@" <<'PY'
import json
import pathlib
import sys


def deep_merge(base, overlay):
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base


destination = pathlib.Path(sys.argv[1])
merged = {}
for source_name in sys.argv[2:]:
    with pathlib.Path(source_name).open("r", encoding="utf-8") as source:
        value = json.load(source)
    if not isinstance(value, dict):
        raise SystemExit(f"profile is not a JSON object: {source_name}")
    deep_merge(merged, value)

for transient_key in ("inherits", "instantiation", "setting_id"):
    merged.pop(transient_key, None)
merged["from"] = "system"

with destination.open("w", encoding="utf-8") as output:
    json.dump(merged, output, ensure_ascii=False, indent=2, sort_keys=True)
    output.write("\n")
PY
}

assert_json_return_code() {
    /usr/bin/python3 - "$1" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
with path.open("r", encoding="utf-8") as source:
    result = json.load(source)
if result.get("return_code") != 0:
    raise SystemExit(f"result.json return_code is {result.get('return_code')!r}, expected 0")
PY
}

main() {
    local app_path="${1:-}"
    local binary model version
    local settings_dir output_dir machine_json process_json filament_json
    local result_json gcode cli_status

    [[ $# -eq 1 ]] || { usage >&2; exit 2; }
    if [[ "$app_path" == "-h" || "$app_path" == "--help" ]]; then
        usage
        exit 0
    fi
    [[ "$app_path" == *.app ]] || die "argument must be a BambuStudio.app bundle"
    [[ -d "$app_path" ]] || die "Bambu Studio app not found: $app_path"

    binary="$app_path/Contents/MacOS/BambuStudio"
    model="$app_path/Contents/Resources/model/rounded_rectangle.stl"
    require_file "$binary"
    require_file "$model"
    [[ -x "$binary" ]] || die "Bambu Studio executable is not executable: $binary"

    version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist" 2>/dev/null || true)"
    case "$version" in
        02.07.01.62|2.7.1.62) ;;
        *) die "Bambu Studio 2.7.1.62 is required; bundle reports ${version:-unknown}" ;;
    esac

    for source in \
        "$ROOT_DIR/Snapmaker/machine/fdm_machine_common.json" \
        "$ROOT_DIR/Snapmaker/machine/Snapmaker U1 (0.4 nozzle).json" \
        "$ROOT_DIR/Snapmaker/process/fdm_process_common.json" \
        "$ROOT_DIR/Snapmaker/process/fdm_process_U1_0.20.json" \
        "$ROOT_DIR/Snapmaker/process/0.20 Standard @Snapmaker U1.json" \
        "$ROOT_DIR/Snapmaker/filament/fdm_filament_common.json" \
        "$ROOT_DIR/Snapmaker/filament/fdm_filament_pla.json" \
        "$ROOT_DIR/Snapmaker/filament/Snapmaker PLA Basic @U1.json"; do
        require_file "$source"
    done

    WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/snapmaker-u1-profile.XXXXXX")"
    settings_dir="$WORK_DIR/settings"
    output_dir="$WORK_DIR/output"
    mkdir -p "$settings_dir" "$output_dir"
    machine_json="$settings_dir/machine.json"
    process_json="$settings_dir/process.json"
    filament_json="$settings_dir/filament.json"

    merge_json "$machine_json" \
        "$ROOT_DIR/Snapmaker/machine/fdm_machine_common.json" \
        "$ROOT_DIR/Snapmaker/machine/Snapmaker U1 (0.4 nozzle).json"
    merge_json "$process_json" \
        "$ROOT_DIR/Snapmaker/process/fdm_process_common.json" \
        "$ROOT_DIR/Snapmaker/process/fdm_process_U1_0.20.json" \
        "$ROOT_DIR/Snapmaker/process/0.20 Standard @Snapmaker U1.json"
    merge_json "$filament_json" \
        "$ROOT_DIR/Snapmaker/filament/fdm_filament_common.json" \
        "$ROOT_DIR/Snapmaker/filament/fdm_filament_pla.json" \
        "$ROOT_DIR/Snapmaker/filament/Snapmaker PLA Basic @U1.json"

    log "slicing rounded_rectangle.stl with Bambu Studio $version"
    set +e
    "$binary" \
        --load-settings "$machine_json;$process_json" \
        --load-filaments "$filament_json" \
        --slice 0 \
        --outputdir "$output_dir" \
        "$model" \
        >"$WORK_DIR/stdout.log" 2>"$WORK_DIR/stderr.log"
    cli_status=$?
    set -e
    [[ "$cli_status" -eq 0 ]] || die "Bambu Studio CLI exited with status $cli_status"

    result_json="$output_dir/result.json"
    gcode="$output_dir/plate_1.gcode"
    require_file "$result_json"
    require_file "$gcode"
    assert_json_return_code "$result_json" || die "Bambu Studio reported a failed slice"

    /usr/bin/grep -Fq '; BambuStudio 02.07.01.62' "$gcode" || die "G-code does not identify Bambu Studio 02.07.01.62"
    /usr/bin/grep -Fq 'PRINT_START' "$gcode" || die "G-code does not contain PRINT_START"
    /usr/bin/grep -Fq 'CONFIG_BLOCK_START' "$gcode" || die "G-code does not contain CONFIG_BLOCK_START"
    /usr/bin/grep -Fq 'CONFIG_BLOCK_END' "$gcode" || die "G-code does not contain CONFIG_BLOCK_END"
    /usr/bin/grep -Fq 'default_filament_profile = "Snapmaker PLA Basic @U1"' "$gcode" || die "G-code does not contain the expected Snapmaker default filament profile"

    log "passed: result return_code=0 and required Snapmaker markers are present"
    log "G-code: $gcode"
}

main "$@"
