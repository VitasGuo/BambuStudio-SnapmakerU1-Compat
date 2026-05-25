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

---

## 12. 换色时喷头温度不够导致停机（最危险）

**现象**：多色打印时，第一次换喷头报"温度不够"直接停止。单色打印正常。

**根因**：`change_filament_gcode` 为空。BambuStudio 默认的换色流程只发出 `T{n}` 命令切换喷头，不会等待新喷头达到目标温度。而 start gcode 中 `M104 S0 T0 A0` 等命令把非活跃喷头设为 0°C（完全关闭），换色时新喷头是冰冷的，Klipper 固件检测到温度不够就报错停机。

**Orca 的正确做法**（对比参考）：
1. 提前 30 秒发出 `M104 S220 T3` 开始预热下一个喷头
2. 换色时先 `M109 S220 T3` **等待**温度到位
3. 确认温度后才发出 `T3` 切换命令
4. 切换后执行 `SM_PRINT_PREEXTRUDE_FILAMENT INDEX=3` 预挤出
5. 旧喷头冷却到 70°C（`M104 S70 T0`）

**修复内容**：
1. 填写 `change_filament_gcode`，包含 M109 等待温度 + T 切换 + SM_PRINT_PREEXTRUDE_FILAMENT
2. 设置 `standby_temperature_delta: -150`（待机喷头降温到 70°C，与 Orca 一致）
3. 设置 `filament_preheat_temperature_delta: -50`（BambuStudio 在换色前提前预热下一个喷头）

**change_filament_gcode 内容**：
```
M104 S70 T{previous_extruder} ; cooldown previous extruder
G91
G1 Z1.5 F1800
G90
G1 F21000
M109 S{new_filament_temp} T{next_extruder}
M400
T{next_extruder}
SM_PRINT_PREEXTRUDE_FILAMENT INDEX={next_extruder}
G90
M104 S{new_filament_temp} T{next_extruder} ; ensure target temp
```

**关键变量说明**：
- `{previous_extruder}` / `{next_extruder}` — 上一个/下一个挤出机编号（BambuStudio 内置变量）
- `{new_filament_temp}` — 下一个耗材的目标温度（BambuStudio 内置变量，比 `nozzle_temperature[next_extruder]` 更可靠）
- `{old_filament_temp}` — 上一个耗材的温度（可用于条件判断）
- `SM_PRINT_PREEXTRUDE_FILAMENT INDEX=n` — Snapmaker 专有预挤出命令
- `M400` — 等待所有运动命令完成后再切换

**Orca 完整温度管理策略对比**：
- 启动阶段：T1/T2/T3 全部关闭（S0），与 BambuStudio 一致
- 换色前 30 秒：Orca 通过 `preheat_time=30` 自动插入 `M104 S220 T{n}` 预热
- 换色时：`M109 S220 T{n}` 等待温度 → `T{n}` 切换 → `SM_PRINT_PREEXTRUDE_FILAMENT`
- 换色后：旧喷头冷却到 70°C（`standby_temperature_delta=-150`）
- BambuStudio 的 `PreCoolingInjector` 机制类似，但需要 `filament_preheat_temperature_delta` 和 `standby_temperature_delta` 正确设置

---

## 13. auxiliary_fan=0 导致辅助风扇不工作

**现象**：BambuStudio 生成的 G-code 中没有 `M106 P2`（辅助风扇）命令，而 Orca 生成的 G-code 在换色和层变化时都有 `M106 P2 S178`。

**根因**：`Snapmaker U1 (0.4 nozzle).json` 中 `auxiliary_fan: "0"`，BambuStudio 根据此标志决定是否生成辅助风扇命令。设为 0 时，整个辅助风扇系统被禁用。

**Orca 的正确行为**：
- 换色时：`M106 P2 S178`（辅助风扇 70% 转速，帮助冷却新喷头挤出的耗材）
- 层变化时：`M106 P2 S178`（辅助风扇参与每层冷却）
- 打印结束时：`M106 P2 S0`（关闭辅助风扇）

**修复**：将 `auxiliary_fan` 从 `"0"` 改为 `"1"`。

---

## 14. enable_pre_heating=0 导致换色前无预热

**现象**：v4 G-code 中换色前没有任何预热命令，而 Orca 在换色前 30 秒自动插入 `M104 S220 T{n} ; preheat T{n} time: 30s`。虽然 `filament_preheat_temperature_delta = 50` 已在耗材文件中设置，但 BambuStudio 的 `PreCoolingInjector` 未被激活。

**根因**：`fdm_machine_common.json` 中缺少 `enable_pre_heating: "1"` 设置。BambuStudio 的预热系统需要此标志才能启用 `PreCoolingInjector`，即使 `filament_preheat_temperature_delta` 已正确设置。

**BambuStudio 预热机制**：
- `enable_pre_heating = 1`：启用 PreCoolingInjector
- `filament_preheat_temperature_delta = 50`：预热目标温度 = nozzle_temp - 50 = 170°C
- PreCoolingInjector 会在换色前自动插入 `M104 S170 T{n}` 命令

**Orca 预热机制**（不同实现）：
- `preheat_time = 30`：换色前 30 秒开始预热
- `preheat_steps = 1`：预热步数
- 直接预热到目标温度 220°C（不是 170°C）

**修复**：在 `fdm_machine_common.json` 中添加 `enable_pre_heating: "1"`。

---

## 15. filament_preheat_temperature_delta 符号错误

**现象**：`fdm_machine_common.json` 中 `filament_preheat_temperature_delta` 设为 `"-50"`（负值），而所有耗材文件中设为 `"50"`（正值）。

**根因**：BambuStudio 的 PreCoolingInjector 计算预热温度为 `nozzle_temp - filament_preheat_temperature_delta`：
- 如果 delta = 50：预热温度 = 220 - 50 = 170°C ✅
- 如果 delta = -50：预热温度 = 220 - (-50) = 270°C ❌（过热！）

耗材文件的值（50）覆盖了机器配置的值（-50），所以实际运行时预热温度是正确的 170°C。但机器配置中的值应该修正以保持一致性。

**修复**：将 `filament_preheat_temperature_delta` 从 `["-50"]` 改为 `["50"]`。

---

## 16. ooze_prevention 与擦料塔不兼容（BambuStudio 限制）

**现象**：启用 `ooze_prevention: "1"` 后切片报错："当启用擦料塔时 目前不支持防滴功能"。

**根因**：BambuStudio 硬性限制——`ooze_prevention` 和 `enable_prime_tower` 不能同时启用。BambuStudio 的擦料塔逻辑需要所有喷头随时可用（保持工作温度），而防滴功能会将空闲喷头降温，两者冲突。

**Orca 的行为**：Orca 允许 `ooze_prevention = 1` + 擦料塔同时启用，空闲喷头降温到 70°C。这是 Orca 的实现差异。

**影响**：不启用 `ooze_prevention` 时，BambuStudio 换色后内部逻辑生成 `M104 T0 S220 N0`，将旧喷头重新加热到 220°C。这意味着空闲喷头会保持高温，可能产生少量漏料。

**缓解措施**：
1. U1 是换头式设计（非 IDEX），空闲喷头停泊在远离打印区域的位置，漏料影响较小
2. 擦料塔会捕获大部分漏料
3. `change_filament_gcode` 中的 `M104 S70 T{previous_extruder}` 仍会先发出冷却命令，只是随后被 BambuStudio 内部逻辑覆盖
4. `standby_temperature_delta = -150` 在 `ooze_prevention = 0` 时不生效，但保留此设置以备将来 BambuStudio 解除限制

**结论**：不设置 `ooze_prevention`，接受空闲喷头保持高温的折中方案。

---

