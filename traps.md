# BambuStudio 第三方打印机适配踩坑记录

## 1. 跨厂商继承不支持

**现象**：Snapmaker vendor 的耗材文件设置 `"inherits": "fdm_filament_pla"`（BBL 的 base 文件），加载报错 "Can not find inherits"。

**根因**：BambuStudio 的 `load_vendor_configs_from_json`（PresetBundle.cpp:4736-4751）使用 `config_maps.find(inherits)` 查找继承目标，`config_maps` 是厂商内部的映射表，只包含当前 vendor 已加载的配置。跨厂商查找永远失败。

**解决方案**：在每个 vendor 目录下创建完整的 base 配置文件（`fdm_filament_common.json`、`fdm_filament_pla.json` 等），耗材文件只继承同 vendor 内的 base。

---

## 2. filament_list 加载顺序至关重要

**现象**：`Bambu PLA Basic @U1.json`（inherits `fdm_filament_pla`）排在 `fdm_filament_pla.json` 前面，加载报错 "Can not find inherits: fdm_filament_pla"。

**根因**：BambuStudio 按 `filament_list` 数组顺序逐个加载文件。如果子文件的 `inherits` 目标尚未加载到 `config_maps`，加载立即失败。

**解决方案**：`filament_list` 必须按依赖拓扑排序——base 文件在前，派生文件在后。具体顺序：`fdm_filament_common` → `fdm_filament_pet/pla/tpu/abs` → 具体 `@U1` 耗材文件。

**注意**：自动生成脚本如果用字母排序，`fdm_filament_abs` 会排在 `fdm_filament_common` 前面（a < c），导致加载失败。必须用拓扑排序。

---

## 3. PowerShell ConvertTo-Json 生成的 JSON 有坑

**现象**：批量生成的耗材 JSON 文件出现三种格式错误：
- 尾部逗号（3 个文件：PPA-CF、PHA、PP）
- `filament_start_gcode` / `filament_end_gcode` 包含换行符导致 JSON 解析失败
- 缺少 `setting_id` 字段

**根因**：PowerShell 的 `ConvertTo-Json` 对字符串中的换行符处理不当，且无法控制尾部逗号。`@base` 文件本身没有 `setting_id`，直接复制会遗漏。

**解决方案**：改用 StringBuilder 手动构建 JSON，逐行拼接，精确控制逗号和格式。`setting_id` 从 `filament_id` 自动生成（如 `GFB00_U1_00`）。

---

## 4. AppConfig filaments 缓存控制耗材可见性（最关键的坑）

**现象**：80 个耗材文件全部正确加载（无报错），但 BambuStudio 只显示 2 个可用耗材。其余耗材要么在"不支持"列表，要么完全不可见（连不支持列表都没有）。

**根因**：BambuStudio 的耗材可见性由 `BambuStudio.conf` 的 `filaments` 数组控制（而非文件是否存在）。核心逻辑在 `PresetBundle::load_installed_filaments`（PresetBundle.cpp:1864-1924）：

1. 遍历所有可见打印机
2. 检查 AppConfig 的 `filaments` 段中是否已有任何兼容耗材
3. **如果已有 → `add_default_materials = false` → 跳过添加默认耗材**
4. 如果没有 → 从 `printer_model->default_materials` 添加所有默认耗材
5. 调用 `set_visible_from_appconfig`：只有 filaments 缓存中存在的耗材才设为可见

只要缓存中有 **一个** 兼容耗材（如 `"Snapmaker PLA @U1"`），BambuStudio 就认为该打印机"已有耗材"，不再添加其余 79 个。

**解决方案**：install 脚本必须正确清理 `BambuStudio.conf` 的 `filaments` 数组中所有 `@U1` 和 `Snapmaker` 条目，使 `add_default_materials` 在下次启动时重新运行。

**为什么之前的正则清理无效**：`filaments` 段是 JSON 数组格式 `["name1", "name2"]`，而正则 `"[^"]*@U1":\s*"[^"]*"` 匹配的是 key-value 格式 `"key": "value"`，根本匹配不到数组元素。

**修复**：改用 `ConvertFrom-Json` / `ConvertTo-Json` 进行 JSON 感知的清理，精确删除数组中的目标条目。

---

## 5. compatible_printers_condition 不可靠

