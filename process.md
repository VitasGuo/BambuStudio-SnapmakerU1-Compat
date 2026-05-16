# Snapmaker U1 BambuStudio 兼容包

## 项目目标
将 Snapmaker U1 3D 打印机配置集成到 BambuStudio 中，实现切片功能

## 更新日期: 2026-05-16 (v3.12)

---

## 一、核心结论

### U1 局域网直连方案（v2.0 新增）
U1 内置 Moonraker 服务（基于 Klipper），Moonraker 提供了 **OctoPrint API 兼容层**。BambuStudio 原生支持 OctoPrint 主机类型，因此可以通过 OctoPrint 协议直接与 U1 通信，实现：
- ✅ G-code 文件上传到 U1
- ✅ 上传后自动开始打印
- ✅ 连接测试
- ✅ API Key 认证

**技术原理**：
- BambuStudio `OctoPrint` 类调用 `GET /api/version` 测试连接 → Moonraker 返回 `{"api": "0.1", "text": "OctoPrint (Moonraker ...)"}`
- BambuStudio `OctoPrint` 类调用 `POST /api/files/local` 上传文件 → Moonraker 兼容层接收 multipart 上传
- `validate_version_text` 检查 text 是否以 "OctoPrint" 开头 → Moonraker 返回的 text 以 "OctoPrint" 开头 ✅
- `host_type` 默认值就是 `htOctoPrint`，无需修改任何代码

**配置步骤**：在 BambuStudio 物理打印机设置中选择 OctoPrint 主机类型，输入 U1 的 IP 地址和 Moonraker API Key。

### 为什么之前不能"连接"U1？
BambuStudio 的 BambuLab 品牌打印机使用专有的 MQTT/FTP 协议，与 U1 不兼容。但 BambuStudio 同时支持多种局域网主机类型（OctoPrint、Duet、FlashAir 等），其中 OctoPrint 与 Moonraker 完美兼容。

---

## 二、Snapmaker U1 关键参数

| 参数 | 值 |
|------|-----|
| 打印尺寸 | 270 × 270 × 270 mm |
| 结构 | CoreXY |
| 固件 | **Klipper** (非 Marlin！) |
| 喷头数量 | 4 个独立工具头 (换头式) |
| 喷嘴直径 | 0.2 / 0.4 / 0.6 / 0.8 mm |
| 最高喷嘴温度 | 300°C |
| 热床温度 | 最高 110°C |
| 最大打印速度 | 300 mm/s |
| 最大空行程速度 | 500 mm/s |
| 最大加速度 | 20,000 mm/s² |
| 换色时间 | < 10 秒 |
| G-code 格式 | Klipper 风格 (使用 PRINT_START/PRINT_END 宏) |

---

## 三、兼容包实现

### 策略（v2.0 全新方案）
**从零创建**最小化 U1 配置文件，所有字段名均来自 BambuStudio 原生 Anker 模板，彻底避免 OrcaSlicer 不兼容字段问题。

v1.x 方案（从 OrcaSlicer 复制后移除不兼容字段）失败原因：
- OrcaSlicer 有 93+ 个 BambuStudio 不识别的字段
- 正则替换无法可靠处理所有 JSON 值类型，容易破坏 JSON 结构
- 即使移除 93 个字段 698 个实例，BambuStudio 仍然报错

### 文件结构
```
BambuStudio-SnapmakerU1-Compat/
├── install.bat              # 安装启动器（调用 PowerShell）
├── install.ps1              # 安装脚本 v3.12（缓存清理 + 文件复制 + 验证）
├── reinstall.bat            # 重装启动器（一键卸载+安装）
├── reinstall.ps1            # 重装脚本（先卸载再安装）
├── uninstall.bat            # 卸载启动器
├── uninstall.ps1            # 卸载脚本
├── Snapmaker.json           # 品牌配置（仅 U1）
└── Snapmaker/
    ├── machine/
    │   ├── Snapmaker U1.json                    # 机器模型定义
    │   ├── Snapmaker U1 (0.4 nozzle).json       # 0.4mm 喷嘴配置
    │   └── fdm_machine_common.json              # 机器基础配置 (Klipper)
    ├── process/
    │   ├── fdm_process_common.json              # 工艺基础配置
    │   └── fdm_process_U1_*.json                # 各层高工艺预设
    └── filament/
        ├── fdm_filament_common.json             # 耗材基础配置
        ├── fdm_filament_pla.json                # PLA 基类
        ├── fdm_filament_pet.json                # PETG 基类
        ├── fdm_filament_abs.json                # ABS 基类
        ├── fdm_filament_tpu.json                # TPU 基类
        ├── Snapmaker *.json                     # Snapmaker 品牌耗材
        ├── Bambu *.json                         # Bambu Lab 品牌耗材
        └── Generic *.json                       # Generic 通用耗材
```

### 配置继承链
- **机器**: `fdm_machine_common` → `Snapmaker U1 (0.4 nozzle)`
- **工艺**: `fdm_process_common` → `fdm_process_U1_0.XX` → 具体预设（如 `0.20 Standard @Snapmaker U1`）
- **耗材**: `fdm_filament_common` → `fdm_filament_pla` → `Snapmaker PLA Basic @U1`（PETG/ABS/TPU 类似）

### 关键技术点
1. **Klipper 固件**：U1 使用 Klipper，不是 Marlin。`gcode_flavor: "klipper"`
2. **换头式设计**：4 个独立工具头，`single_extruder_multi_material: "0"`，4 种挤出机颜色
3. **Klipper 宏**：start_gcode 使用 `PRINT_START` 宏，end_gcode 使用 `PRINT_END` + `TIMELAPSE_STOP`
4. **U1 特有参数**：20000mm/s² 加速度、500mm/s 空行程、1.5mm 回抽长度、Prime Tower 启用
5. **所有字段名均为 BambuStudio 原生**：参照 Anker 模板创建，不存在不兼容字段
6. **完整 Start G-code**：包含 U1 全部初始化步骤（回零、调平、进料、校准、清洁喷嘴、画起始线）
7. **相对挤出模式**：`use_relative_e_distances: "1"`，BambuStudio 擦料塔硬性要求
8. **BambuStudio 模板变量**：使用 `{initial_extruder}`、`{nozzle_temperature[initial_extruder]}`、`{bed_temperature_initial_layer_single}` 等原生变量

---

## 四、安装方法

### 方式一：使用安装脚本（推荐）
1. 右键 `install.bat` → 以管理员身份运行
2. 脚本自动：清除缓存 → 复制文件 → 验证
3. 重启 BambuStudio
4. 在"添加打印机"中选择 Snapmaker → U1

### 方式二：重装（卸载+安装一步完成）
1. 右键 `reinstall.bat` → 以管理员身份运行
2. 脚本自动：深度清理 → 卸载 → 安装 → 验证