## 17. 跨材料基类继承导致参数缺失

**现象**：Bambu PPA-CF @U1 继承 `fdm_filament_abs`（nozzle_temperature=240°C），但 PPA-CF 实际需要 290°C。打印时严重欠挤，几乎无法出料。

**根因**：项目没有 `fdm_filament_ppa` 基类（BBL 官方有），PPA-CF 只能继承 `fdm_filament_abs`。但 ABS 的温度（240°C）与 PPA-CF（290°C）差距巨大，如果不覆盖 `nozzle_temperature`，会使用错误的温度。

**解决方案**：在具体 @U1 文件中显式覆盖所有与基类不同的参数（nozzle_temperature、filament_type、filament_flow_ratio 等）。参照 BBL 官方 `fdm_filament_ppa` 源文件补全。

---

## 18. Snapmaker 基础耗材缺少关键覆盖导致默认值错误

**现象**：Snapmaker PLA/ABS/PETG/TPU 4 个"plain"耗材文件缺少 `enable_pressure_advance`、`pressure_advance`、热床温度覆盖。TPU 热床只有 35°C（无法附着），PETG 冷板温度 60°C（会粘死）。

**根因**：这 4 个文件是最初 v2.0 创建的最小化配置，只设了 `filament_flow_ratio` 和 `filament_max_volumetric_speed`，未覆盖热床温度和 PA 参数。而 Snapmaker 变体（PLA Basic/Matte 等）是后来 v3.0 批量生成的，包含了完整覆盖。

**解决方案**：为 4 个 Snapmaker "plain" 文件补全 `enable_pressure_advance`、`pressure_advance`、热床温度覆盖。TPU 的 `enable_pressure_advance` 设为 `"0"`（禁用 PA）。

---

## 19. filament_type 缺失导致材料分类错误

**现象**：Generic PE/PP/PCTG 在 BambuStudio 中显示为 PETG 类型，PPA-CF 显示为 ABS 类型。

**根因**：这些材料继承 `fdm_filament_pet` 或 `fdm_filament_abs`，未覆盖 `filament_type`。BambuStudio 使用 `filament_type` 进行材料分类、兼容性检查和支撑材料匹配。

**解决方案**：在具体 @U1 文件中显式设置正确的 `filament_type`（如 `"PE"`、`"PP"`、`"PCTG"`、`"PPA-CF"`）。

---

## 20. 只看 @U1 文件参数不够，必须解析完整继承链有效值

**现象**：v3.10 对比 @U1 文件参数认为 TPU 配置一致，但实际 G-code 中 TPU 温度、流速、风扇等参数与 Orca 差异巨大（max_volumetric_speed 差 3 倍）。

**根因**：@U1 文件只包含覆盖值，大量参数从基类继承。只对比 @U1 文件本身无法发现继承链中的差异。例如 TPU @U1 没有覆盖 `nozzle_temperature`，所以继承了 `fdm_filament_tpu` 的 240°C，而 Orca 官方 U1 base 覆盖为 225°C。

**解决方案**：从"对比 @U1 文件参数"升级为"解析完整继承链后对比有效参数值"。必须把 @U1 → @U1 base → fdm_filament_* → fdm_filament_common 的所有参数合并后，才能得到实际生效的参数值。

---

## 21. Orca GitHub 仓库版本已过时，官方安装版参数差异巨大

**现象**：v3.9 之前参考的 Orca GitHub 仓库参数与官方安装版 Orca 有显著差异。例如 SnapSpeed PLA 热床温度 GitHub 版 45°C vs 安装版 65°C，enable_pressure_advance GitHub 版开启 vs 安装版全部关闭。

**根因**：Orca GitHub 仓库的 Snapmaker 配置可能不是最新版本，官方安装包中的配置经过了额外调优。

**解决方案**：以官方安装版 Orca 的参数为准，不依赖 GitHub 仓库。从安装版 Orca 的配置文件中提取参数进行对比。

---

## 22. retract_length_toolchange 严重偏低导致换色漏料

**现象**：换色时严重漏料，擦料塔清洗不充分，打印件出现混色。

**根因**：`retract_length_toolchange` 设为 2mm（参照 BBL A1 默认值），但 U1 官方值为 10mm。U1 是换头式设计，换色时需要更长的回抽来防止滴漏。

**解决方案**：`fdm_machine_common.json` 中 `retract_length_toolchange` 从 2 改为 10。

---

## 23. Support For PLA-PETG 继承基类错误

**现象**：Bambu Support For PLA-PETG @U1 继承 `fdm_filament_pet`，导致热床温度 80°C、PA 值 0.04，与 BBL 官方配置不一致。

**根因**：PLA-PETG 支撑材料本质上是一种改性 PLA，应继承 `fdm_filament_pla` 基类。BBL 官方的 `Bambu Support For PLA-PETG @base` 继承 `fdm_filament_pla`，热床 60°C，PA 0.02。

**解决方案**：将 `inherits` 从 `fdm_filament_pet` 改为 `fdm_filament_pla`，同时覆盖热床温度和 PA 值。

---

## 24. required_nozzle_HRC=55 对 U1 喷嘴过于严格

**现象**：CF/GF 材料在 BambuStudio 中显示警告"需要 HRC 55 以上的喷嘴"，U1 原装喷嘴硬度可能不满足。

**根因**：`required_nozzle_HRC: ["55"]` 是 BBL 官方值，针对 BBL 钢喷嘴。U1 使用不同材质的喷嘴，HRC 40 即可满足大多数 CF/GF 材料的打印需求。

**解决方案**：将 U1 兼容包中所有 CF/GF 材料的 `required_nozzle_HRC` 从 55 改为 40。

---

## 25. BambuStudio 擦料塔模式下空闲喷头无法降温（BambuStudio 自有限制，非 PrusaSlicer 原生）

**现象**：多喷头打印时，A 喷头切换到 B 喷头后，A 喷头仍保持打印温度（245°C），不会降温到待机温度。`change_filament_gcode` 中的 `M104 S70 T0` 被 BambuStudio 内部生成的 `M104 T0 S245 N0` 覆盖。

**根因**：

1. **BambuStudio 增加了互斥限制**（PrusaSlicer 原版没有）：`Print.cpp:1416-1417` 硬性禁止 `ooze_prevention` 和 `enable_prime_tower` 同时启用。PrusaSlicer 原生的 `OozePrevention` 类（`GCode.cpp:253-296`）设计上就是和擦料塔配合使用的——换刀前降温、换刀后升温，两者可以共存。

2. **WipeTower 重新加热空闲喷头**：`WipeTower.cpp:1328-1337` 的 `format_line_M104` 生成 `M104 Tn Sxxx N0` 命令（`N0` 表示"由切片器生成"），在擦料塔擦料阶段把空闲喷头重新加热到工作温度。BambuStudio 假设所有喷头随时可用（保持工作温度），因为 BBL 打印机是单喷头多耗材（SEMM）方案，不存在"空闲喷头"概念。

3. **BambuStudio 用 `filament_pre_cooling_temperature` 替代了经典 `ooze_prevention`**（`PrintConfig.cpp:2689-2713`），但这个参数是为 SEMM 方案设计的，不是为 U1 这种多独立喷头方案设计的。

4. **`standby_temperature_delta` 在 `ooze_prevention=0` 时不生效**，而 `ooze_prevention` 又不能和擦料塔同时启用，形成死锁。

**解决方案**（待实施）：

修改 BambuStudio 源码，移除互斥限制：
- `Print.cpp:1416-1417`：注释掉 `ooze_prevention` 和 `wipe_tower` 的互斥检查
- 启用 `ooze_prevention: "1"` + `standby_temperature_delta: "-150"`
- 可能需要额外修改 WipeTower 代码，避免对空闲喷头生成重新加热命令（`M104 Tn Sxxx N0`）