**现象**：使用 `compatible_printers_condition: "printer_model == 'Snapmaker U1'"` 的耗材全部显示为"不支持"。

**根因**：BBL 官方耗材全部使用 `compatible_printers: ["printer name"]` 列表格式，从不使用 `compatible_printers_condition`。PlaceholderParser 对条件表达式的求值可能不正确。

**解决方案**：改用 `compatible_printers: ["Snapmaker U1 (0.4 nozzle)"]` 列表格式，与 BBL 官方做法一致。

---

## 6. 厂商匹配检查导致跨厂商耗材不兼容

**现象**：即使 `compatible_printers` 列表包含正确的打印机名，BBL 厂商的耗材仍对 Snapmaker 打印机显示"不支持"。

**根因**：`is_compatible_with_printer`（Preset.cpp:731-733）的第一行检查：
```cpp
if (preset.vendor != nullptr && preset.vendor != active_printer.vendor)
    return false;
```
如果耗材的 vendor 与当前打印机的 vendor 不同，直接返回不兼容，**不看 compatible_printers 列表**。

**解决方案**：所有 @U1 耗材文件都放在 Snapmaker vendor 目录下，使其 vendor 为 Snapmaker（与 U1 打印机相同）。

---

## 7. install 脚本删除 models 段导致需要两次重启

**现象**：install 脚本删除了 `BambuStudio.conf` 中 `models` 段的 Snapmaker U1 条目。重启后打印机不可见，用户需重新添加打印机，再重启一次才能触发 `add_default_materials`。

**根因**：`load_installed_filaments` 只处理 `is_visible` 的打印机。打印机可见性由 AppConfig 的 `models` 段决定。删除 models 条目 → 打印机不可见 → `add_default_materials` 不运行。

**解决方案**：install 脚本保留 `models` 段中的 Snapmaker U1 条目（不删除），只清理 `filaments` 缓存数组。这样重启后打印机仍然可见，`add_default_materials` 立即运行，一次重启即可。

---

## 8. system 缓存目录需要先删再拷

**现象**：`Copy-Item -Recurse` 向已有目录拷贝时，不会替换已有文件，而是在子目录内嵌套创建新目录。

**根因**：PowerShell 的 `Copy-Item` 在目标目录已存在时，会将源目录作为子目录拷贝进去，而非覆盖。

**解决方案**：拷贝前先 `Remove-Item -Recurse -Force` 删除目标目录。

---

## 9. user/default 目录残留用户预设

**现象**：卸载后重新安装，BambuStudio 仍显示旧的 Snapmaker 用户预设副本。

**根因**：BambuStudio 在用户添加 LAN/OctoPrint 连接时，会在 `%APPDATA%\BambuStudioBeta\user\default` 创建用户预设副本。这些副本不会随 system 目录一起清理。

**解决方案**：install/uninstall 脚本都扫描 `user\default` 目录，删除包含 "Snapmaker" 或 "@U1" 的 JSON 文件。

---

## 10. BambuStudio.conf 写入时机

**现象**：install 脚本修改了 BambuStudio.conf，但下次打开 BambuStudio 时修改被覆盖。

**根因**：BambuStudio 在退出时会将当前配置写回 BambuStudio.conf，覆盖任何外部修改。

**解决方案**：install/uninstall 脚本在开头检查 BambuStudio 进程是否在运行，如果运行则拒绝执行。

---

## 11. 缺少 filament_vendor 导致品牌归类错误

**现象**：Bambu PPA-CF、Generic PLA 等耗材在 BambuStudio 中被归类到 Snapmaker 品牌下，而非各自的正确品牌。

**根因**：批量生成脚本只给部分文件添加了 `filament_vendor` 字段。当 `filament_vendor` 缺失时，BambuStudio 默认使用文件所在 vendor 目录的名称（Snapmaker），导致所有 @U1 文件都显示为 Snapmaker 品牌。

**解决方案**：为所有 @U1 耗材文件添加 `filament_vendor` 字段：
- Bambu 系列：`"filament_vendor": ["Bambu Lab"]`
- Generic 系列：`"filament_vendor": ["Generic"]`
- Snapmaker 系列：`"filament_vendor": ["Snapmaker"]`

**注意**：`filament_vendor` 是数组格式 `["value"]`，不是字符串 `"value"`。这与 BambuStudio 的其他配置字段格式一致。
