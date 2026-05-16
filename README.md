# Snapmaker U1 BambuStudio 兼容包 v3.12

让 BambuStudio 支持 Snapmaker U1 打印机的切片配置与**局域网直连打印**。

---

## 前置条件

- **操作系统**：仅适用于 **Windows** 平台（安装脚本为 `.bat` / `.ps1`，不支持 macOS / Linux）
- 已安装 **BambuStudio**（[官方下载](https://bambulab.com/en/download/bambu-studio)）
- Snapmaker U1 打印机与电脑处于**同一局域网**

---

## 快速开始

### 第一步：安装兼容包

1. 右键 `install.bat` → **以管理员身份运行**
2. 脚本自动执行以下操作：
   - 检测 BambuStudio 安装路径
   - 清除旧的配置缓存和耗材缓存
   - 复制 Snapmaker 配置文件到 BambuStudio
   - 验证安装结果
3. 如果未检测到 BambuStudio，手动输入安装路径（如 `C:\Program Files\Bambu Studio`）
4. 输入 `Y` 确认安装
5. 看到 "Installation Successful!" 表示安装完成

### 第二步：在 BambuStudio 中添加打印机

1. **完全关闭** BambuStudio（确保进程已退出），然后重新打开
2. 点击 **添加打印机** → 选择 **Snapmaker** 品牌
3. 选择 **Snapmaker U1**
4. 选择喷嘴直径（推荐 0.4mm）
5. 完成添加

### 第三步：配置局域网直连（OctoPrint 协议）

U1 内置 Moonraker 服务，兼容 OctoPrint API。BambuStudio 原生支持 OctoPrint 主机类型，可直接连接。

1. 在 BambuStudio 中，进入 **设置** → **物理打印机**
2. 点击 **添加物理打印机**，选择对应的 Snapmaker U1 预设
3. 在 **主机类型** 中选择 **OctoPrint**（默认值）
4. 在 **主机名/IP/URL** 中输入 U1 的 IP 地址（如 `192.168.1.100`）
5. 在 **API Key / 密码** 中输入 Moonraker 的 API Key（见下方获取方法）
6. 点击 **测试** 按钮，显示 "Connection to OctoPrint works correctly." 即表示连接成功
7. 保存物理打印机配置

> **获取 Moonraker API Key**：在浏览器中访问 `http://<U1的IP>`，打开 Fluidd 界面，点击右上角设置图标 → API Key 即可查看。

### 第四步：切片并直接发送到打印机

1. 导入 3D 模型文件（STL / 3MF / STEP 等）
2. 选择工艺预设（如 `0.20 Standard @Snapmaker U1`）和耗材（如 `Snapmaker PLA @U1`）
3. 点击 **切片**
4. 切片完成后，点击 **发送到打印机**（Upload to Printer）
5. 勾选 **上传后开始打印**（Start Print after Upload）
6. G-code 将自动上传到 U1 并开始打印

### 卸载

1. 右键 `uninstall.bat` → **以管理员身份运行**
2. 输入 `Y` 确认卸载
3. 重启 BambuStudio

---

## 兼容包内容

| 类别 | 内容 | 数量 |
|------|------|------|
| 打印机 | Snapmaker U1 (0.4 nozzle) | 1 |
| 工艺预设 | 0.08~0.28mm（Extra Fine / Fine / Optimal / Standard / Draft 等） | 10 |
| 耗材预设 | Bambu Lab 全系列 + Generic 通用 + Snapmaker 官方 | 80 |
| 热床模型 | Snapmaker U1 热床 STL + 纹理 SVG + 封面图 | 3 |

### 工艺预设列表

| 预设 | 层高 | 特点 |
|------|------|------|
| 0.08 Extra Fine | 0.08mm | 极细层线，表面光滑 |
| 0.08 High Quality | 0.08mm | 低速 + gyroid 填充，最高质量 |
| 0.12 Fine | 0.12mm | 细层线，高质量 |
| 0.12 High Quality | 0.12mm | 低速 + gyroid 填充 |
| 0.16 Optimal | 0.16mm | 质量/速度平衡 |
| 0.16 High Quality | 0.16mm | 低速 + gyroid 填充 |
| 0.20 Standard | 0.20mm | 通用默认，适合大多数场景 |
| 0.20 Strength | 0.20mm | 6 层壁 + 25% 填充，高强度 |
| 0.24 Draft | 0.24mm | 快速草稿 |
| 0.28 Extra Draft | 0.28mm | 极速草稿 |

### 耗材预设列表

| 品牌 | 包含材料 |
|------|----------|
| **Snapmaker** | PLA Basic, PLA Matte, PLA Silk, PLA SnapSpeed, PETG HF, TPU 90A, TPU 95A HF |
| **Bambu Lab** | PLA Basic, PLA Matte, PLA Silk, PLA-CF, PETG Basic, PETG HF, ABS, ASA, TPU 95A, PA-CF, PC, PVA, Support 等 44 种 |
| **Generic** | PLA, PETG, ABS, ASA, TPU, PC, PA-CF, PVA, PP, PPS-CF 等 27 种 |

---

## 工作流程

```
┌──────────────┐   切片+发送   ┌──────────┐
│  BambuStudio │ ────────────→ │  U1 打印机 │
│  (切片+发送)  │  OctoPrint   │ (Moonraker)│
└──────────────┘   局域网直连   └──────────┘
```

---

## 局域网直连功能范围

| 功能 | 支持状态 | 说明 |
|------|----------|------|
| G-code 上传 | ✅ | 通过 HTTP multipart 上传到 U1 |
| 上传后自动打印 | ✅ | 上传时勾选 "Start Print after Upload" |
| 连接测试 | ✅ | 验证 IP 和 API Key 是否正确 |
| 打印温度控制 | ✅ | 由切片参数写入 G-code |
| 获取打印机耗材信息 | ❌ | OctoPrint 协议无耗材管理 API |
| 实时打印进度 | ❌ | OctoPrint 兼容层不支持状态推送 |
| 远程暂停/取消 | ❌ | BambuStudio OctoPrint 模式不支持 |

> **打印监控**：如需实时查看打印状态和进度，请在浏览器中访问 `http://<U1的IP>` 打开 U1 自带的 Fluidd 界面。

---

## Snapmaker U1 参数

| 参数 | 值 |
|------|-----|
| 打印尺寸 | 270 × 270 × 270 mm |
| 结构 | CoreXY |
| 固件 | Klipper |
| 喷头 | 4 个独立工具头（换头式） |
| 喷嘴直径 | 0.2 / 0.4 / 0.6 / 0.8 mm |
| 最高喷嘴温度 | 300°C |
| 热床温度 | 最高 110°C |
| 最大打印速度 | 300 mm/s |
| 最大加速度 | 20,000 mm/s² |
| 换色时间 | < 10 秒 |

---

## 注意事项

- **BambuStudio 更新后需重新安装**：更新可能覆盖配置文件，重新运行 `install.bat` 即可
- **G-code 兼容性**：U1 使用 Klipper 固件，G-code 包含 `PRINT_START`/`PRINT_END` 宏、`DEFECT_DETECTION`、`TIMELAPSE`、`SM_PRINT` 等 Snapmaker 专有命令
- **多色打印**：BambuStudio 支持多色切片，U1 的 4 工具头换色机制与 BambuLab AMS 不同但可正常工作
- **耗材选择**：在 BambuStudio 中手动选择与 U1 工具头实际装载一致的耗材预设
- **空闲喷头温度**：由于 BambuStudio 不允许同时启用防滴（ooze_prevention）和擦料塔，空闲喷头会保持工作温度。U1 换头式设计中空闲喷头停泊在远离打印区域的位置，漏料影响较小

---

## 常见问题

**Q: 安装后 BambuStudio 中看不到 Snapmaker U1？**
A: 请确保完全关闭并重启 BambuStudio。如果仍看不到，检查文件是否正确复制到 `Bambu Studio\resources\profiles\` 目录。

**Q: 安装后 BambuStudio 报错 "Failed loading configuration file"？**
A: 这通常是因为旧的配置缓存未清除。请手动删除 `%APPDATA%\BambuStudioBeta\system\Snapmaker` 目录和 `Snapmaker.json` 文件，然后重启 BambuStudio。重新运行 `install.bat` 也会自动清除缓存。

**Q: 安装后只看到 2 个耗材，其余都不见？**
A: 这是 BambuStudio 的耗材缓存问题。请重新运行 `install.bat`（v3.3+ 已修复此问题），脚本会自动清理 `BambuStudio.conf` 中的耗材缓存，重启后所有耗材会自动出现。

**Q: 耗材品牌归类不正确（如 Bambu 耗材显示在 Snapmaker 下）？**
A: v3.5 已修复此问题。请重新运行 `install.bat`。

**Q: 多色打印换色时报"温度不够"？**
A: v3.5+ 已修复此问题。换色 G-code 现在包含 M109 等待温度 + 预热命令。请确保使用 v3.5 或更高版本。

**Q: 安装脚本报错 "Failed to copy" 或权限不足？**
A: 需要以管理员身份运行 `install.bat`。右键 → 以管理员身份运行。

**Q: 测试连接时提示 "Mismatched type of print host"？**
A: 确认主机类型选择的是 **OctoPrint**，且 U1 的 Moonraker 服务正常运行。在浏览器中访问 `http://<U1的IP>/api/version`，应返回包含 `"text": "OctoPrint (Moonraker ...)"` 的 JSON。

**Q: 如何获取 U1 的 IP 地址？**
A: 在 U1 触摸屏上进入 **设置** → **网络**，即可看到 IP 地址。或在路由器管理界面中查找名为 `Snapmaker` 的设备。

**Q: BambuStudio 更新后兼容包失效了？**
A: 重新运行 `install.bat` 即可。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `install.bat` | 安装启动器（调用 PowerShell） |
| `install.ps1` | 安装脚本（缓存清理 + 文件复制 + 验证） |
| `reinstall.bat` | 重装启动器（一键卸载+安装） |
| `reinstall.ps1` | 重装脚本（先卸载再安装） |
| `uninstall.bat` | 卸载启动器 |
| `uninstall.ps1` | 卸载脚本（清理配置 + 缓存 + BambuStudio.conf） |
| `Snapmaker.json` | 品牌配置入口 |
| `Snapmaker/` | 所有打印机、工艺、耗材配置文件 |
| `process.md` | 项目开发进度记录 |
| `traps.md` | 开发踩坑记录（BambuStudio 第三方适配的 24 个坑） |

---

## 版本历史

- **v3.12** (2026-05-16) - 全面参数对齐与优化：
  - **Bambu 耗材对齐 BBL 官方**：修复 PPS-CF 温度（240→320）和流速；修复 ASA filament_type；补全 ABS/ABS-GF 温度和风扇参数；补全 Support for ABS 温度覆盖；修复 PA-CF 温度（280→290）和热床（110→100）；补全 PA6-CF/PA6-GF/PAHT-CF 参数；修复 PETG Basic 温度（250→245）和 temperature_vitrification（60→178）；修复 PETG HF 温度（245→240）；修复 PETG Translucent/PETG-CF 热床（80→70）；修复 TPU 全系列热床（65→45）；修复 PC/PC FR 热床（110→100）和风扇；补全 PPA-CF/PVA 完整配置；修复 Support For PLA-PETG 继承基类；修复 PET-CF 热床（80→100）和 nozzle HRC（55→40）
  - **Generic 耗材修复**：修复 PPS-CF/PLA-CF/PETG-CF 的 nozzle HRC（55→40）；修复 PETG-CF 热床（80→70）
  - **Snapmaker 耗材优化**：PLA Basic/Matte/Silk/SnapSpeed 关闭 PA（enable_pressure_advance=0）；PLA Matte 流速比（0.98→1）、最大流速（15→22）、温度（220→215）；PLA Silk 温度（220→230）、流速（12→10）、PA（0.02→0.015）、添加回抽和 dont_slow_down_outer_wall；PLA SnapSpeed 流速比（0.98→0.966）、密度（1.32→1.24）、温度（230→220）、添加回抽和 Z-hop；删除旧 PLA/ABS/PETG/TPU/PLA-CF，新增 PETG HF/TPU 90A/TPU 95A HF；添加 filament_retract_length_toolchange
  - **工艺预设优化**：bridge_flow（1→0.8）、bridge_acceleration（1000→50%）、inner_wall_acceleration（5000→10000）；添加 initial_layer_print_height；jerk 参数全面调整
  - **机器参数调整**：retraction_length（0.8→1.5）、retract_length_toolchange（2→10）、deretraction_speed（60→30）、retraction_speed（40→30）
  - **PLA 基类调整**：cool_plate_temp/eng_plate_temp（65→60）、hot_plate_temp_initial_layer（65→70）
  - **新增 reinstall 脚本**：支持一键卸载+重装，无需分别运行两个脚本
  - **安装脚本更新**：版本号升级、验证路径适配新耗材名、缓存清理正则更新
- **v3.7** (2026-05-15) - 项目审查修复：补全 Bambu PPA-CF 配置（nozzle_temperature=290、filament_type=PPA-CF 等 18 个参数）；补全 Snapmaker 基础耗材关键字段（PA、热床温度等）；修复 Snapmaker TPU 热床温度（35→65°C）；修复 Snapmaker PETG cool_plate_temp（60→0）；修复 Generic PE/PP/PCTG filament_type；修复 PETG Basic temperature_vitrification（60→178）；补全 Bambu PLA Dynamic filament_flow_ratio；为 CF/GF 材料添加 required_nozzle_HRC；统一数据类型（int→string）；清理 fdm_process_U1_0.20 冗余覆盖
- **v3.6** (2026-05-15) - G-code 深度对比修复：启用辅助风扇（`auxiliary_fan=1`，换色时 `M106 P2 S178`）；启用预热（`enable_pre_heating=1`，换色前自动预热下一喷头）；修正 `filament_preheat_temperature_delta` 符号（-50→50）；记录 BambuStudio 防滴与擦料塔不兼容限制
- **v3.5** (2026-05-14) - 完整工艺预设移植（10 个预设，从 Orca U1 + BBL A1 参考合并）；G-code 模板修复（TIMELAPSE/DEFECT_DETECTION/高温板 Z_OFFSET 条件分支）；filament_vendor 品牌归类修复
- **v3.3** (2026-05-14) - 修复耗材可见性缓存问题（用 JSON 解析替代正则清理 filaments 数组）；所有 80 个耗材正确显示
- **v3.0** (2026-05-14) - 全品牌耗材库支持（80 个耗材预设：Bambu Lab 44 种 + Generic 27 种 + Snapmaker 9 种）
- **v2.0** (2026-05-14) - 支持局域网直连打印（OctoPrint 协议）
- **v1.0** (2026-05-13) - 初始版本，基于 Snapmaker Orca 官方 U1 配置

---

## 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。

### 版权声明

本项目的配置文件来源于以下开源项目，并遵循其许可证：

- **OrcaSlicer** — AGPL-3.0 — https://github.com/SoftFever/OrcaSlicer
- **BambuStudio** — AGPL-3.0 — https://github.com/bambulab/BambuStudio

Snapmaker U1 的打印机配置、工艺预设和耗材预设源自 OrcaSlicer 项目的 Snapmaker U1 配置文件，已移除 BambuStudio 不兼容的 OrcaSlicer 专有字段。Bambu Lab 品牌耗材参数源自 BambuStudio 官方配置。

### 通信协议

本项目的局域网直连功能基于 Moonraker 的 OctoPrint API 兼容层，相关项目：

- **Moonraker** — GPL-3.0 — https://github.com/Arksine/moonraker
- **Klipper** — GPL-3.0 — https://github.com/Klipper3d/klipper