**影响**：空闲喷头保持高温导致 PETG 持续渗出，U1 换头式设计漏料影响相对可控（空闲喷头停泊在远离打印区域的位置），但长期高温待机浪费电力、加速喷头磨损。

---

## 26. bed_model/bed_texture 为空导致热床显示默认矩形形状

**现象**：BambuStudio 中 Snapmaker U1 的热床显示为默认矩形，而非 U1 实际的热床形状（圆角矩形+标记）。项目目录下已有 `Snapmaker U1_bed.stl` 和 `Snapmaker U1_texture.svg`，但未被加载。

**根因**：`Snapmaker U1.json`（machine_model 配置）中 `bed_model: ""` 和 `bed_texture: ""` 为空字符串。BambuStudio 的 `system_printer_bed_model()`（Preset.cpp:4003-4012）在 `bed_model` 为空时直接返回空字符串，不加载任何模型文件。

路径解析逻辑：
1. 先查找 `data_dir()/vendor/{vendor_id}/{bed_model}`（用户缓存目录）
2. 若不存在，查找 `resources_dir()/profiles/{vendor_id}/{bed_model}`（安装目录）
3. `bed_model` 值为相对于 vendor 根目录的文件名（如 `"Snapmaker U1_bed.stl"`）

**解决方案**：在 `Snapmaker U1.json` 中填入正确的文件名：
- `"bed_model": "Snapmaker U1_bed_texture.stl"`（含浮雕 logo 的版本）
- `"bed_texture": "Snapmaker U1_texture.svg"`

**参考**：Anker M5 官方配置 `"bed_model": "M5-CE-bed.stl"`，文件放在 `profiles/Anker/` 根目录下。

---

## 27. bed_texture SVG 不会被渲染，热床 logo 必须嵌入 STL 模型

**现象**：配置了 `bed_texture` 指向 SVG 文件后，BambuStudio 中热床仍不显示 Snapmaker logo。Anker M5 打印机可以显示 logo。

**根因**：BambuStudio 和 OrcaSlicer 的 `3DBed.cpp` 中，`render_texture()` 函数**整体被注释掉了**：

- BambuStudio `3DBed.cpp:460-467`：`render_system()` 中 `render_texture(bottom, canvas)` 被注释
- OrcaSlicer 同样注释掉了 `render_texture` 调用
- `3DBed.cpp:219-223`：`texture_filename` 赋值逻辑被注释
- `3DBed.cpp:262`：`m_texture_filename = texture_filename` 被注释

`bed_texture` 字段虽然存在于 JSON 配置中，但 SVG 纹理的加载和渲染代码全部禁用。

Anker M5 能显示 logo 是因为其 bed STL 文件中**直接嵌入了 logo 的 3D 几何体**（720 三角形，含浮雕文字），而非通过 SVG 纹理实现。对比：Anker M5 bed STL 720 三角形/36KB，Snapmaker J1 bed STL 1356 三角形/67KB，Snapmaker U1 原 bed STL 仅 344 三角形/17KB。

此外，STL 格式只能存储几何体（顶点和法线），不能存储颜色或纹理信息，因此即使嵌入 logo 几何体也只能以同色浮雕形式显示。

**解决方案**：将 Snapmaker logo 以 3D 浮雕几何体嵌入 `Snapmaker U1_bed_texture.stl` 中，并将 `bed_model` 指向此文件。如需彩色 logo，需修改 BambuStudio 源码恢复 `render_texture` 渲染逻辑后自行编译。

---

#28
**现象**：BambuStudio 的 PrinterWebView 不会自动注入 Moonraker API Key，导致 Fluidd 显示"未授权"
**根因**：BambuStudio 源码 `PrinterWebView.cpp` 的 `load_url()` 只接受 URL 参数，没有 API Key 参数。OrcaSlicer 有 `SendAPIKey()` 方法在页面加载后注入 JavaScript 拦截 `window.fetch`，BambuStudio 没有
**解决方案**：桥接服务器方案——通过 HTTP 代理自动在请求头中注入 `X-API-Key`，前端无需感知 API Key

---

#29
**现象**：BambuStudio 的网络插件加载有代码签名验证，无法注入自定义 DLL
**根因**：`NetworkAgent.cpp:212-213` 使用 `IsSamePublisher()` 检查 DLL 的数字签名是否与 BambuStudio 自身相同，不同发行商的 DLL 会被拒绝加载
**解决方案**：不使用 DLL 插件机制，改用 `print_host_webui` 配置字段指向本地桥接服务器

---

#30
**现象**：v0.1.0 使用 `/moonraker/{path}` 前缀代理，Fluidd 无法正常工作
**根因**：Fluidd 默认连接同源（localhost:13628），API 请求路径为 `/api/*`、`/server/*` 等，不会自动添加 `/moonraker/` 前缀
**解决方案**：v0.2.0 重构为直接代理 Moonraker API 路径（`/api/`、`/server/`、`/printer/`、`/access/`、`/machine/`），Fluidd 无需任何修改即可工作

---

#31
**现象**：v0.1.0 WebSocket 路径为 `/ws`，Fluidd 连接失败
**根因**：Moonraker 的 WebSocket 路径是 `/websocket`，不是 `/ws`。Fluidd 硬编码连接同源的 `/websocket`
**解决方案**：v0.2.0 将 WebSocket 代理路径改为 `/websocket`，匹配 Moonraker 原生路径

---

#32
**现象**：系统没有安装 Python，无法运行桥接服务器
**根因**：用户系统未安装 Python，`python`/`python3`/`py` 命令均不可用
**解决方案**：使用 Python 3.12.9 嵌入式版本（embeddable package），下载到项目 `bridge/python/` 目录，绿色便携无需系统安装。配置 `python312._pth` 启用 `import site` 和 `Lib/site-packages`，然后安装 pip 和依赖

---

#33
**现象**：Fluidd 加载后显示连接设置页面，而非自动连接
**根因**：Fluidd 的 `config.json` 中 `hosted` 字段为 `false`，导致 Fluidd 显示连接配置界面
**解决方案**：桥接服务器启动时自动 patch Fluidd 的 `config.json`，设置 `hosted: true`，Fluidd 将自动连接同源 Moonraker API

---

#34
**现象**：无法通过 DOM 解析 Snapmaker Flutter Web UI 样本（`snapmaker-webUI-sample.html`）的界面布局，DOM 中无可读文本
**根因**：Flutter Web 在 release 模式下默认不启用语义树（Semantics），所有内容渲染在 canvas 或 HTML 层但无 `aria-label` 等属性
**解决方案**：通过逆向分析 `main.dart.js`（4.8MB 编译产物）提取 UI 结构信息，结合用户直接描述确认 Snapmaker WebUI 有 4 个主模块（Camera/Print Job/Control/Filament）+ 侧栏连接设备，在同一界面 2x2 网格排布

---

#35
**现象**：旧 `bambustudio-bridge` 目录删除后，新位置 `bridge/python/` 的嵌入式 Python 无法运行命令（所有命令返回 exit code 1 且无输出）
**根因**：终端的当前工作目录（CWD）指向已删除的旧目录 `c:\Users\VitasGuo\Documents\SOLO\3D-printer\bambustudio-bridge`，导致所有命令执行失败
**解决方案**：使用新终端（`target_terminal: new`）执行命令，新终端的 CWD 会自动设为有效路径

---

