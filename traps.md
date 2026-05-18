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
- `"bed_model": "Snapmaker U1_bed.stl"`
- `"bed_texture": "Snapmaker U1_texture.svg"`

**参考**：Anker M5 官方配置 `"bed_model": "M5-CE-bed.stl"`，文件放在 `profiles/Anker/` 根目录下。