### 方式三：手动安装
1. 将 `Snapmaker.json` 复制到 `C:\Program Files\Bambu Studio\resources\profiles\`
2. 将 `Snapmaker\` 目录复制到 `C:\Program Files\Bambu Studio\resources\profiles\`
3. 删除 `%APPDATA%\BambuStudioBeta\system\Snapmaker` 缓存目录
4. 重启 BambuStudio

### 卸载
运行 `uninstall.bat`（以管理员身份）

---

## 五、G-code 验证结果

### 对比方法
使用同一多色模型，分别在 BambuStudio（兼容包）和 Snapmaker Orca 中切片，对比生成的 G-code。

### 对比结论：✅ 高度一致

| 项目 | BambuStudio V3 | Snapmaker Orca | 状态 |
|------|---------------|----------------|------|
| Start G-code 完整流程 | ✅ 80+ 行 | ✅ 80+ 行 | 一致 |
| PRINT_START | ✅ | ✅ | 一致 |
| DEFECT_DETECTION_START/DETECT_BED | ✅ | ✅ | 一致 |
| SM_PRINT_AUTO_FEED × 4 | ✅ | ✅ | 一致 |
| SM_PRINT_FLOW_CALIBRATE × 4 | ✅ | ✅ | 一致 |
| G28 X Y / G28 Z | ✅ | ✅ | 一致 |
| BED_MESH_CALIBRATE | ✅ | ✅ | 一致 |
| ROUGHLY/FINELY_CLEAN_NOZZLE | ✅ | ✅ | 一致 |
| 画起始线 | ✅ | ✅ | 一致 |
| 热床温度 | ✅ 65°C | ✅ 65°C | 一致 |
| 喷嘴温度 | ✅ 220°C | ✅ 220°C | 一致 |
| 工具切换 T0→T1→T2→T3 | ✅ | ✅ | 一致 |
| 擦料塔 (Prime Tower) | ✅ | ✅ | 一致 |
| PRINT_END + TIMELAPSE_STOP | ✅ | ✅ | 一致 |
| M83 相对挤出 | ✅ | ✅ | 一致 |

### 可接受的微小差异
1. **SET_PRESSURE_ADVANCE**：Orca 在换色时自动插入 `SET_PRESSURE_ADVANCE ADVANCE=0.0200`，BambuStudio 不支持。Klipper 的 PRINT_START 宏中通常会设置默认 PA 值，影响不大
2. **M220 速度控制**：Orca 用 `M220 B/S100/R` 组合，BambuStudio 只用 `M220 S100`。功能等价
3. **SM_PRINT_PREEXTRUDE_FILAMENT**：Orca 换色后有此宏，BambuStudio 的擦料塔已包含等效清洗功能
4. **换色后冷却**：Orca 有 `M104 S70 Tn ; cooldown`，BambuStudio 擦料塔逻辑不同，不需要手动冷却

---

## 六、已知问题与修复记录

### v3.12 修复（G-code 验证 + Snapmaker 耗材品牌对齐官方 + Bambu/Generic 耗材全面对齐 BBL 官方）

**G-code 对比验证**：使用同一模型（水浪纹），分别在 Orca 和 BambuStudio 中用相同耗材切片，对比 G-code 中的实际参数值。

**PLA 系列验证结果**：✅ 全部一致（Basic/Matte/Silk/SnapSpeed 的温度、风扇、流量、回抽等参数完全匹配）

**重大发现：Orca 官方 Snapmaker 品牌耗材与兼容包不一致**：
- Orca 的 Snapmaker 品牌耗材清单：PLA Basic、PLA Matte、PLA Silk、PLA SnapSpeed、PETG HF、TPU 90A、TPU 95A HF
- 兼容包的 Snapmaker 品牌耗材清单：PLA、PLA Basic、PLA Matte、PLA Silk、PLA SnapSpeed、PLA-CF、PETG、ABS、TPU
- 差异：Orca 没有 PLA/PLA-CF/ABS，PETG 是 HF 版本，TPU 按硬度分两种

**耗材品牌对齐**：

| 操作 | 文件 | 原因 |
|------|------|------|
| 删除 | Snapmaker PLA @U1 | Orca 无此耗材 |
| 删除 | Snapmaker PLA-CF @U1 | Orca 无此耗材 |
| 删除 | Snapmaker ABS @U1 | Orca 无此耗材 |
| 删除 | Snapmaker PETG @U1 | 替换为 PETG HF |
| 删除 | Snapmaker TPU @U1 | 拆分为 90A 和 95A HF |
| 新增 | Snapmaker PETG HF @U1 | 匹配 Orca 官方，温度 245°C、max_vol_speed 20、密度 1.28 |
| 新增 | Snapmaker TPU 90A @U1 | 匹配 Orca 官方，max_vol_speed 3.2、flow_ratio 1.045、风扇 100% |
| 新增 | Snapmaker TPU 95A HF @U1 | 匹配 Orca 官方，max_vol_speed 9、flow_ratio 1.067、风扇 50/10 |

**PETG HF vs 标准 PETG 关键差异**：温度 245 vs 230、max_vol_speed 20 vs 8、密度 1.28 vs 1.25、temp_vitrification 70 vs 178

**TPU 90A vs 95A HF 关键差异**：90A 更软（max_vol_speed 3.2 vs 9、flow_ratio 1.045 vs 1.067）、90A 风扇全开（100/100 vs 50/10）、90A 冷却更保守（slow_down 14s vs 10s）

**新增 reinstall.bat/ps1**：合并卸载+安装流程，深度清理 BambuStudio.conf 缓存（filaments/models/presets/nozzle_volume_types 全部清理），解决"刷新不生效"问题。

**修复 install.ps1/uninstall.ps1**：验证步骤从 `Snapmaker PLA @U1.json` 改为 `Snapmaker PLA Basic @U1.json`；正则更新覆盖新耗材名（PETG HF/TPU 90A/TPU 95A HF）。

**Bambu 耗材对齐 BBL 官方源文件**：
- 修复 PPS-CF 温度（240→320）和流速
- 修复 ASA filament_type
- 补全 ABS/ABS-GF 温度和风扇参数
- 补全 Support for ABS 温度覆盖
- 修复 PA-CF 温度（280→290）和热床（110→100）
- 补全 PA6-CF/PA6-GF/PAHT-CF 参数
- 修复 PETG Basic 温度（250→245）和 temperature_vitrification（60→178）
- 修复 PETG HF 温度（245→240）
- 修复 PETG Translucent/PETG-CF 热床（80→70）
- 修复 TPU 全系列热床（65→45）
- 修复 PC/PC FR 热床（110→100）和风扇
- 补全 PPA-CF/PVA 完整配置
- 修复 Support For PLA-PETG 继承基类（fdm_filament_pet→fdm_filament_pla）
- 修复 PET-CF 热床（80→100）和 nozzle HRC（55→40）

**Generic 耗材修复**：
- 修复 PPS-CF/PLA-CF/PETG-CF 的 nozzle HRC（55→40）
- 修复 PETG-CF 热床（80→70）

### v3.11 修复（Snapmaker 耗材全量对齐官方安装版 Orca — 完整继承链解析）

**重大发现**：v3.10 的耗材对比只看了 @U1 文件本身，未解析完整继承链的有效值。解析 Orca 完整链（@U1 → @U1 base → fdm_filament_* → fdm_filament_common）后发现大量隐藏差异，尤其是 TPU 和 ABS/PETG 的温度偏差。

**方法论改进**：从"对比 @U1 文件参数"升级为"解析完整继承链后对比有效参数值"。

**各耗材修复明细**：

| 耗材 | 修复项 | 严重程度 |
|------|--------|---------|
| TPU @U1 | nozzle_temperature 240→225, nozzle_temperature_initial_layer 240→230, max_volumetric_speed 15→4.5, fan_max/min/overhang 100→70, slow_down_for_layer_cooling 1→0, pressure_advance 0.04→0.01, temperature_vitrification 60→45, filament_density 1.24→1.22, retraction_speed/deretraction_speed nil→25, z_hop nil→0 Normal Lift, hot_plate_temp 65→60, retract_when_changing_layer nil→0 | CRITICAL |
| ABS @U1 | nozzle_temperature 240→255, nozzle_temperature_initial_layer 240→265, filament_retraction_length nil→0.6, filament_z_hop nil→0.7, fan_min_speed 10→15, temperature_vitrification 110→100, slow_down_min_speed 10→20, nozzle_temperature_range_high 270→280 | HIGH |
| PETG @U1 | nozzle_temperature 250→230, hot_plate_temp 80→75, filament_retraction_length nil→1.8, filament_retraction_speed nil→35, filament_z_hop_types nil→Spiral Lift, nozzle_temperature_range_high 260→270 | HIGH |
| PLA @U1 | max_volumetric_speed 15→14, temperature_vitrification 60→65, overhang_fan_threshold 50%→0%, slow_down_min_speed 10→15, nozzle_temperature_range_high 230→240 | MEDIUM |
| PLA Basic @U1 | 添加 filament_retract_length_toolchange: 10 | LOW |
| PLA Matte @U1 | 添加 filament_retract_length_toolchange: 5 | LOW |
| PLA Silk @U1 | 添加 dont_slow_down_outer_wall: 1, filament_retract_length_toolchange: 5 | LOW |
| PLA SnapSpeed @U1 | 添加 filament_retract_length_toolchange: 5 | LOW |
| PLA-CF @U1 | 添加 filament_minimal_purge_on_wipe_tower: 50, filament_retract_length_toolchange: 5 | LOW |

**TPU 是差异最大的耗材**：max_volumetric_speed 差 3 倍（15 vs 4.5），温度差 15°C，风扇策略完全不同（100% vs 70%），slow_down_for_layer_cooling 相反（1 vs 0）。使用 v3.10 的 TPU 参数会导致严重过挤和拉丝。

**ABS/PETG 温度偏差**：ABS 低 15°C（240 vs 255），PETG 高 20°C（250 vs 230）。温度偏差会直接影响打印质量。

### v3.10 修复（全量 Snapmaker 耗材对齐官方安装版 Orca）

**重大发现**：之前参考的 GitHub 仓库版本已过时，官方安装版 Orca 参数有显著差异（如 SnapSpeed 热床温度 45→65、enable_pressure_advance 全部关闭等）。

**系统性修复**：
1. **enable_pressure_advance**：除 PLA-CF 外全部从 1 改为 **0**（Orca 官方 U1 配置关闭 PA）

**各耗材修复明细**：

| 耗材 | 修复项 |
|------|--------|
| PLA @U1 | hot_plate_temp 65→55, hot_plate_temp_initial_layer 65→55, PA关闭 |
| PLA Basic @U1 | hot_plate_temp_initial_layer 70→65, PA关闭 |
| PLA Matte @U1 | nozzle_temperature 220→215, flow_ratio 0.98→1, max_vol_speed 15→22, hot_plate_temp_initial_layer 70→65, PA关闭 |
| PLA Silk @U1 | nozzle_temperature 220→230, max_vol_speed 12→10, PA 0.02→0.015, retraction_length 添加0.2, PA关闭 |
| PLA SnapSpeed @U1 | hot_plate_temp 45→65(回退v3.9错误), hot_plate_temp_initial_layer 45→65, flow_ratio 0.98→0.966, retraction_length 添加1.2, z_hop 添加0.4 Slope Lift, PA关闭 |
| PLA-CF @U1 | hot_plate_temp_initial_layer 70→65 |
| PETG @U1 | PA 0.04→0.02, max_vol_speed 10→8, nozzle_temp_initial_layer 240→250, density 1.27→1.25, PA关闭 |
| ABS @U1 | hot_plate_temp 100→110, hot_plate_temp_initial_layer 100→105, max_vol_speed 添加8, fan_max_speed 添加15, PA关闭 |
| TPU @U1 | 无差异 ✅ |

### v3.9 修复（V2 G-code 验证 — 热床温度修正）

**发现**：V2 G-code 验证发现 `hot_plate_temp_initial_layer` 仍为 65°C，原因是 SnapSpeed @U1 文件覆盖了基类的值。

**关键发现**：Orca 官方 SnapSpeed PLA 的热床温度远低于普通 PLA：
- SnapSpeed: hot_plate_temp=45, hot_plate_temp_initial_layer=45（不是 65/70！）
- PLA Basic/Matte: hot_plate_temp=65, hot_plate_temp_initial_layer=70
- PLA Silk: hot_plate_temp=65, hot_plate_temp_initial_layer=65

**修复**：
1. `Snapmaker PLA SnapSpeed @U1.json`：hot_plate_temp 65→45, hot_plate_temp_initial_layer 65→45
2. `Snapmaker PLA Basic @U1.json`：hot_plate_temp_initial_layer 65→70
3. `Snapmaker PLA Matte @U1.json`：hot_plate_temp_initial_layer 65→70
4. `Snapmaker PLA-CF @U1.json`：hot_plate_temp_initial_layer 65→70
5. `Snapmaker PLA Silk @U1.json`：无需修改（65 已是 Orca 官方值）

### v3.8 修复（水浪纹模型 G-code 深度对比 — 参数对齐 Orca 官方值）

**对比方法**：使用同一多色模型（水浪纹），同一耗材（Snapmaker PLA SnapSpeed），分别在 BambuStudio 和 Snapmaker Orca 中切片，对比 G-code 中的实际参数值。

**CRITICAL 修复**：
1. **retract_length_toolchange 严重偏低**：2 → 10（Orca 官方值），换色回抽只有 2mm 导致严重漏料
2. **Snapmaker PLA SnapSpeed 喷嘴温度过高**：230°C → 220°C，比 Orca 官方值高 10°C 导致过挤拉丝

**HIGH 修复**：
3. **retraction_length 偏低**：0.8 → 1.5，回抽不足导致漏料
4. **inner_wall_acceleration 偏低**：5000 → 10000，内墙加速度只有 Orca 一半
5. **bridge_acceleration 偏低**：1000(绝对) → 50%(=5000)，桥接加速度极低
6. **bridge_flow 过高**：1.0 → 0.8，桥接过挤导致下垂
7. **initial_layer_print_height 偏低**：所有工艺预设添加首层高度覆盖（0.08→0.1, 0.12→0.2, 0.16→0.2, 0.20→0.25, 0.24→0.3, 0.28→0.3）

**MEDIUM 修复**：
8. **deretraction_speed 过高**：60 → 30，复进过快导致欠挤
9. **retraction_speed 过高**：40 → 30，回抽过快可能打滑
10. **filament_density 偏差**：1.32 → 1.24（Orca 官方值）
11. **filament_max_volumetric_speed 偏高**：22 → 20（Orca 官方值）
12. **所有 jerk 值偏高**：对齐 Orca 官方值（default_jerk 15→0, infill_jerk 15→9, initial_layer_jerk 12→9, inner_wall_jerk 15→9, outer_wall_jerk 10→9, top_surface_jerk 12→9, travel_jerk 20→12）
13. **fdm_filament_pla 热床温度修正**：cool_plate_temp 65→60, eng_plate_temp 65→60, hot_plate_temp_initial_layer 65→70

**修改文件清单**（10 个）：
- `fdm_machine_common.json`：retract_length_toolchange, retraction_length, deretraction_speed, retraction_speed
- `fdm_process_common.json`：inner_wall_acceleration, bridge_acceleration, bridge_flow, 7 个 jerk 值
- `fdm_process_U1_0.20.json`：添加 initial_layer_print_height=0.25
- `fdm_process_U1_0.08.json`：添加 initial_layer_print_height=0.1, bridge_flow 1→0.8
- `fdm_process_U1_0.12.json`：添加 initial_layer_print_height=0.2, bridge_flow 1→0.8
- `fdm_process_U1_0.16.json`：添加 initial_layer_print_height=0.2, bridge_flow 1→0.8
- `fdm_process_U1_0.24.json`：添加 initial_layer_print_height=0.3, bridge_flow 1→0.8
- `fdm_process_U1_0.28.json`：添加 initial_layer_print_height=0.3, bridge_flow 1→0.8
- `Snapmaker PLA SnapSpeed @U1.json`：nozzle_temperature 230→220, filament_density 1.32→1.24, filament_max_volumetric_speed 22→20
- `fdm_filament_pla.json`：cool_plate_temp 65→60, eng_plate_temp 65→60, hot_plate_temp_initial_layer 65→70

### v3.7 修复（项目审查 — 配置完整性与数据一致性）

**审查发现**：全面审查 85 个耗材文件 + 12 个机器/工艺文件，发现 5 个 CRITICAL、5 个 HIGH、8 个 MEDIUM、10 个 LOW 级别问题。

**CRITICAL 修复**：
1. **Snapmaker TPU 热床温度过低**：继承 `fdm_filament_tpu` 的 `hot_plate_temp=35`，TPU 无法附着 → 覆盖为 65°C
2. **PPA-CF filament_type 缺失**：Bambu/Generic PPA-CF 继承 ABS 的 filament_type → 添加 `"PPA-CF"` 覆盖
3. **Bambu PPA-CF 配置极度不完整**：缺少 nozzle_temperature（继承 240°C，实际需 290°C）、filament_flow_ratio、filament_density 等 18 个参数 → 参照 BBL 官方 `fdm_filament_ppa` 补全

**HIGH 修复**：
4. **Snapmaker 基础耗材缺少关键字段**：PLA/ABS/PETG/TPU 4 个文件缺少 enable_pressure_advance、pressure_advance、热床温度覆盖 → 补全
5. **Snapmaker PETG cool_plate_temp 不当**：继承 60°C，PETG 会粘死冷板 → 改为 0（禁用冷板）

**MEDIUM 修复**：
6. **PETG Basic temperature_vitrification 异常**：60 → 178（与 PETG 基类一致）
7. **CF/GF 材料缺少 required_nozzle_HRC**：21 个文件添加 `required_nozzle_HRC: ["40"]`（PPA-CF/PA-CF 系列）或 `["55"]`（其他 CF/GF）
8. **Generic PE/PP/PCTG filament_type 缺失**：添加 `"PE"`/`"PP"`/`"PCTG"` 覆盖
9. **Bambu PLA Dynamic 缺少 filament_flow_ratio**：添加 `["0.98"]`
10. **数据类型不一致**：10 个文件 12 处整数→字符串（如 `[702]` → `["702"]`）

**LOW 修复**：
11. **fdm_process_U1_0.20 冗余覆盖**：移除 8 个与 fdm_process_common 相同的值，添加显式 `layer_height: "0.2"`
12. **fdm_filament_common 默认 vendor**：`"Snapmaker"` → `""`（基类不应指定厂商）

**待验证项**（需要 G-code 验证后再决定）：
- filament_id 重复（4 对 Snapmaker/Generic 共享 ID）
- 高温材料 nozzle_temperature 缺失（PC/PAHT-CF 等，C2）
- standby_temperature_delta 机器/工艺冲突（H1）
- machine_pause_gcode 为空（H2）
- change_filament_gcode Z 归位问题（M1）
- 0.08/0.12 工艺预设速度超限（M2）
- bed_model/bed_texture 为空（L2）

### v3.5 新增（完整工艺预设 + G-code 模板修复 + filament_vendor 修复）

**工艺预设移植**（从 Orca 官方 U1 预设移植，参考 BBL A1 继承结构）：

继承链：`fdm_process_common` → `fdm_process_U1_0.XX` → 具体预设

| 预设 | 层高 | 特点 |
|------|------|------|
| 0.08 Extra Fine | 0.08mm | 极细层线 |
| 0.08 High Quality | 0.08mm | 低速+gyroid填充 |
| 0.12 Fine | 0.12mm | 细层线 |
| 0.12 High Quality | 0.12mm | 低速+gyroid填充 |
| 0.16 Optimal | 0.16mm | 平衡质量/速度 |
| 0.16 High Quality | 0.16mm | 低速+gyroid填充 |
| 0.20 Standard | 0.20mm | 通用默认 |
| 0.20 Strength | 0.20mm | 6层壁+25%填充 |
| 0.24 Draft | 0.24mm | 快速草稿 |
| 0.28 Extra Draft | 0.28mm | 极速草稿 |

**参数来源**：速度/加速度/层高参数来自 Orca U1 官方预设（与 BBL A1 的 `fdm_process_single_0.xx` 完全一致），U1 特有参数（`smooth_coefficient: 150`、`overhang_totally_speed: 50`）来自 Orca 的 U1 机型层。

**G-code 模板修复**（与 Orca 官方 G-code 对比发现）：
1. `TIMELAPSE_START` 添加到 start gcode
2. `TIMELAPSE_TAKE_FRAME` + `DEFECT_DETECTION_DETECT` 添加到 before_layer_change_gcode
3. G28 Z / BED_MESH_CALIBRATE 添加 `curr_bed_type` 条件分支（高温板 Z_OFFSET=-0.07）

**filament_vendor 品牌归类修复**：30 个批量生成的耗材文件缺少 `filament_vendor` 字段，导致 Bambu/Generic 耗材被错误归类到 Snapmaker 品牌。

**Orca 专属字段排除**（BambuStudio 不支持）：`slowdown_for_curled_perimeters`、`bridge_density`、`wipe_tower_cone_angle`、`wipe_tower_extra_rib_length`、`wipe_tower_wall_type`、`preheat_time`、`preheat_steps`

### v3.4 修复（G-code 模板补全 + filament_vendor 品牌归类）

**G-code 对比发现的问题**（与 Orca 官方配置对比）：

1. **`TIMELAPSE_START` 缺失**：start gcode 中缺少 `TIMELAPSE_START`，导致缩时摄影功能不完整
2. **`TIMELAPSE_TAKE_FRAME` + `DEFECT_DETECTION_DETECT` 缺失**：`before_layer_change_gcode` 中缺少这两个命令，导致每层不拍缩时照片、不触发异物检测
3. **G28 Z / BED_MESH_CALIBRATE 条件分支缺失**：高温板和纹理板需要 `Z_OFFSET=-0.07`，但之前只有简单的 `G28 Z`
4. **`filament_vendor` 缺失**：30 个批量生成的耗材文件缺少 `filament_vendor` 字段，导致 Bambu/Generic 耗材被错误归类到 Snapmaker 品牌

**修复内容**：
1. `fdm_machine_common.json`：start gcode 添加 `TIMELAPSE_START`
2. `fdm_machine_common.json`：`before_layer_change_gcode` 添加 `TIMELAPSE_TAKE_FRAME\nDEFECT_DETECTION_DETECT`
3. `fdm_machine_common.json`：G28 Z 和 BED_MESH_CALIBRATE 添加 `curr_bed_type` 条件分支
4. 30 个 @U1 耗材文件添加正确的 `filament_vendor` 字段

**不需要修复的默认参数差异**（用户可在 UI 中调整）：
- 回抽参数（0.8mm vs 1.5mm）、首层高度（0.20mm vs 0.25mm）、擦料塔宽度（15mm vs 30mm）
- M220 速度控制方式差异、SM_PRINT_PREEXTRUDE_FILAMENT 缺失（BambuStudio 擦料塔逻辑不同）

### v3.3 修复（耗材可见性缓存问题 — 最关键修复）

**问题**：80 个耗材文件全部正确加载（无报错），但 BambuStudio 只显示 2 个可用耗材（"Bambu PLA Basic @U1" 和 "Snapmaker PLA @U1"）。其余耗材要么在"不支持"列表，要么完全不可见（连不支持列表都没有）。

**根因分析**（BambuStudio 源码 PresetBundle.cpp:1864-1924）：

1. `BambuStudio.conf` 的 `filaments` 数组缓存了"已安装"耗材列表
2. `load_installed_filaments` 遍历每个可见打印机，检查缓存中是否已有兼容耗材
3. **如果已有任何一个 → `add_default_materials = false` → 跳过添加默认耗材**
4. 因为 `"Snapmaker PLA @U1"` 已在缓存中 → 其余 79 个耗材全部不添加
5. `set_visible_from_appconfig` 只让缓存中存在的耗材可见

**为什么之前的 install 脚本无法修复**：

`filaments` 段是 JSON 数组格式 `["name1", "name2"]`，而 install 脚本的正则 `"[^"]*@U1":\s*"[^"]*"` 匹配的是 key-value 格式 `"key": "value"`，根本匹配不到数组元素。

**修复内容**：
1. install.ps1 改用 `ConvertFrom-Json` / `ConvertTo-Json` 进行 JSON 感知的缓存清理
2. 精确删除 `filaments` 数组中所有 `@U1` 和 `Snapmaker` 条目
3. 保留 `models` 段中的 Snapmaker U1 条目（不删除），确保打印机重启后仍可见
4. 这样 `add_default_materials` 在下次启动时重新运行，自动添加所有默认耗材
5. uninstall.ps1 同步更新，额外清理 `models` 段和 `presets` 段

**其他 v3.x 修复**：
- v3.0.1：批量生成脚本的 JSON 格式修复（尾部逗号、gcode 换行、缺失 setting_id）
- v3.1：添加 `default_materials` 到打印机配置（未解决可见性问题）
- v3.2：`compatible_printers_condition` 改为 `compatible_printers: ["Snapmaker U1 (0.4 nozzle)"]`（BBL 官方做法）

### v3.0 新增（全品牌耗材库支持）

**重大更新**：从 BBL 内置耗材库批量创建 U1 兼容耗材，覆盖 Bambu Lab、Generic、第三方品牌共 **100 个耗材预设**。

**技术方案**：
- 每个耗材文件继承我们自己的 `fdm_filament_*` 基类（不是跨厂商继承 BBL 的）
- 从 BBL 的 `@base` 文件提取材料特有参数（温度、流量比、风扇曲线等）
- 覆盖 U1 特有参数：热床温度、Pressure Advance、兼容性条件

**耗材分类**（100 个）：

| 品牌 | 数量 | 具体型号 |
|------|------|---------|
| Bambu Lab | 46 | PLA Basic/Dynamic/Matte/Silk/Galaxy/Glow/Marble/Metal/Sparkle/Tough/Tough+/Translucent/Aero/Wood/Lite/PLA-CF, PETG Basic/HF/Translucent/PETG-CF, ABS/ABS-GF, ASA/ASA-CF/ASA-Aero, TPU 85A/90A/95A/95A HF/for AMS, PC/PC FR, PA-CF/PA6-CF/PA6-GF/PAHT-CF, PET-CF, PPA-CF, PPS-CF, PVA, Support For PLA/PLA-PETG/for ABS |
| Generic | 32 | PLA/PLA High Speed/PLA Silk/PLA-CF, PETG/PETG HF/PETG-CF/PCTG, ABS, ASA, PC, PA-CF, PE/PE-CF, PP/PP-CF/PP-GF, PPA-CF/PPA-GF, PPS-CF, PVA, BVOH, HIPS, EVA, PHA, TPU/TPU for AMS/TPU 95A HF |
| PolyLite/PolyTerra | 5 | PLA, PETG, ABS, ASA |
| Overture | 2 | PLA, Matte PLA |
| eSUN | 1 | PLA+ |
| SUNLU | 7 | PLA+/PLA+ 2.0/PLA Matte/Silk PLA+/Wood PLA/Marble PLA, PETG |
| Fiberon | 5 | PA6-CF/PA6-GF, PET-CF, PETG-ESD/PETG-rCF |

**跳过的耗材**（9 个）：
- `Bambu Support For PA PET`：BBL 源文件名与 @base 文件名不匹配
- `Bambu Support G/W`：支撑材料，材料类型无法自动识别
- `Generic PA/PPS`：纯材料无 @base 文件
- `Fiberon PA12-CF/PA612-CF`：材料类型未在 PA 映射表中

**PA 值映射**（基于 OrcaSlicer U1 官方配置）：

| 材料类型 | PA 值 | 继承基类 | U1 热床温度 |
|---------|-------|---------|-----------|
| PLA 系列 | 0.02 | fdm_filament_pla | 65°C |
| PLA-CF | 0.01 | fdm_filament_pla | 65°C |
| PETG | 0.04 | fdm_filament_pet | 80°C |
| PETG-CF | 0.02 | fdm_filament_pet | 80°C |
| ABS/ASA | 0.02 | fdm_filament_abs | 100°C |
| ABS-GF/ASA-CF | 0.01 | fdm_filament_abs | 100°C |
| TPU | 禁用 | fdm_filament_tpu | 65°C |
| PC | 0.02 | fdm_filament_abs | 110°C |
| PA-CF/PA6-CF/PAHT-CF | 0.01 | fdm_filament_abs | 100°C |
| PPS-CF | 0.01 | fdm_filament_abs | 110°C |

### v2.5 修复（filament_list 加载顺序 + 安装脚本嵌套目录）

**问题**：添加 `Bambu PLA Basic @U1.json` 后，BambuStudio 报 "Failed loading configuration file" 错误，即使清理了 `system` 和 `user\default` 缓存也无法解决。

**根因分析**（BambuStudio 源码 PresetBundle.cpp:5246-5270）：
1. BambuStudio 按顺序处理 `filament_list` 中的文件，逐个加载到 `config_maps`
2. 当处理 `Bambu PLA Basic @U1`（`inherits: "fdm_filament_pla"`）时，`fdm_filament_pla` 还没被加载到 `config_maps`
3. `config_maps.find("fdm_filament_pla")` 返回 `end()`，触发 "Can not find inherits" 错误
4. 第一个文件失败后直接抛出 `ConfigurationError`，中断所有后续文件加载

**根本原因**：`_update_vendor_json.ps1` 使用 `Sort-Object Name` 按字母排序，"Bambu" 排在 "fdm_" 前面，导致继承文件排在基础文件之前。BBL 官方的 `BBL.json` 中 `fdm_filament_common` 排在第一位（行71），所有具体耗材排在后面。

**修复内容**：
1. **Snapmaker.json**：重新排序 `filament_list`，基础文件（`instantiation: "false"`）排在前面
2. **_update_vendor_json.ps1**：改为按 `instantiation` 字段分组排序，基础文件优先
3. **install.ps1**：修复嵌套目录问题（先删除目标目录再复制），添加 `user\default` 中 Snapmaker 相关文件清理
4. **版本号**：升级到 `02.00.05.00`

**加载顺序对比**：
| 修复前（字母排序） | 修复后（基础优先） |
|---|---|
| Bambu PLA Basic @U1 ← 继承失败！ | fdm_filament_common |
| fdm_filament_abs ← 也继承失败！ | fdm_filament_abs |
| fdm_filament_common | fdm_filament_pet |
| fdm_filament_pet | fdm_filament_pla |
| fdm_filament_pla | fdm_filament_tpu |
| fdm_filament_tpu | Bambu PLA Basic @U1 ✅ |
| Snapmaker PLA @U1 | Snapmaker PLA @U1 ✅ |

### v2.4 修复（BBL 耗材完整参数复制）

**问题**：v2.3 尝试使用跨厂商继承（`inherits: "Bambu PLA Basic @base"`），但 BambuStudio 的 `load_vendor_configs_from_json` 函数在加载预设时使用厂商内部的 `config_maps` 查找继承目标，跨厂商的 `@base` 文件不在 `config_maps` 中，导致 "Can not find inherits" 错误。

**源码证据**（PresetBundle.cpp:4736-4751）：
```cpp
auto it2 = config_maps.find(inherits);
if (it2 != config_maps.end()) {
    default_config = &(it2->second);
} else {
    reason = "Can not find inherits: " + inherits;
    return reason;
}
```

**修复方案**：方案 B——完整复制 BBL 耗材参数。从 BBL 的继承链（`fdm_filament_common` → `fdm_filament_pla` → `Bambu PLA Basic @base`）中合并所有参数，写入自包含的 U1 文件，`inherits` 指向我们自己的 `fdm_filament_common`。

**关键发现**：
- `fdm_filament_common` 等文件名可以与 BBL 同名（所有第三方厂商都用相同名称），BambuStudio 按厂商目录隔离
- 跨厂商继承在加载阶段不支持（`config_maps` 是厂商内部映射）
- `preset.vendor` 由厂商目录决定，不是 `filament_vendor` 字段

**新增 82 个耗材文件**（3 层继承链合并为自包含文件）：
- Bambu 品牌：45 个
- Generic 通用：27 个
- 第三方品牌：8 个
- 2 个跳过（Bambu Support For PA PET、Bambu Support For PLA-PETG 的 @base 文件名不匹配）

### v2.3 新增（BBL 耗材跨厂商继承）— 已废弃

**需求**：BambuStudio 内置了 BBL/Generic/第三方品牌的丰富耗材库，但厂商隔离机制（`preset.vendor != active_printer.vendor`）阻止了跨厂商使用。U1 用户无法选择这些耗材。

**方案**：利用 BambuStudio 支持跨厂商继承（源码确认 `find_preset` 全局名称查找，无厂商限制），创建薄包装文件继承 BBL 的 `@base` 配置，只覆盖 U1 特有参数。

**包装文件结构**（每个文件仅 10-15 行）：
```json
{
    "type": "filament",
    "name": "Bambu PLA Basic @U1",
    "inherits": "Bambu PLA Basic @base",
    "compatible_printers": [],
    "compatible_printers_condition": "printer_model == 'Snapmaker U1'",
    "hot_plate_temp": ["65"],
    "enable_pressure_advance": ["1"],
    "pressure_advance": ["0.02"],
    "filament_start_gcode": ["; filament start gcode\n"]
}
```

**覆盖参数说明**：
- `compatible_printers_condition`：解决厂商隔离和打印机副本兼容性问题
- `hot_plate_temp` / `textured_plate_temp`：U1 热床温度与 BBL 默认值不同（如 BBL PLA 默认 55°C，U1 需要 65°C）
- `enable_pressure_advance` / `pressure_advance`：U1 使用 Klipper PA，各材料 PA 值不同
- `filament_start_gcode`：覆盖 BBL 的 M106 P3（辅助风扇）指令，U1 无辅助风扇

**PA 值参考**（基于 OrcaSlicer U1 官方配置）：
| 材料类型 | PA 值 | 说明 |
|---------|-------|------|
| PLA 系列 | 0.02 | 标准 PA |
| PLA-CF | 0.01 | 碳纤维材料 PA 较低 |
| PETG | 0.04 | PETG 需要较高 PA |
| PETG-CF | 0.02 | CF 版本 PA 适中 |
| ABS/ASA | 0.02 | 标准 PA |
| ABS/ASA-CF | 0.01 | CF 版本 PA 较低 |
| TPU | 禁用 | TPU 不使用 PA |
| PA/PC | 0.02 | 工程材料标准 PA |
| PA-CF/PAHT-CF | 0.01 | CF 版本 PA 较低 |

**新增耗材分类**（84 个文件）：
- Bambu 品牌：47 个（PLA 17 种、PETG 5 种、ABS/ASA 5 种、TPU 5 种、工程材料 8 种、支撑/水溶 7 种）
- Generic 通用：29 个（PLA 4 种、PETG 4 种、ABS/ASA 2 种、TPU 2 种、工程材料 12 种、其他 5 种）
- 第三方品牌：8 个（PolyLite 4 种、PolyTerra 1 种、Overture 2 种、eSUN 1 种）

**热床温度覆盖**：
| 材料类型 | U1 热床温度 | BBL 默认值 | 差异 |
|---------|-----------|-----------|------|
| PLA | 65°C | 55°C | +10°C |
| PETG | 80°C | 80°C | 一致 |
| ABS/ASA | 100°C | 100°C | 一致 |
| PC | 110°C | 110°C | 一致 |
| PA/CF | 100°C | 100°C | 一致 |

### v2.2 修复（打印机副本兼容性）

**问题**：添加局域网连接后，BambuStudio 创建打印机配置副本（"Snapmaker U1 (0.4 nozzle) - 拷贝"），导致耗材名称全部显示为 "default filament"。

**根因分析**（BambuStudio 源码 Preset.cpp:714-751）：
1. BambuStudio 的 `is_compatible_with_printer` 函数通过 4 层检查判断耗材兼容性
2. 第一层：厂商匹配 — ✅ 通过（都是 Snapmaker）
3. 第二层：`compatible_printers_condition` 表达式求值 — 之前为空，跳过
4. 第三层：`compatible_printers` 精确名称匹配 — ❌ 失败（副本名称 "拷贝" 不在列表中）
5. 第四层：`is_compatible_with_parent_printer` 检查 `inherits()` — ❌ 失败（副本的 `inherits` 为空字符串）

关键发现：副本文件的 `"inherits": ""` 和 `"name": "...拷贝"` 导致所有兼容性检查都失败。

**修复方案**：将所有耗材和工艺预设的 `compatible_printers` 改为空数组，添加 `compatible_printers_condition: "printer_model == 'Snapmaker U1'"`。

**为什么有效**：
- `printer_model` 字段在副本中保持不变（仍为 "Snapmaker U1"）
- BambuStudio 在 `compatible_printers` 为空且 `compatible_printers_condition` 非空时，会求值条件表达式
- 条件 `printer_model == 'Snapmaker U1'` 对原始和副本打印机都返回 true
- 此方案还天然支持未来的多喷嘴配置（0.2/0.6/0.8mm 都共享 `printer_model: "Snapmaker U1"`）

**修改文件**（14 个）：
- 13 个耗材文件：Snapmaker PLA/PETG/ABS/TPU @U1、Generic PLA/PETG/ABS/TPU @U1、Snapmaker PLA Basic/Matte/SnapSpeed/Silk/PLA-CF @U1
- 1 个工艺文件：0.20 Standard @Snapmaker U1.json

**为什么 BBL 打印机没有这个问题**：
BBL 打印机使用原生 BambuLab 协议添加局域网，只创建 Physical Printer 条目，不创建机器配置副本。第三方打印机添加 OctoPrint 主机时，BambuStudio 会创建机器配置的 user preset 副本，触发此问题。

**关于 BBL 内置耗材包**：
BambuStudio 的兼容性检查有厂商隔离机制（`preset.vendor != active_printer.vendor` 时直接拒绝），所以 BBL 的耗材无法直接用于 Snapmaker 打印机。但可以通过跨厂商继承（`inherits: "Bambu PLA Basic @BBL X1C"`）复用 BBL 耗材参数，只需覆盖兼容性字段。

### v2.0 G-code 修复（Start G-code 完善）

**问题1**：擦料塔报错 "当前仅支持使用相对挤出器寻址"
- 根因：`use_relative_e_distances` 设为 `"0"`（绝对挤出）
- 修复：改为 `"1"`（相对挤出），Klipper 完全支持（G-code 中使用 M83）

**问题2**：G-code 生成失败 "Unknown scalar variable type"
- 根因：`{chamber_temperature}` 是 OrcaSlicer 模板变量，BambuStudio 不认识
- 修复：改为硬编码 `CHAMBER=0`

**问题3**：Start G-code 过于简化（只有 1 行 PRINT_START）
- 根因：兼容包初始 start_gcode 只传了温度参数，缺少 U1 全部初始化步骤
- 修复：参照 Orca 官方 U1 配置，重写完整 start G-code（80+ 行），包含：
  - 回零（G28 X Y / G28 Z）
  - 热床调平（BED_MESH_CALIBRATE）
  - 自动进料（SM_PRINT_AUTO_FEED × 4）
  - 流量校准（SM_PRINT_FLOW_CALIBRATE × 4）
  - 床面异物检测（DEFECT_DETECTION_DETECT_BED）
  - 钢板检测（DETECT_BED_PLATE）
  - 喷嘴清洁（ROUGHLY/FINELY_CLEAN_NOZZLE）
  - 画起始线
- 所有模板变量使用 BambuStudio 原生支持的变量

**问题4**：PLA 热床温度默认 60°C vs Orca 的 65°C
- 根因：参照 Anker 模板设了 60°C，但 U1 官方推荐 65°C
- 修复：`cool_plate_temp` / `hot_plate_temp` 统一改为 65°C

### v1.x → v2.0 重建（彻底重写）

**问题**：v1.3 移除了 93 个不兼容字段共 698 个实例后，BambuStudio 仍然报 "Failed loading configuration file" 错误，且比之前闪退版本更严重（完全无法加载）。

**根因**：从 OrcaSlicer 复制后移除字段的方案从根本上不可行：
- OrcaSlicer 有太多专有字段，无法全部识别和移除
- 正则替换无法可靠处理所有 JSON 值类型（嵌套数组、多行值等）
- 移除字段后可能留下无效的 JSON 结构（尾逗号、孤立值等）
- 即使字段全部移除，继承链中的中间配置文件也可能有问题

**解决方案**：从零创建最小化 U1 配置，参照 BambuStudio 内置的 Anker 模板：
- 所有字段名 100% 来自 BambuStudio 原生模板，不存在不兼容问题
- 继承链简化为 2 层（common → 具体），不依赖 OrcaSlicer 的复杂继承
- 只包含 U1 必需的配置（1 个机器模型、1 个喷嘴、1 个工艺、4 种耗材）
- 安装脚本不再需要字段移除逻辑

### v1.2 → v1.3 修复（全面字段清理）

1. **"Failed loading configuration file" 仍然报错**：v1.2 只移除了 16 个不兼容字段，实际有 93 个
   - 根因：之前的字段列表是通过猜测和部分搜索得出的，不完整
   - 修复：提取 Snapmaker JSON 中所有字段名，与 BambuStudio 源码 PrintConfig.cpp 逐一对比，找出全部 93 个不兼容字段
   - 结果：162 个文件修改，698 个字段实例移除（之前只有 149 个）
   - **结论：此方案仍然失败，促使 v2.0 的彻底重写**

### v1.1 → v1.2 修复（关键闪退修复）

1. **BambuStudio 闪退**：加载 U1 配置后软件崩溃无法启动
   - 根因1：v1.0/v1.1 错误删除了 BambuStudio 支持的字段
   - 根因2：ConvertTo-Json 将 G-code 中的 `<`、`>`、`&` 转义为 Unicode
   - 修复：从 Snapmaker Orca 重新复制，使用文本正则方式移除不兼容字段

2. **卸载后仍闪退**：BambuStudio.conf 中仍保存着 Snapmaker U1 作为当前打印机
   - 修复：增加 BambuStudio.conf 清理逻辑

### v1.0 → v1.1 修复

1. **bat 文件编码问题**：中文在 cmd.exe (GBK) 中乱码 → 所有逻辑移到 .ps1 文件
2. **BambuStudio 加载配置报错**：OrcaSlicer 专有字段不识别 → 移除 16 个不兼容字段
3. **正则替换破坏 JSON**：改用 ConvertFrom-Json → PSObject.Properties.Remove → ConvertTo-Json
4. **缓存未清除**：安装脚本自动清除缓存

---

## 七、状态

- [x] 代码分析完成
- [x] 可行性评估完成
- [x] U1 硬件参数收集完成
- [x] v1.x 兼容包创建（OrcaSlicer 复制+字段移除方案，已废弃）
- [x] v2.0 兼容包从零重建（BambuStudio 原生模板方案）
- [x] 安装/卸载脚本 v2.0
- [x] 缓存清理逻辑
- [x] BambuStudio.conf 清理逻辑
- [x] Start G-code 完善（U1 完整初始化流程）
- [x] 相对挤出模式修复
- [x] 模板变量兼容性修复
- [x] PLA 热床温度修正（60→65°C）
- [x] G-code 对比验证（与 Orca 高度一致）
- [x] Moonraker OctoPrint 兼容层验证（API 完全兼容）
- [x] BambuStudio OctoPrint 主机类型与 U1 连接验证
- [x] README 更新：添加局域网直连配置说明
- [x] OctoPrint 模式功能范围文档（耗材信息限制等）
- [x] 非 U1 设备资源文件清理
- [x] AGPL-3.0 许可证添加
- [x] 版权声明（OrcaSlicer/BambuStudio/PrusaSlicer/Moonraker/Klipper）
- [x] v2.2 打印机副本兼容性修复（compatible_printers_condition）
- [x] v2.3 BBL 耗材跨厂商继承支持（84 个包装文件，覆盖 Bambu/Generic/第三方品牌）
- [x] v2.5 filament_list 加载顺序修复（基础文件必须在继承文件之前）
- [x] v3.0 全品牌耗材库支持（100 个耗材预设，覆盖 Bambu/Generic/第三方品牌）
- [x] v3.0.1 批量生成 JSON 格式修复（尾部逗号、gcode 换行、缺失 setting_id）
- [x] v3.1 default_materials 添加到打印机配置
- [x] v3.2 compatible_printers 改为列表格式（BBL 官方做法）
- [x] v3.3 耗材可见性缓存修复（JSON 解析替代正则，正确清理 filaments 数组）
- [x] v3.4 G-code 模板补全（TIMELAPSE/DEFECT_DETECTION/Z_OFFSET 条件分支）+ filament_vendor 品牌归类修复
- [x] v3.5 完整工艺预设移植（10个预设，从 Orca U1 + BBL A1 参考合并）+ G-code 模板修复 + filament_vendor 修复
- [x] v3.6 G-code 深度对比修复（auxiliary_fan、enable_pre_heating、ooze_prevention、filament_preheat_temperature_delta 符号）
- [x] v3.7 项目审查修复：补全 Bambu PPA-CF 配置（18 个参数）；补全 Snapmaker 基础耗材关键字段（PA/热床温度）；修复 Snapmaker TPU 热床温度（35→65°C）；修复 Snapmaker PETG cool_plate_temp（60→0）；修复 Generic PE/PP/PCTG filament_type；修复 PETG Basic temperature_vitrification（60→178）；补全 Bambu PLA Dynamic filament_flow_ratio；CF/GF 材料添加 required_nozzle_HRC（21 个文件）；统一数据类型 int→string（10 个文件 12 处）；清理 fdm_process_U1_0.20 冗余覆盖；fdm_filament_common 默认 vendor 改为空；补全 PC/PAHT-CF 高温材料 nozzle_temperature（PC=280°C, PAHT-CF=290°C）；修复 C1 filament_id 重复（Snapmaker PLA/ABS/PETG/TPU 改为 SFSxxx）；修复 H2 machine_pause_gcode（空→PAUSE）
- [x] v3.8 G-code 深度对比修复（retract_length_toolchange、retraction_length、bridge_flow/acceleration、jerk、initial_layer_print_height）
- [x] v3.9 V2 G-code 验证热床温度修正（SnapSpeed 45°C、Basic/Matte 70°C）
- [x] v3.10 全量 Snapmaker 耗材对齐官方安装版 Orca（PA 关闭、温度/流速/热床修正）
- [x] v3.11 完整继承链解析修复（TPU CRITICAL、ABS/PETG HIGH、PLA MEDIUM）
- [x] v3.12 G-code 验证 + Snapmaker 耗材品牌对齐官方 + Bambu/Generic 耗材全面对齐 BBL 官方 + reinstall 脚本

### v3.7 审查未修改项（基于 G-code 实际对比）

**H1：standby_temperature_delta 机器/工艺冲突**
- 状态：未修改
- 理由：G-code 显示 process 级 `-5` 未生效，实际使用 machine 级 `-150`（空闲喷头冷却到 70°C）；BambuStudio 通过 `M104 T0 S220 N0` 让固件将待机温度设为 0°C，这是与 Orca 的设计差异，不是 bug
- 风险：无崩溃风险，换色等待可能略长

**M1：change_filament_gcode Z 提升未归位**
- 状态：未修改
- 理由：G-code 显示后续通过绝对定位（G1 Z.4 / G1 Z.8）正确归位，内部 Z 跟踪偏移不影响实际定位
- 风险：无

**M2：0.08/0.12 工艺预设速度超 300mm/s**
- 状态：未修改
- 理由：当前 0.20mm 预设 G-code 中无打印移动超过 F18000（300mm/s）；`G1 F21000` 出现在 change_filament_gcode 中但从未被用于实际移动
- 风险：无（当前预设），建议等实际用 0.08/0.12 预设打印后再验证

**L1：extruder_colour/offset 只有 1 项**
- 状态：未修改
- 理由：G-code 显示 BambuStudio 正确输出了 4 个颜色和 4 个偏移量，common 中的单条目被 nozzle 配置正确覆盖
- 风险：无

**L2：bed_model/bed_texture 为空**
- 状态：未修改
- 理由：纯 UI 展示问题，对 G-code 和打印零影响
- 风险：无

**L3：default_filament_profile 只有 1 项**
- 状态：未修改
- 理由：G-code 显示正确配置了 4 个耗材（全 PLA，全 220°C），单条默认配置在所有耗材类型相同时工作正常
- 风险：无（当前 PLA-only），混合耗材时风险低（BambuStudio 会自动处理）

- [ ] 实际打印测试（待用户在 U1 上验证）
- [ ] 更多喷嘴直径支持（0.2/0.6/0.8）
- [ ] 更多工艺预设（0.08/0.12/0.16/0.24/0.28 等）