#36
**现象**：嵌入式 Python 无法通过 `curl` 或 PowerShell `Invoke-WebRequest` 下载 `get-pip.py`，命令返回 exit code 1 且无输出
**根因**：Windows 环境下 `curl` 和 `Invoke-WebRequest` 的错误信息被吞掉，无法看到具体错误原因
**解决方案**：使用 Python 内置的 `urllib.request.urlretrieve()` 下载文件，嵌入式 Python 的 SSL 模块正常工作（`_ssl.pyd`、`libssl-3.dll`、`libcrypto-3.dll` 均已包含在嵌入包中）

---

#37
**现象**：U1 的 Moonraker `/server/webcams/list` API 返回空数组，WebUI 摄像头无法自动获取流地址
**根因**：U1 的 `moonraker.conf` 没有 `[webcam]` 配置段，Moonraker 的 `webcam` 组件不会注册任何摄像头。摄像头流由 `mjpegstreamer` 服务提供，通过 `octoprint_compat` 的默认配置暴露（`stream_url = /webcam/?action=stream`）
**解决方案**：WebUI 在 `/server/webcams/list` 返回空时，回退到 `/webcam/?action=stream` 作为摄像头流地址。这与 U1 Moonraker 的 `octoprint_compat` 默认配置一致

---

#38
**现象**：WebUI 中 Light 开灯不工作（关灯正常）
**根因**：U1 的 `cavity_led` LED 对象有 4 个通道 `[RED, GREEN, BLUE, WHITE]`，`SET_LED` 命令只设了 `RED=1 GREEN=1 BLUE=1`，缺少 `WHITE=1` 参数。U1 的 LED 需要 WHITE 通道才能亮灯（通过 `/printer/objects/query?led cavity_led` 确认 `color_data: [[1.0, 1.0, 1.0, 0.0]]`，WHITE=0 时灯不亮）
**解决方案**：`SET_LED LED=cavity_led RED=1 GREEN=1 BLUE=1 WHITE=1` 开灯，`SET_LED LED=cavity_led RED=0 GREEN=0 BLUE=0 WHITE=0` 关灯

---

#39
**现象**：WebUI 中 Camera 点击开始不能显示视频流
**根因**：MJPEG 视频流（`/webcam/?action=stream`）是长连接，桥接代理使用 `httpx.AsyncClient.get()` 一次性获取全部响应内容，无法流式转发 MJPEG 帧。前端用 `location.origin`（`http://localhost:13628`）拼接摄像头 URL，请求经过桥接代理导致流中断
**解决方案**：通过 `/api/bridge/config` 获取打印机 IP，摄像头流 URL 直接指向打印机地址（`http://{printer_ip}/webcam/?action=stream`），绕过桥接代理

---

#40
**现象**：WebUI 中 Filament 模块不能同步耗材的具体信息（材料类型、颜色）
**根因**：U1 的 `filament_feed` 对象只有物理状态（`filament_detected`、`channel_state`），没有 `filament_type` 字段。耗材类型和颜色信息存储在 `snapmaker/print_task.json` 配置文件中（`filament_type`、`filament_color_rgba`、`filament_sub_type` 数组），不是 Moonraker 对象模型的属性
**解决方案**：通过 `/server/files/config/snapmaker/print_task.json` 获取耗材类型和颜色，在 `loadFilamentInfo()` 中加载后传递给 `updFil()` 渲染

---

#41
**现象**：BambuStudio 中热床 3D 模型偏到右上角，不在热床中心
**根因**：BambuStudio 的 `update_model_offset()`（3DBed.cpp:605-618）将 STL 模型的 `(0,0,0)` 点移到 `printable_area` 的中心 `(135,135)`。非 BBL 打印机（文件名不含 `bbl-3dp-`）不做额外偏移。如果 STL 以左下角为原点（0,0），偏移后左下角被放到 (135,135)，整个热床就偏到右上角
**解决方案**：STL 必须以中心为原点建模。将 `Snapmaker U1_bed_texture.stl` 从左下角原点（X: -2.5~273.5, Y: -10.5~282.5）居中为（X: -138~138, Y: -146.5~146.5），使 (0,0,0) 在热床中心。修改后需 reinstall 才能生效

---

#42
**现象**：Bridge 安装后依赖兼容包原始目录，删除兼容包目录后 Bridge 无法运行
**根因**：Bridge 服务器从兼容包原始目录（`BambuStudio-SnapmakerU1-Compat\bridge\`）运行，没有安装到 BambuStudio 安装目录
**解决方案**：install.ps1/reinstall.ps1 将 bridge/ 复制到 `C:\Program Files\Bambu Studio\bridge\`，安装后兼容包目录可删除

---

#43
**现象**：Bridge 安装到 Program Files 后配置文件无法写入
**根因**：`bridge_config.json` 存放在 bridge/ 目录下，Program Files 需要管理员权限才能写入
**解决方案**：配置文件路径改为 `%APPDATA%\BambuStudio-Bridge\bridge_config.json`，首次加载时自动从旧位置迁移

---

#44
**现象**：Bridge 需要手动启动，用户每次开机都要运行 start.bat
**根因**：没有配置自动启动机制
**解决方案**：安装脚本创建 VBS 隐藏启动器（`start-hidden.vbs`，用 `WshShell.Run ..., 0, False` 隐藏控制台窗口）+ Windows Startup 文件夹快捷方式（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BambuStudio Bridge.lnk`），登录时自动后台运行

---

#45
**现象**：安装脚本创建 `start-hidden.vbs` 时报"对路径的访问被拒绝"
**根因**：VBS 文件放在 `C:\Program Files\Bambu Studio\bridge\` 下，普通用户没有写入权限
**解决方案**：VBS 启动器放到 `%APPDATA%\BambuStudio-Bridge\start-hidden.vbs`，该目录用户可写。Startup 快捷方式指向此 VBS 文件

---

#46
**现象**：WebUI 摄像头模块点击播放后无法显示视频流，`/webcam/?action=stream` 返回 502 Bad Gateway
**根因**：U1 不使用 MJPEG stream 视频流方案。U1 的摄像头通过 `/server/files/camera/monitor.jpg` 单张 JPEG 照片轮询方式实现（500ms 间隔），Snapmaker App 和 OrcaSlicer 都用此方式。`/webcam/?action=stream` 返回 502 是因为 mjpegstreamer 服务未运行，U1 根本不提供 MJPEG 流
**解决方案**：WebUI 摄像头从 MJPEG stream 改为 snapshot 轮询方式——`pollCam()` 每 500ms 请求 `/server/files/camera/monitor.jpg?_t=TIMESTAMP`，通过桥接代理转发到打印机。启动时通过 IIFE 探测该 URL 是否可用来设置 `camAvail`，不可用时显示友好错误提示

---

#47
**现象**：Print Job 模块检测到有任务，但按钮一直显示 Start，不显示 Pause/Stop
**根因**：两个问题叠加——(1) 初始 HTTP 查询 `/printer/objects/query` 缺少 `print_stats` 和 `display_status` 参数，`D.print_stats` 始终为空对象，`ps.state` 为 `undefined`，`if(ps.state)` 判断失败；(2) WebSocket 订阅的初始响应格式是 `{result: {status: {...}}}`（没有 `method` 字段），`onmessage` 只处理 `notify_status_update`，订阅响应被忽略。两个问题导致页面加载后打印状态永远不会更新到 UI
**解决方案**：初始查询 URL 添加 `print_stats` 和 `display_status`；查询完成后调用 `upd({})` 触发完整 UI 更新；`onmessage` 添加 `if(m.result&&m.result.status)upd(m.result.status)` 处理订阅响应

---

#48
**现象**：从 BambuStudio 切片界面点击打印，直接开始打印而不弹出确认对话框
**根因**：两个问题——(1) Bridge 的 `_handle_upload_with_confirm` 将原始 multipart body（含 `print=true`）直接转发给 Moonraker 的 `/api/files/local`，Moonraker OctoPrint 兼容层收到 `print=true` 后立即启动打印，Bridge 虽然设置了 `pending_print_file` 但打印已经开始；(2) BambuStudio 的 Physical Printer `print_host` 可能仍指向打印机 IP 而非 Bridge 地址（`http://127.0.0.1:13628`），导致上传请求绕过 Bridge 直接发到 Moonraker
**解决方案**：(1) 改用 `request.form()` 解析 multipart 表单，提取 file 和 print 字段，使用 Moonraker 原生上传 API (`/server/files/upload`) 只上传文件不启动打印（原生 API 不支持 `print` 参数），然后返回 OctoPrint 兼容响应给 BambuStudio；(2) 用户需将 Physical Printer 的 `print_host` 改为 `http://127.0.0.1:13628`

