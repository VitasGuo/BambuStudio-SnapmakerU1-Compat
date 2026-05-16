import json
import os
import sys

U1_DIR = r"c:\Users\VitasGuo\Documents\SOLO\3D-printer\BambuStudio-SnapmakerU1-Compat\Snapmaker\filament"
BBL_DIR = r"C:\Program Files\Bambu Studio\resources\profiles\BBL\filament"

KEY_PARAMS = [
    "nozzle_temperature",
    "nozzle_temperature_initial_layer",
    "hot_plate_temp",
    "hot_plate_temp_initial_layer",
    "cool_plate_temp",
    "cool_plate_temp_initial_layer",
    "eng_plate_temp",
    "eng_plate_temp_initial_layer",
    "textured_plate_temp",
    "textured_plate_temp_initial_layer",
    "fan_max_speed",
    "fan_min_speed",
    "overhang_fan_speed",
    "overhang_fan_threshold",
    "filament_max_volumetric_speed",
    "filament_flow_ratio",
    "enable_pressure_advance",
    "pressure_advance",
    "filament_retraction_length",
    "slow_down_layer_time",
    "slow_down_min_speed",
    "temperature_vitrification",
    "filament_density",
    "filament_cost",
    "additional_cooling_fan_speed",
    "filament_type",
    "reduce_fan_stop_start_freq",
    "close_fan_the_first_x_layers",
    "close_additional_fan_first_x_layers",
    "fan_cooling_layer_time",
    "filament_retract_length_toolchange",
    "filament_retract_restart_extra",
    "filament_z_hop",
    "filament_retraction_speed",
    "filament_deretraction_speed",
    "filament_minimal_purge_on_wipe_tower",
    "nozzle_temperature_range_low",
    "nozzle_temperature_range_high",
    "filament_preheat_temperature_delta",
    "required_nozzle_HRC",
    "filament_adhesiveness_category",
    "supertack_plate_temp",
    "supertack_plate_temp_initial_layer",
]

PLA_NAMES = [
    "Bambu PLA Basic",
    "Bambu PLA Matte",
    "Bambu PLA Silk",
    "Bambu PLA Silk+",
    "Bambu PLA Dynamic",
    "Bambu PLA Galaxy",
    "Bambu PLA Glow",
    "Bambu PLA Lite",
    "Bambu PLA Marble",
    "Bambu PLA Metal",
    "Bambu PLA Sparkle",
    "Bambu PLA Tough",
    "Bambu PLA Tough+",
    "Bambu PLA Aero",
    "Bambu PLA Wood",
    "Bambu PLA-CF",
]

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def resolve_inheritance_chain(base_dir, filename, cache=None):
    if cache is None:
        cache = {}
    if filename in cache:
        return cache[filename]
    path = os.path.join(base_dir, filename + ".json")
    if not os.path.exists(path):
        cache[filename] = {}
        return {}
    data = load_json(path)
    parent_name = data.get("inherits", "")
    if parent_name:
        parent_data = resolve_inheritance_chain(base_dir, parent_name, cache)
    else:
        parent_data = {}
    merged = dict(parent_data)
    for k, v in data.items():
        if k in ("type", "name", "from", "instantiation", "inherits", "compatible_printers", "compatible_printers_condition", "setting_id", "filament_id"):
            continue
        merged[k] = v
    cache[filename] = merged
    return merged

def get_val(d, key):
    v = d.get(key, None)
    if v is None:
        return "—"
    if isinstance(v, list):
        return v[0] if len(v) == 1 else str(v)
    return str(v)

def compare_values(bbl_val, u1_val):
    if bbl_val == "—" and u1_val == "—":
        return "—"
    if bbl_val == u1_val:
        return "✅"
    try:
        bf = float(bbl_val)
        uf = float(u1_val)
        if abs(bf - uf) < 0.001:
            return "✅"
        return f"⚠️ ({uf - bf:+.2f})" if bf != 0 else "⚠️"
    except (ValueError, TypeError):
        return "⚠️"

bbl_cache = {}
u1_cache = {}

results = {}

for name in PLA_NAMES:
    u1_file = name + " @U1"
    bbl_a1_file = name + " @BBL A1"
    bbl_base_file = name + " @base"

    u1_effective = resolve_inheritance_chain(U1_DIR, u1_file, u1_cache)
    bbl_a1_effective = resolve_inheritance_chain(BBL_DIR, bbl_a1_file, bbl_cache)

    results[name] = {
        "u1": u1_effective,
        "bbl_a1": bbl_a1_effective,
    }

print("=" * 120)
print("Bambu PLA 系列 @U1 vs @BBL A1 参数对比")
print("=" * 120)

all_diffs = {}

for name in PLA_NAMES:
    u1 = results[name]["u1"]
    bbl = results[name]["bbl_a1"]

    print(f"\n## {name}")
    print(f"| 参数 | BBL A1 有效值 | @U1 有效值 | 差异 |")
    print(f"|------|-------------|-----------|------|")

    has_diff = False
    for param in KEY_PARAMS:
        bbl_val = get_val(bbl, param)
        u1_val = get_val(u1, param)
        diff = compare_values(bbl_val, u1_val)
        if diff != "✅" and diff != "—":
            has_diff = True
            if param not in all_diffs:
                all_diffs[param] = []
            all_diffs[param].append({
                "filament": name,
                "bbl": bbl_val,
                "u1": u1_val,
                "diff": diff,
            })
        print(f"| {param} | {bbl_val} | {u1_val} | {diff} |")

    if not has_diff:
        print(f"\n> ✅ 所有关键参数一致")

print("\n\n" + "=" * 120)
print("差异汇总")
print("=" * 120)

if not all_diffs:
    print("\n✅ 所有 PLA 系列耗材的所有关键参数完全一致！")
else:
    for param, diffs in sorted(all_diffs.items()):
        print(f"\n### {param}")
        print(f"| 耗材 | BBL A1 | @U1 | 差异 |")
        print(f"|------|--------|-----|------|")
        for d in diffs:
            print(f"| {d['filament']} | {d['bbl']} | {d['u1']} | {d['diff']} |")

    print(f"\n\n共 {len(all_diffs)} 个参数存在差异，涉及 {sum(len(v) for v in all_diffs.values())} 处")
