# Snapmaker U1 BambuStudio 兼容包 v2.0

让 BambuStudio 支持 Snapmaker U1 打印机的切片配置与**局域网直连打印**。

---

## 前置条件

- 已安装 **BambuStudio**（[官方下载](https://bambulab.com/en/download/bambu-studio)）
- Snapmaker U1 打印机与电脑处于**同一局域网**

---

## 快速开始

### 第一步：安装兼容包

1. 右键 `install.bat` → **以管理员身份运行**
2. 脚本自动执行以下操作：
   - 移除 OrcaSlicer 专有字段（BambuStudio 不兼容的配置项）
   - 检测 BambuStudio 安装路径
   - 清除旧的 BambuStudio 配置缓存
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
2. 选择工艺预设（如 `0.20 Standard`）和耗材（如 `Snapmaker PLA`）
3. 点击 **切片**
4. 切片完成后，点击 **发送到打印机**（Upload to Printer）
5. 勾选 **上传后开始打印**（Start Print after Upload）
6. G-code 将自动上传到 U1 并开始打印 🎉

### 卸载

1. 右键 `uninstall.bat` → **以管理员身份运行**
2. 输入 `Y` 确认卸载
3. 重启 BambuStudio

---

## 工作流程图

```
┌──────────────┐   切片+发送   ┌──────────┐
│  BambuStudio │ ────────────→ │  U1 打印机 │
│  (切片+发送)  │  OctoPrint   │ (Moonraker)│
└──────────────┘   局域网直连   └──────────┘
```

**旧方式（仍可用）：**

```
┌──────────────┐    切片+导出    ┌─────────────────┐    发送G-code    ┌──────────┐
│  BambuStudio │ ──────────────→ │  .gcode 文件     │ ───────────────→ │  U1 打印机 │
│  (切片软件)   │                 │  (U盘/网络共享)   │                  │          │
└──────────────┘                  └─────────────────┘                  └──────────┘
                                         │
                                         │ 或通过
                                         ▼
                                  ┌─────────────────┐
                                  │  Snapmaker Orca  │
                                  │  (发送到打印机)   │
                                  └─────────────────┘
```

---

## 兼容包内容

| 目录 | 内容 | 文件数 |
|------|------|--------|
| `Snapmaker.json` | 品牌配置 | 1 |
| `Snapmaker/machine/` | 打印机配置 + 热床模型/纹理 | ~120 |
| `Snapmaker/process/` | 工艺预设 (0.06~0.56mm) | ~147 |
| `Snapmaker/filament/` | 耗材预设 (PLA/PETG/ABS/TPU/ASA...) | ~297 |

所有配置文件来源于 Snapmaker Orca 官方预设，已移除 BambuStudio 不兼容的 OrcaSlicer 专有字段。

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

- **局域网直连**：U1 通过 Moonraker 的 OctoPrint 兼容层与 BambuStudio 通信，支持文件上传和启动打印
- **BambuStudio 更新后需重新安装**：更新可能覆盖配置文件，重新运行 `install.bat` 即可
- **G-code 兼容性**：U1 使用 Klipper 固件，G-code 包含 `PRINT_START`/`PRINT_END` 宏
- **多色打印**：BambuStudio 支持多色切片，但 U1 的换头机制与 BambuLab 的 AMS 不同。建议多色打印使用 Snapmaker Orca
- **切片问题**：如遇切片异常，请优先使用 Snapmaker Orca 切片

### 局域网直连功能范围

OctoPrint 协议是通用 3D 打印机通信标准，功能范围与 BambuLab 专有协议有所不同：

| 功能 | 支持状态 | 说明 |
|------|----------|------|
| G-code 上传 | ✅ | 通过 HTTP multipart 上传到 U1 |
| 上传后自动打印 | ✅ | 上传时勾选 "Start Print after Upload" |
| 连接测试 | ✅ | 验证 IP 和 API Key 是否正确 |
| 手动选择耗材预设 | ✅ | 在 BambuStudio 中选择与 U1 实际装载匹配的耗材预设 |
| 打印温度控制 | ✅ | 由切片参数写入 G-code，U1 执行时自动设置 |
| 获取打印机耗材信息 | ❌ | OctoPrint 协议无耗材管理 API，BambuStudio 无法读取 U1 当前装载的耗材 |
| 实时打印进度 | ❌ | OctoPrint 兼容层不支持状态推送，BambuStudio 中无法显示进度 |
| 远程暂停/取消 | ❌ | BambuStudio OctoPrint 模式不支持远程控制 |

> **耗材选择建议**：在 BambuStudio 中手动选择与 U1 工具头实际装载一致的耗材预设（如 `Snapmaker PLA @U1`）。切片后的温度、流量等参数会正确写入 G-code，不影响打印质量。
>
> **打印监控**：如需实时查看打印状态和进度，请在浏览器中访问 `http://<U1的IP>` 打开 U1 自带的 Fluidd 界面。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `install.bat` | 安装启动器（调用 PowerShell） |
| `install.ps1` | 安装脚本（字段清理 + 缓存清理 + 文件复制 + 验证） |
| `uninstall.bat` | 卸载启动器 |
| `uninstall.ps1` | 卸载脚本 |
| `Snapmaker.json` | 品牌配置（BambuStudio 用来发现 Snapmaker 品牌） |
| `Snapmaker/` | 所有打印机、工艺、耗材配置文件 |

---

## 常见问题

**Q: 安装后 BambuStudio 中看不到 Snapmaker U1？**
A: 请确保完全关闭并重启 BambuStudio。如果仍看不到，检查文件是否正确复制到 `Bambu Studio\resources\profiles\` 目录。

**Q: 安装后 BambuStudio 报错 "Failed loading configuration file"？**
A: 这通常是因为旧的配置缓存未清除。请手动删除 `%APPDATA%\BambuStudioBeta\system\Snapmaker` 目录和 `Snapmaker.json` 文件，然后重启 BambuStudio。重新运行 `install.bat` 也会自动清除缓存。

**Q: 安装脚本报错 "Failed to copy" 或权限不足？**
A: 需要以管理员身份运行 `install.bat`。右键 → 以管理员身份运行。

**Q: 测试连接时提示 "Mismatched type of print host"？**
A: 确认主机类型选择的是 **OctoPrint**，且 U1 的 Moonraker 服务正常运行。在浏览器中访问 `http://<U1的IP>/api/version`，应返回包含 `"text": "OctoPrint (Moonraker ...)"` 的 JSON。

**Q: 上传成功但打印没有自动开始？**
A: 确保在上传对话框中勾选了 **Start Print after Upload**。如果 U1 正在打印或暂停状态，Moonraker 会将任务加入队列而非立即开始。

**Q: 如何获取 U1 的 IP 地址？**
A: 在 U1 触摸屏上进入 **设置** → **网络**，即可看到 IP 地址。或在路由器管理界面中查找名为 `Snapmaker` 的设备。

**Q: 如何获取 Moonraker API Key？**
A: 在浏览器中访问 `http://<U1的IP>` 打开 Fluidd 界面，点击右上角设置图标 → API。也可通过 SSH 登录 U1，运行 `cat /home/lava/moonraker/.moonraker_api_key`（路径可能不同）。

**Q: 支持 4 色打印吗？**
A: BambuStudio 支持多色切片，但 U1 的换头机制与 BambuLab 的 AMS 不同。建议多色打印使用 Snapmaker Orca。

**Q: 局域网模式下看不到打印机上的耗材信息？**
A: 这是正常的。OctoPrint 协议本身没有耗材管理 API，BambuStudio 无法读取 U1 当前装载的耗材。请在 BambuStudio 中手动选择与 U1 工具头实际装载一致的耗材预设，切片参数会正确写入 G-code，不影响打印。

**Q: 局域网模式下无法暂停/取消打印？**
A: BambuStudio 的 OctoPrint 模式不支持远程控制。如需暂停或取消，请在 U1 触摸屏上操作，或在浏览器中打开 Fluidd 界面（`http://<U1的IP>`）进行控制。

**Q: 如何查看打印进度？**
A: BambuStudio OctoPrint 模式不支持实时状态显示。请在浏览器中访问 `http://<U1的IP>` 打开 U1 自带的 Fluidd 界面查看实时进度。

**Q: BambuStudio 更新后兼容包失效了？**
A: 重新运行 `install.bat` 即可。

**Q: 连接测试成功但上传失败？**
A: 检查 API Key 是否正确。如果 U1 启用了 HTTPS，需要在 BambuStudio 中配置 CA 证书或使用 HTTP 连接。

---

## 技术细节：移除的 OrcaSlicer 专有字段

以下字段在 BambuStudio 的配置系统中不存在（通过对比 BambuStudio 源码 PrintConfig.cpp 确认），安装脚本会自动移除：

| 字段名 | 类型 |
|--------|------|
| `slowdown_for_curled_perimeters` | 工艺 |
| `preheat_time` | 工艺 |
| `wipe_tower_extra_spacing` | 工艺 |
| `min_width_top_surface` | 工艺 |
| `travel_slope` | 工艺 |
| `machine_tool_change_time` | 机器 |
| `enable_filament_ramming` | 工艺 |
| `purge_in_prime_tower` | 工艺 |
| `retract_lift_enforce` | 工艺 |
| `filament_retract_lift_enforce` | 耗材 |
| `filament_slowdown_for_curled_perimeters` | 耗材 |
| `filament_preheat_time` | 耗材 |
| `filament_wipe_tower_extra_spacing` | 耗材 |
| `filament_travel_slope` | 耗材 |
| `filament_enable_filament_ramming` | 耗材 |
| `filament_purge_in_prime_tower` | 耗材 |

---

## 版本历史

- **v2.0** (2026-05-14) - 🎉 支持局域网直连打印！U1 内置 Moonraker 兼容 OctoPrint API，BambuStudio 可通过 OctoPrint 主机类型直接上传 G-code 并启动打印，无需额外软件
- **v1.3** (2026-05-14) - 全面对比 BambuStudio 源码，从不兼容字段 16 个扩展到 93 个；修复 process 文件加载报错；install/uninstall 增加 BambuStudio.conf 清理
- **v1.2** (2026-05-14) - 修复闪退问题：不再使用 ConvertTo-Json（避免 Unicode 转义和格式破坏）；修正不兼容字段列表（保留 BambuStudio 支持的 host_type/thumbnails/long_retractions_when_cut 等字段）；install/uninstall 脚本增加 BambuStudio.conf 清理逻辑
- **v1.1** (2026-05-13) - 修复字段移除逻辑（使用 JSON 解析替代正则）；修正不兼容字段列表（对比 BambuStudio 源码确认）；增加缓存清理；完善使用说明
- **v1.0** (2026-05-13) - 初始版本，基于 Snapmaker Orca 官方 U1 配置

---

## 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。

### 版权声明

本项目的配置文件来源于以下开源项目，并遵循其许可证：

- **OrcaSlicer** — AGPL-3.0 — https://github.com/SoftFever/OrcaSlicer
- **BambuStudio** — AGPL-3.0 — https://github.com/bambulab/BambuStudio
- **PrusaSlicer** — AGPL-3.0 — https://github.com/prusa3d/PrusaSlicer

Snapmaker U1 的打印机配置、工艺预设和耗材预设源自 OrcaSlicer 项目的 Snapmaker U1 配置文件，已移除 BambuStudio 不兼容的 OrcaSlicer 专有字段。

### 通信协议

本项目的局域网直连功能基于 Moonraker 的 OctoPrint API 兼容层，相关项目：

- **Moonraker** — GPL-3.0 — https://github.com/Arksine/moonraker
- **Klipper** — GPL-3.0 — https://github.com/Klipper3d/klipper