---

#49
**现象**：打印确认对话框的选项（Auto Bed Leveling/Flow Calibration/Timelapse）永远不生效
**根因**：`bridge_confirm_print` 的参数 `options: dict = None` 被 FastAPI 当作 query parameter 解析，而非 request body。前端通过 `body: JSON.stringify(opts)` 发送 JSON 请求体，但 FastAPI 不会从 POST 请求体中读取未标注的 `dict` 参数
**解决方案**：改为 `request: Request` 参数 + `await request.json()` 手动读取请求体

---

#50
**现象**：切片界面热床模型高度不对，薄模型会和热床模型重叠导致显示异常
**根因**：`Snapmaker U1_bed_texture.stl`（bed_model 配置文件）的 Z 坐标范围为 0.000~0.510，整个模型在 Z=0（打印面）之上。BambuStudio 的 `update_model_offset()`（3DBed.cpp:609）默认 Z 偏移仅 -0.03，偏移后模型顶部仍在 Z=0.480，远高于打印面。BBL 打印机有专用 hack（Z=-0.45），但非 BBL 打印机只使用默认 -0.03
**解决方案**：修改 STL 文件本身，将所有 Z 坐标下移使顶部对齐 Z=0。`Snapmaker U1_bed_texture.stl` 下移 0.510（Z 范围 → -0.510~0.000），`Snapmaker U1_bed.stl` 下移 0.050（Z 范围 → -0.500~0.000）。偏移后模型顶部在 Z=-0.03，刚好在打印面之下

---

#51
**现象**：打印确认对话框点击 Start Print 后打印机无反应
**根因**：U1 Moonraker 的 `/server/files/start_local_print` 端点注册时使用 `transports=(TransportType.all() & ~TransportType.HTTP)`（snapmakercloud.py:140），明确排除了 HTTP 传输，只支持 WebSocket/MQTT。Bridge 和 WebUI 通过 HTTP POST 调用此端点会被 Moonraker 静默拒绝
**解决方案**：改用 `/printer/gcode/script` 端点发送 `SDCARD_PRINT_FILE_WITH_PARAMETERS` G-code 命令（参考 klippy_apis.py:332 的 `start_print_advanced` 实现），此端点支持 HTTP 传输

---

#52
**现象**：BambuStudio 切片后点打印不触发确认对话框（即使 print_host 已设为 Bridge 地址）
**根因**：BambuStudio 上传时用户通常在 Prepare 标签页，Device 标签页的 WebUI 未加载，WebSocket 连接未建立。Bridge 的 `_notify_webui` 发出 `pending_print` 通知后无人接收。用户切换到 Device 标签页时 WebUI 重新加载，但不检查是否有待确认的打印任务
**解决方案**：WebSocket 连接建立后（`ws.onopen`）立即检查 `/api/bridge/pending_print`，如有待确认打印则弹出确认对话框

---

#53
**现象**：打印确认对话框点击 Start Print 后报 "Print failed: gcode failed"
**根因**：U1 Moonraker 的 `/printer/gcode/script` 没有注册为 HTTP 端点（klippy_apis.py 中只注册了 `/printer/print/start`、`/printer/print/pause` 等端点，`gcode/script` 只是 Klipper 内部 RPC 端点，通过 WebSocket JSON-RPC 可用但 HTTP 不可用）。WebUI 和 Bridge 通过 HTTP POST 调用此端点会返回 404
**解决方案**：WebUI 改用已有的 WebSocket 连接发送 `printer.gcode.script` JSON-RPC 请求；Bridge 的 `confirm_print` 端点改用 `websockets` 库建立临时 WebSocket 连接到 Moonraker 发送 G-code

---

#54
**现象**：耗材加载中/热端移动中点击打印，设备立即开始移动热端，无安全检测
**根因**：`doPrint()` 函数没有检查打印机当前状态，直接发送打印命令
**解决方案**：`doPrint()` 添加 `print_stats.state` 检查，printing/paused 状态禁止启动新打印并弹出提示

---

#55
**现象**：`SDCARD_PRINT_FILE_WITH_PARAMETERS` 命令报错 "unable to parse True"/"unable to parse False"
**根因**：Klipper 的 G-code 宏解析器不能识别字符串 `"True"`/`"False"`，只接受数字 `1`/`0`。WebUI 和 Bridge 生成的 G-code 格式为 `AUTO_BED_LEVELING="True"`，Klipper 无法解析引号包裹的布尔字符串
**解决方案**：改为数字格式 `AUTO_BED_LEVELING=1`（去掉引号，用数字代替字符串）。WebUI: `opts[k]?'1':'0'`；Bridge: `val = "1" if str(v).lower() in ("true", "1", "yes") else "0"`

---

#56
**现象**：切片后打印不触发确认对话框，直接开始打印
**根因**：用户自定义 machine 配置 `Snapmaker U1 (0.4 nozzle) - 拷贝.json` 中 `"print_host": "192.168.1.12"` 覆盖了系统配置的 `"print_host": "http://127.0.0.1:13628"`。BambuStudio 的配置继承机制中，用户配置优先级高于系统配置，导致 Physical Printer 直接与打印机 IP 通信，绕过 Bridge
**解决方案**：用户需在 BambuStudio 中修改 Physical Printer 的 print_host 为 `http://127.0.0.1:13628`，或删除用户自定义的 machine 配置让系统配置生效

---

#57
**现象**：WebUI 中所有 G-code 控制命令（移动/加热/风扇/灯光/暂停/恢复/取消）不生效
**根因**：`gcode()` 函数通过 HTTP POST 调用 `/printer/gcode/script` 端点，但该端点在 U1 Moonraker 中没有注册为 HTTP 端点（klippy_apis.py 中只注册了 `/printer/print/start` 等端点，`gcode/script` 只是 Klipper 内部 RPC 端点，通过 WebSocket JSON-RPC 可用但 HTTP 不可用）
**解决方案**：`gcode()` 函数优先使用 WebSocket JSON-RPC 发送 `printer.gcode.script`，HTTP 作为 fallback（某些 Moonraker 版本可能支持）

---

#58
**现象**：切片后打印不触发确认对话框，直接开始打印或上传到打印机 IP 而非 Bridge
**根因**：用户在 BambuStudio 中添加 Physical Printer 时输入的打印机 IP（如 `192.168.1.12`）被保存到用户预设副本（`user\*\machine\Snapmaker U1 (0.4 nozzle) - 拷贝.json`）的 `print_host` 字段。BambuStudio 的配置继承机制中用户配置优先级高于系统配置，导致 Physical Printer 直接与打印机 IP 通信，绕过 Bridge（`http://127.0.0.1:13628`）
**解决方案**：reinstall.ps1 新增步骤 6/10，扫描 `%APPDATA%\BambuStudioBeta\user\*\machine\` 下所有文件名含 "Snapmaker" 的 JSON 文件，使用 `ConvertFrom-Json` / `ConvertTo-Json` 将 `print_host` 修改为 `http://127.0.0.1:13628`，`host_type` 修改为 `octoprint`。如用户后续在 BambuStudio 中重新添加 Physical Printer，需手动确保 print_host 设为 Bridge 地址

---

#59
**现象**：Bridge 收到 BambuStudio 的 `POST /api/files/local` 上传请求后，multipart 表单解析失败，`print=true` 参数无法被拦截，文件直接转发到 Moonraker 自动开始打印
**根因**：Python Bridge 的 `requirements.txt` 缺少 `python-multipart` 库。FastAPI 的 `request.form()` / `request.stream()` 解析 multipart 表单需要此库，未安装时抛出 `The 'python-multipart' library must be installed to use form parsing` 异常。Bridge 的异常处理将原始请求原样转发给 Moonraker，Moonraker 收到 `print=true` 后直接启动打印
**解决方案**：在 `requirements.txt` 中添加 `python-multipart>=0.0.6`。此问题也是从 Python Bridge 迁移到 Node.js Bridge 的直接原因之一——Python 嵌入式包的依赖管理太脆弱

---

#60
**现象**：Python 嵌入式发行版（`python-3.x-embed-amd64.zip`）缺少 tkinter、pip 权限问题、依赖安装到用户目录而非嵌入环境
**根因**：Python 嵌入式包设计为最小运行时，不包含 Tcl/Tk 库（tkinter 依赖）、`site-packages` 目录默认不在搜索路径中、`pip install` 因 Program Files 写入权限限制安装到用户目录
**解决方案**：Bridge 从 Python 重构为 Node.js。Node.js 的依赖管理（`package.json` + `node_modules`）比 Python 嵌入式包可靠得多，且 Node.js 在 Windows 上安装后即可全局使用，无需嵌入式运行时

---

#61
**现象**：切片后点击 Print，BambuStudio 弹出 "Upload / Print / Cancel" 对话框，选 Print 后需要手动切换到 Device 标签才能看到打印确认对话框，体验不顺畅
**根因**：BambuStudio 的 `PrintHostSendDialog`（C++ wxWidgets 对话框）只提供 Upload/Print/Cancel 三个选项，没有耗材选择和打印选项。Snapmaker OrcaSlicer 的第二步弹窗（耗材/调平/延时摄影）是 OrcaSlicer 源码中专门添加的，BambuStudio 没有
**解决方案**：Bridge 收到 `print=true` 的上传请求后，弹出 Windows 原生对话框（PowerShell + WinForms，深色主题），包含耗材选择（4 个 extruder checkbox）和打印选项（自动调平/流量校准/延时摄影 checkbox）。用户确认后 Bridge 通过 WebSocket 发送 `SDCARD_PRINT_FILE_WITH_PARAMETERS`。Linux 上使用 zenity 实现类似功能

---

#62
**现象**：Bridge 启动后所有代理请求返回 500，Fluidd 显示"Connecting to moonraker..."无法连接，WebUI 也不刷新打印机信息。直接访问 Moonraker（`http://192.168.1.12/api/version`）正常返回 200
**根因**：Express 5 的 `{*path}` 通配符参数返回数组而非字符串。`req.params.path` 为 `["version"]` 而非 `"version"`，调用 `.startsWith()` 报 `TypeError: req.params.path.startsWith is not a function`。Express 4 的 `:path(*)` 返回字符串，但 Express 5 改为返回数组
**解决方案**：添加 `wcPath(req)` 辅助函数，兼容数组和字符串：`Array.isArray(p) ? p.join("/") : (p || "")`。所有使用 `{*path}` 的路由都通过此函数获取路径

---

#63
**现象**：Fluidd 在 iframe 中一直显示"Connecting to moonraker..."，无法连接。WebUI 正常工作
**根因**：Fluidd 连接流程需要 `/access/token` 端点获取 API token。U1 的 Moonraker 不支持此端点（返回 404），Fluidd 在获取 token 失败后卡住。另外 Fluidd 的 `config.json` 中 `endpoints: []` 没有配置后端地址
**解决方案**：1) Bridge 拦截 `/access/token` 和 `/access/login` 请求，返回空 token `{"result":""}`；2) 修改 Fluidd 的 `config.json`，添加 `"endpoints": [{"url": "/"}]` 指定后端地址

---

#64
**现象**：WebUI 热床温度不显示，其他温度正常
**根因**：WebUI 初始查询 URL 中遗漏了 `heater_bed` 参数。`/printer/objects/query?extruder&extruder1&...` 没有 `&heater_bed`
**解决方案**：在初始查询 URL 中添加 `&heater_bed`

---

#65
**现象**：WebUI 摄像头模块无法显示视频，点击播放后图片加载失败。初始探测 IIFE 设置 `camAvail=false`，显示"Camera unavailable"
**根因**：`proxyToMoonraker` 函数（server.js:415-416）使用 `r.text()` 读取 Moonraker 响应体，`text()` 将二进制数据按 UTF-8 解码为字符串，破坏了 JPEG 图片的二进制数据。`/server/files/camera/monitor.jpg` 请求经过代理后返回损坏的 JPEG 数据，`<img>` 元素无法渲染，触发 `onerror`
**解决方案**：将 `proxyToMoonraker` 改为 `Buffer.from(await r.arrayBuffer())` 读取二进制响应体，仅在 `content-type` 为 JSON 时用 `body.toString("utf-8")` 解析。对比 `/webcam/` 路由已正确使用 `arrayBuffer()`

---

#66
**现象**：Fluidd 在 iframe 中一直"Connecting to moonraker..."，即使 `/access/token` 拦截和 `config.json` endpoints 已正确配置。WebUI 正常工作
**根因**：WebSocket 代理有竞态条件。原代码在 `moonrakerWs.on("open")` 回调中才注册 `ws.on("message")`，但 Fluidd 连接 WebSocket 后立即发送 `printer.objects.subscribe` 订阅请求，此时 Moonraker WS 可能还在 CONNECTING 状态，订阅请求被丢弃。Moonraker 永远收不到订阅请求，Fluidd 永远收不到订阅响应，卡在 Connecting
**解决方案**：将 `ws.on("message")` 移到 `moonrakerWs.on("open")` 外面，立即注册。添加 `pendingMsgs` 队列，Moonraker WS 在 CONNECTING 状态时缓存客户端消息，连接建立后一次性发送

---

#67
**现象**：摄像头图片代理返回有效 JPEG，但 WebView 缓存导致轮询不刷新。Express 自动生成 ETag 头（`W/"1104c-..."`），WebView 可能用 ETag 做缓存判断
**根因**：Express 默认启用 ETag 生成，中间件中 `res.removeHeader("ETag")` 在 `res.send()` 之前执行，但 Express 在 `send()` 内部又添加了 ETag
**解决方案**：使用 `app.set("etag", false)` 在 Express 应用级别禁用 ETag 生成。同时设置 `Cache-Control: no-cache, no-store, must-revalidate` 和 `Pragma: no-cache`

---

#68
**现象**：切片后点打印→Upload→Print，报错 `HTTP 500: {"error":"Upload failed: formidable.IncomingForm is not a constructor"}`
**根因**：代码写 `const { formidable } = require("formidable")` 解构导入，然后 `new formidable.IncomingForm()`。formidable v3 中 `require("formidable")` 返回的对象直接包含 `IncomingForm`，解构后 `formidable` 变成 `require("formidable").formidable`（一个工厂函数），其上没有 `IncomingForm` 属性
**解决方案**：改为 `const formidable = require("formidable")` 直接导入，然后 `new formidable.IncomingForm()`

---

#69
**现象**：reinstall 后 WebUI 和 Fluidd 都不工作，Camera 显示旧照片，Fluidd 一直 Connecting。源码目录运行正常
**根因**：install.ps1/reinstall.ps1 只复制了 `bridge-node` 目录到 BambuStudio 的 `bridge` 目录，没有复制 `bridge/web` 目录（包含 webui.html 和 Fluidd dist）。部署后 server.js 的 `WEB_DIR` 回退逻辑 `path.join(PROJECT_DIR, "bridge", "web")` 指向不存在的路径
**解决方案**：在 install.ps1 和 reinstall.ps1 中添加复制 `bridge/web` 到 `$bridgeDst\web` 的步骤

---

## 70. Express 中间件顺序导致 G-code 上传二进制请求体被 JSON parser 消费

**现象**：BambuStudio 切片后上传 G-code 文件到 Bridge，`req.body` 为空对象 `{}`，formidable 无法解析 multipart 表单，上传失败。

**根因**：Express 中间件注册顺序错误——`express.json()` 在 `express.raw()` 之前注册。当 BambuStudio 发送 `Content-Type: multipart/form-data` 的上传请求时，`express.json()` 不匹配（只处理 `application/json`），但 `express.urlencoded()` 会尝试解析请求体，消费了原始数据流。后续 `express.raw()` 虽然匹配 `application/octet-stream`，但请求体已被消费，`req.body` 为空。

**解决方案**：将 `express.raw({ type: ["application/octet-stream", "application/x-gcode"] })` 移到 `express.json()` 之前注册，确保二进制请求体优先被 raw parser 处理。

---

## 71. proxyToMoonraker 只转发 content-type 响应头导致 Fluidd 连接失败

**现象**：Fluidd 通过 Bridge 代理连接 Moonraker 时一直卡在 "Connecting"，WebSocket 订阅请求无响应。

**根因**：v5.3.0 的 `proxyToMoonraker` 只转发了 `content-type` 响应头，丢失了其他关键响应头（如 `set-cookie`、`content-disposition` 等）。Moonraker 的某些 API 依赖完整的响应头传递信息，Fluidd 的连接流程也可能依赖特定响应头。

**解决方案**：`proxyToMoonraker` 完全重写，转发所有响应头（仅排除 `transfer-encoding` 和 `connection`），确保代理响应与 Moonraker 原始响应一致。

---

## 72. Fluidd Vue Router 导航到子路径返回 404

**现象**：Fluidd 在 iframe 中加载正常，但点击导航链接（如 `/fluidd/printer`、`/fluidd/temperature`）时返回 404 或空白页面。

**根因**：Fluidd 是 Vue SPA，使用 Vue Router 的 history 模式。当用户在 Fluidd 内部导航到子路径时，浏览器会向 Bridge 服务器请求 `/fluidd/printer` 等路径。Bridge 的 `express.static` 只能匹配实际存在的文件路径，找不到 `/fluidd/printer` 对应的文件就返回 404。SPA 的正确行为是所有未匹配路径都返回 `index.html`，由前端路由处理。

**解决方案**：新增 `app.get("/fluidd/{*path}", ...)` 路由，在 `express.static` 之后注册，对所有 `/fluidd/` 下的非静态资源路径返回 `index.html`。

---

## 73. WebSocket 代理缺少 Moonraker 错误处理导致客户端连接泄漏

**现象**：Moonraker 服务重启或网络中断后，Bridge 的 WebSocket 客户端连接不释放，逐渐积累大量僵尸连接。

**根因**：Bridge 的 WebSocket 代理只注册了 `moonrakerWs.on("message")` 和 `moonrakerWs.on("close")`，没有注册 `moonrakerWs.on("error")`。当 Moonraker 连接异常断开时，`error` 事件触发但没有处理程序，客户端 WebSocket 连接不会被关闭，形成泄漏。

**解决方案**：添加 `moonrakerWs.on("error")` 处理程序，在 Moonraker 连接错误时关闭对应的客户端 WebSocket 连接。同时改进 `ws.on("close")` 中的清理逻辑，确保 Moonraker WebSocket 也被正确关闭。

---

## 74. undici 未声明为依赖导致上传报错

**现象**：切片后点击打印，报错 `HTTP 500: {"error":"Upload failed: Cannot find package 'undici' imported from C:\\Program Files\\Bambu Studio\\bridge\\server.js"}`

**根因**：server.js 第 364 行使用 `const FormData = (await import("undici")).FormData;` 动态导入 `undici` 包来构造 multipart 上传请求体（`node-fetch` v2 不支持 `FormData`），但 `package.json` 的 `dependencies` 中没有声明 `undici`。源码目录因为开发时全局安装过 `undici` 所以不报错，但 `npm install --production` 只安装 `dependencies` 中声明的包，部署目录缺少 `undici` 导致运行时报错。

**解决方案**：在 `package.json` 的 `dependencies` 中添加 `"undici": "^6.21.0"`。reinstall 时 `npm install --production` 会自动安装。

---

## 75. node-fetch v2 不兼容 undici.FormData 导致上传 Content-Type 错误

**现象**：添加 `undici` 依赖后上传仍报错：`streaming_form_data.parser.ParseFailedException: Content-Type is not multipart/form-data`。Moonraker 收到的请求不是有效的 multipart 格式。

**根因**：`node-fetch` v2 不支持 `FormData` 作为 `body`。当把 `undici.FormData` 实例传给 `node-fetch` 的 `fetch()` 时，`node-fetch` 不知道如何序列化它，不会自动设置 `Content-Type: multipart/form-data; boundary=...` 头，请求体也不是有效的 multipart 编码。`node-fetch` v2 有自己的 `FormData` 实现（基于 `form-data` 包），与 `undici.FormData` 不兼容。

**解决方案**：上传请求改用 `undici.fetch`（而非 `node-fetch`），因为 `FormData`、`Blob` 和 `fetch` 都来自 `undici`，天然兼容。`undici.fetch` 会自动设置正确的 `Content-Type` 头并正确序列化 multipart 请求体。

---

## 76. undici v6 不导出 Blob 构造函数

**现象**：改用 `undici.FormData` + `undici.Blob` 后报错 `undici.Blob is not a constructor`。

**根因**：`undici` v6 的导出列表不包含 `Blob`。`Blob` 在 Node.js 18+ 中是全局对象，`undici` 不重复导出。但 `undici.FormData.append()` 需要传入 `Blob` 或 `File` 实例作为文件参数，而全局 `Blob` 与 `undici.FormData` 的兼容性也不确定。

**解决方案**：彻底放弃 `undici` 方案，改用 `form-data` 包（`npm install form-data`）。`form-data` 是 `node-fetch` v2 的标准搭档，提供 `getHeaders()` 方法返回正确的 `Content-Type: multipart/form-data; boundary=...` 头，与 `node-fetch` 的 `fetch()` 天然兼容。上传代码改为：`const FD = require("form-data"); const fd = new FD(); fd.append("file", buffer, { filename: name }); fetch(url, { headers: { ...otherHeaders, ...fd.getHeaders() }, body: fd });`

---

## 77. reinstall 后旧 Bridge 进程未重启，仍运行旧代码

**现象**：reinstall 后报错仍然是旧代码的错误（如 `undici.Blob is not a constructor`），即使部署目录的 server.js 已经更新。

**根因**：reinstall 脚本用 `Get-Process -Name "node" | Where-Object { $_.CommandLine -like "*bridge*" }` 查找 Bridge 进程，但通过 VBS 启动器启动的 node 进程的 `CommandLine` 属性为空，过滤条件匹配不到。即使匹配到了，Bridge 以管理员权限运行（VBS 启动器通过 Startup 快捷方式以当前用户身份运行，但 Program Files 目录需要管理员权限），非管理员权限的 `Stop-Process -Force` 会报"拒绝访问"。结果是旧进程没停掉，新进程启动后端口冲突无法监听，实际仍在用旧代码。

**解决方案**：改用 `Get-NetTCPConnection -LocalPort 13628 | Where-Object { $_.State -eq "Listen" }` 按端口查找进程（比 CommandLine 更可靠），停止失败时用 `Start-Process powershell -Verb RunAs` 提权停止。

---

## 78. Fluidd Service Worker 拦截 WebUI 的 fetch 请求导致数据不显示

**现象**：WebUI 页面加载后所有数据模块（温度、打印状态等）都不显示，顶栏状态显示 "Fetch failed: Failed to fetch"。但 Camera 模块正常（能显示照片）。

**根因**：Fluidd 的 PWA 功能包含一个 Workbox Service Worker（`/fluidd/sw.js`），注册在 `/fluidd/` 路径下。在 BambuStudio WebView 中，Service Worker 的作用域可能被错误地扩展到整个 origin，导致它拦截了 WebUI 的 `fetch('/printer/objects/query?...')` 请求。Service Worker 可以拦截 `fetch()` API 的请求，但不能拦截 `new Image()` 的加载（Camera 用的是 Image 对象），所以 Camera 正常但数据 fetch 失败。

**解决方案**：在 Bridge 的 Express 路由中，在 `express.static` 之前注册 `/fluidd/sw.js` 的拦截路由，返回一个自动注销的 Service Worker 脚本（`self.registration.unregister()`）。同时拦截 `/fluidd/manifest.webmanifest` 返回 404，防止 PWA 行为。这样既阻止了新的 SW 注册，也会让已注册的 SW 自动注销。

---

## 79. BambuStudio WebView 阻止 fetch()/XMLHttpRequest，但不阻止 script/img 加载

**现象**：WebUI 在浏览器中正常工作，但在 BambuStudio 的 WebView 中所有 `fetch()` 和 `XMLHttpRequest` 调用都失败，报 "Failed to fetch" 或 "XHR network error"。`<img>` 标签加载图片和 `<script>` 标签加载 JS 正常。

**根因**：BambuStudio 的 `PrinterWebView`（基于 wxWebView/WebKit）对 `fetch()` 和 `XMLHttpRequest` API 施加了安全限制，阻止了这些网络请求。但浏览器原生的资源加载（`<script src="...">`、`<img src="...">`、`<link href="...">`）不受影响。这是 WebView 的安全策略，不是 CORS 或 Service Worker 问题。

**解决方案**：将所有 `fetch()`/`XMLHttpRequest` 调用替换为 JSONP 风格的 `<script>` 标签加载：
1. **GET 请求**：`bridgeGET(path, callback)` — 通过 `<script src="/api/bridge/proxy.js?path=xxx&cb=callbackName">` 加载，服务端代理 Moonraker 请求并返回 `callbackName(data);` 格式的 JS
2. **POST 请求**：`bridgePOST(path, body, callback)` — 将参数编码为 query string，通过 `<script src="/api/bridge/xxx.js?param1=1&cb=callbackName">` 的 GET 请求完成
3. **图片加载**：`new Image()` 替代 `fetch() + blob URL`
4. **初始数据**：`<script src="/api/bridge/init-data.js">` 直接加载

**关键代码**：
```javascript
function loadJS(url, cb) {
  var cbName = '_jscb' + (_jscb++);
  window[cbName] = function(d) { delete window[cbName]; cb(d); };
  var s = document.createElement('script');
  s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + cbName;
  s.onerror = function() { delete window[cbName]; cb(null); };
  document.head.appendChild(s);
}
```

---

## 80. mDNS 自动检测端口错误：MQTT 端口 1884 替代 HTTP 端口 80

**现象**：uninstall-重启-reinstall 后，WebUI 显示 reconnecting，无法连接打印机。Bridge 日志持续 `WS Moonraker error: read ECONNRESET`，WebSocket 每隔 4 秒重连一次均失败。

**根因**：`autoDetectPrinter()` 函数（server.js:765）使用 `service.port` 获取 mDNS 服务端口，U1 的 `_snapmaker._tcp.local.` mDNS 服务注册的端口是 **1884**（Snapmaker MQTT 端口），不是 Moonraker HTTP 端口 **80**。自动检测后将 `printerConfig.port` 设为 1884，`getBaseUrl()` 返回 `http://192.168.1.12:1884`，所有 HTTP API 和 WebSocket 请求都发到了 MQTT 端口，连接被重置。

日志证据：`Auto-detected printer: 192.168.1.12:1884`（应为 `:80`）

**解决方案**：`autoDetectPrinter()` 中移除 `service.port` 使用，硬编码 `printerConfig.port = 80`（Moonraker HTTP 端口始终是 80）。`/api/bridge/scan` 端点返回 `port: 80`（HTTP 端口）+ `mdns_port`（mDNS 原始端口，仅供参考）。

---

## 81. VBS 启动器使用裸 `node` 命令导致开机自启失败

**现象**：重启电脑后 Bridge 不运行，WebUI 显示 reconnecting。手动运行 `node server.js` 正常，但开机自启不生效。

**根因**：`start-hidden.vbs` 中使用 `WshShell.Run "node ""...\server.js""", 0, False`，裸 `node` 命令依赖 PATH 环境变量。Windows 登录时，Startup 文件夹的 VBS 脚本可能在用户 PATH 完全加载前执行，导致 `node` 找不到，Bridge 静默启动失败。

**解决方案**：VBS 启动器改用 `node.exe` 完整路径（如 `C:\Program Files\nodejs\node.exe`），安装脚本在创建 VBS 时自动检测并写入完整路径。`WshShell.Run """C:\Program Files\nodejs\node.exe"" ""...\server.js""", 0, False`

---

## 82. Flow Cal 按钮在 BambuStudio WebView 中点击无反应

**现象**：Filament 模块的 Flow Cal 按钮点击后无任何反应，不发送 G-code，不显示校准中状态。

**根因**：按钮 `onclick` 使用 `event.stopPropagation();calibrateFlow(0)`，BambuStudio 的 wxWebView 在内联 `onclick` 属性中不自动注入 `event` 对象，导致 `event is not defined` JavaScript 错误，后续 `calibrateFlow()` 不执行。

**解决方案**：移除 `event.stopPropagation()`，改用 `return false;` 阻止冒泡和默认行为：`onclick="calibrateFlow(0);return false;"`

---

## 83. Flow Cal 按钮点击无反应（部署版 gcode() 不返回值 + 无视觉反馈）

**现象**：v5.7.3 修复 #82 后，Flow Cal 按钮仍然点击无反应。按钮文字不变，无 alert 提示，功能"感觉没有实现"。

**根因**：
1. 部署目录（`C:\Program Files\Bambu Studio\bridge\web\webui.html`）运行的是旧版代码，`gcode()` 函数不返回 boolean 值，WS 未连接时静默失败无 alert
2. 部署版 `calibrateFlow()` 不改变按钮文字为"校准中..."，不检查 `gcode()` 返回值
3. 源码有两个 `gcode()` 函数定义（行 615 旧版 + 行 759-767 改进版），JavaScript 后者覆盖前者，但部署版只有旧版
4. 用户 reinstall 后部署目录未同步源码改进版

**解决方案**：
- 将行 615 的旧 `gcode()` 替换为改进版（返回 `true`/`false`，WS 断连时 `alert(t('reconnecting'))`）
- 删除行 759-767 的重复 `gcode()` 定义
- `calibrateFlow()` 添加 try-catch、console.log 调试、按钮文字变"校准中..."、gcode 失败时恢复按钮
- reinstall 后部署目录同步最新源码
