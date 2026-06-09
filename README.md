# Snapmaker U1 BambuStudio 兼容包 v5.28.3

让 BambuStudio 支持 Snapmaker U1 打印机的切片配置与**原生级设备控制体验**（通过 Bridge 服务器 + 原生打印确认对话框）。

---

本项目使用字节跳动旗下的 Solo，配合智谱的 GLM-5.1 开发。

---

## 前置条件

- **操作系统**：Windows 或 Linux
- 已安装 **BambuStudio**（[官方下载](https://bambulab.com/en/download/bambu-studio)）
- 已安装 **Node.js** 18+（[官方下载](https://nodejs.org)）
- Snapmaker U1 打印机与电脑处于**同一局域网**

---

## 快速开始

### 第一步：安装兼容包

#### Windows（自动安装）

1. 右键 `install.bat` → **以管理员身份运行**
2. 脚本自动执行：检测 BambuStudio 路径 → 清除旧缓存 → 复制配置 → 安装 Bridge → 修补 `print_host` → 创建开机自启 → 启动 Bridge
3. 如果未检测到 BambuStudio，手动输入安装路径

> 安装完成后，兼容包原目录可以删除，Bridge 和配置已集成到 BambuStudio 目录和 APPDATA 中。

### 第二步：在 BambuStudio 中添加打印机

1. **完全关闭** BambuStudio（确保进程已退出），然后重新打开
2. 点击 **添加打印机** → 选择 **Snapmaker** 品牌 → **Snapmaker U1** → 选择喷嘴直径

> Bridge 会在首次启动时通过 mDNS 自动检测局域网内的 Snapmaker 打印机，无需手动输入 IP。

### 第三步：切片并打印

1. 导入 3D 模型 → 选择工艺预设和耗材 → 点击 **切片**
2. 切片完成后点击 **打印** → 选择 **Print**
3. Bridge 弹出**原生打印确认对话框**：
   - G-code 信息（文件名/预估用时/预估用料）
   - 耗材映射（gcode 槽位→物理槽位，自动匹配 + 手动选择）
   - 打印选项（自动调平 / 流量校准 / 延时摄影）
4. 点击 **▶ Start Print** → 开始打印

> 如果选择 **Upload**，文件仅上传到打印机但不自动开始打印。可在 Device 标签页的 WebUI 中手动开始打印。

### 卸载

右键 `uninstall.bat` → **以管理员身份运行**。脚本清理配置、Bridge 和缓存，保留用户自定义耗材预设。

---

## 兼容包内容

### 切片配置

| 类别 | 内容 | 数量 |
|------|------|------|
| 打印机 | Snapmaker U1 (0.4 nozzle) | 1 |
| 工艺预设 | 0.08~0.28mm（Extra Fine / Fine / Optimal / Standard / Draft 等） | 10 |
| 耗材预设 | Bambu Lab 全系列 + Generic 通用 + Snapmaker 官方 | 80 |
| 热床模型 | Snapmaker U1 热床 STL + 纹理 SVG + 封面图 | 3 |

### Bridge 服务器（Node.js）

| 文件 | 说明 |
|------|------|
| `bridge-node/server.js` | Express HTTP/WebSocket 代理服务器 |
| `bridge-node/slice_agent.js` | AI Lab 核心：G-code 优化引擎 + Workspace 系统 |
| `bridge-node/dialog.js` | 跨平台原生打印确认对话框 |
| `bridge-node/package.json` | Node.js 依赖声明 |
| `bridge-node/workspace/` | AI Agent Workspace（Soul/Knowledge/Skills/Memory Markdown） |
| `bridge/web/webui.html` | WebUI 设备控制面板 |
| `bridge/web/ailab.css` | AI Lab 样式 |
| `bridge/web/ailab.js` | AI Lab 前端逻辑 |

### 目录结构

```
BambuStudio-SnapmakerU1-Compat/
├── install.bat / install.ps1       # 安装脚本
├── reinstall.bat / reinstall.ps1   # 重装脚本
├── uninstall.bat / uninstall.ps1   # 卸载脚本
├── Snapmaker.json                  # 品牌配置入口
├── Snapmaker/                      # 切片配置目录
│   ├── machine/                    # 打印机配置
│   ├── process/                    # 工艺预设
│   └── filament/                   # 耗材预设
├── bridge-node/                    # Bridge 服务器（Node.js）
│   ├── server.js                   # 核心服务器
│   ├── slice_agent.js              # AI Lab 优化引擎
│   ├── dialog.js                   # 原生对话框
│   ├── package.json                # 依赖声明
│   └── workspace/                  # AI Agent Workspace
│       ├── soul.md                 # Agent 身份与原则
│       ├── knowledge.md            # 领域知识
│       ├── memory.md               # 经验记忆
│       ├── skills/                 # 技能文件
│       └── tools/                  # 工具文件
└── bridge/                         # WebUI 资源
    └── web/
        ├── webui.html              # 设备控制面板
        ├── ailab.css               # AI Lab 样式
        ├── ailab.js                # AI Lab 前端逻辑
        └── dist/                   # Fluidd 前端（可选）
```

安装后：
- Bridge 目录复制到：`C:\Program Files\Bambu Studio\bridge\`
- 配置文件保存在：`%APPDATA%\BambuStudio-Bridge\`
- 日志文件：`%APPDATA%\BambuStudio-Bridge\bridge.log`

---

## 工作流程

### Bridge 架构

```
BambuStudio
  │
  │ 1. 切片 → 点击 Print
  │    BambuStudio 弹出 Upload/Print/Cancel
  │
  │ 2. 选 Print → POST /api/files/local (print=true)
  │    ┌──────────────────────────────────────────┐
  │    │  Bridge (localhost:13628)                 │
  │    │  3. 上传文件到 Moonraker (不带 print)     │
  │    │  4. 弹出原生打印确认对话框                 │
  │    │     - 耗材映射 (gcode→物理槽位)            │
  │    │     - 自动调平 / 流量校准 / 延时摄影       │
  │    │  5. 确认后发送分步打印命令                  │
  │    │     (SET_PRINT_EXTRUDER_MAP →              │
  │    │      SET_PRINT_USED_EXTRUDERS →             │
  │    │      SET_PRINT_PREFERENCES →               │
  │    │      printer.print.start)                  │
  │    └──────────────────────────────────────────┘
  │
  │ 6. Device 标签页 → WebUI / Fluidd
  │    实时监控、温度控制、灯光、风扇等
  │
  ▼
Snapmaker U1 (Moonraker + Klipper)
```

### 关键设计决策

| 决策 | 原因 |
|------|------|
| JSONP 桥接（`bridgeGET`/`bridgePOST`） | BambuStudio WebView 阻止 fetch/XHR，但允许 `<script>` 加载 |
| 分步打印命令（非 `SDCARD_PRINT_FILE_WITH_PARAMETERS`） | `SET_PRINT_TASK_PARAMETERS` 不更新 `reprint_info`，映射不生效（traps.md #101） |
| CIEDE2000 颜色匹配 | RGB 空间不感知均匀，对齐 OrcaSlicer 原生实现 |
| `patchGcodeLayout()` 上传时重组 gcode | BambuStudio CONFIG_BLOCK 在开头，Moonraker 只搜索文件末尾 |
| Snapshot 轮询（非 MJPEG 流） | U1 不运行 mjpegstreamer，通过 `monitor.jpg` 单张 JPEG 实现 |

### 设备控制功能

| 功能 | WebUI | Fluidd |
|------|-------|--------|
| 摄像头 | ✅ 实时预览 | ✅ 完整监控 |
| 打印进度 | ✅ 百分比 + 层数 | ✅ 完整管理 |
| 温度控制 | ✅ 热床+4喷头 | ✅ 完整温度图 |
| 灯光 | ✅ 开关 | ❌ |
| 风扇 | ✅ 冷却+腔体 | ✅ 完整风扇图 |
| 耗材信息 | ✅ 类型+颜色 | ❌ |
| 速度调节 | ✅ 5挡 | ✅ 全部控制 |
| Z轴控制 | ✅ 上下+回原点 | ✅ |
| 打印控制 | ✅ 开始/暂停/恢复/取消 | ✅ 完整 Klipper |
| 中英文 | ✅ | ❌ |
| 调试日志 | ✅ Debug 面板 | ❌ |
| AI 实验室 | ✅ G-code 优化 + 打印问答 | ❌ |

---

## 注意事项

- **BambuStudio 更新后需重新安装**：更新可能覆盖配置文件，重新运行 `install.bat` 即可
- **打印机自动检测**：Bridge 首次启动时通过 mDNS 自动检测。失败时可在浏览器打开 `http://127.0.0.1:13628` 手动配置
- **多色打印**：BambuStudio 支持多色切片，U1 的 4 工具头换色机制可正常工作
- **耗材选择**：在 BambuStudio 中手动选择与 U1 工具头实际装载一致的耗材预设
- **⚠️ 设备面板直接打印限制**：BambuStudio 生成的 gcode 在 U1 设备触摸面板上直接打印时提示"未识别的gcode类型"（闭源触摸屏固件检查 EXECUTABLE_BLOCK），请通过 WebUI 打印

---

## 常见问题

**Q: 安装后 BambuStudio 中看不到 Snapmaker U1？**
A: 完全关闭并重启 BambuStudio。检查文件是否正确复制到 `resources/profiles/` 目录。

**Q: 切片后点击打印直接开始，没有弹出确认对话框？**
A: 检查 Bridge 是否运行（任务管理器中查找 node 进程）。检查 `print_host` 是否指向 `http://127.0.0.1:13628`。查看日志 `%APPDATA%\BambuStudio-Bridge\bridge.log`。

**Q: 安装后只看到 2 个耗材？**
A: 重新运行 `install.bat`，脚本会自动清理耗材缓存。

**Q: BambuStudio 更新后兼容包失效？**
A: 重新运行 `install.bat`。

**Q: reinstall 后我的自定义耗材预设丢失了？**
A: v5.18.1 已修复此问题，安装脚本不再删除用户自定义预设。

---

## 版本历史

- **v5.28.3** (2026-06-10) - 修复 replace_speed 速度单位转换（mm/s→mm/min）
- **v5.28.2** (2026-06-10) - 修复打印机下载 + explorer 报错 + log is not defined
- **v5.28.1** (2026-06-10) - 打印机 gcode 下载进度条
- **v5.28.0** (2026-06-10) - G-code 对比预览 LCS Diff 算法 + 优化报告 MD + patchGcode 修复
- **v5.27.0** (2026-06-08) - AI Lab 拆分为独立文件（ailab.css+ailab.js）+ G-code Word式对比预览
- **v5.26.0** (2026-06-08) - 打印助手全局化 + G-code 对比预览
- **v5.25.0** (2026-06-08) - AI Lab 聚焦 G-code 优化（移除AI切片/高级切片）
- **v5.24.0** (2026-06-08) - AI Lab 功能完善（优化上传、问答渲染增强）
- **v5.23.0** (2026-06-08) - AI Lab 三大功能方向（G-code优化/打印问答/高级切片）
- **v5.22.0** (2026-06-08) - G-code 质量对齐 OrcaSlicer
- **v5.21.0** (2026-06-08) - Workspace Markdown 系统
- **v5.20.0** (2026-06-08) - AI 实验室模块
- **v5.19.0** (2026-06-03) - 修复耗材信息被 gcode 覆盖
- **v5.18.1** (2026-05-30) - 打印层进度 + 保护用户自定义预设
- **v5.18.0** (2026-05-30) - CIEDE2000 颜色匹配 + OrcaSlicer 逆向分析
- **v5.16.1** (2026-05-27) - 修复耗材映射不生效严重 bug
- **v5.16.0** (2026-05-27) - 外部链接跳转修复
- **v5.15.0** (2026-05-27) - 耗材颜色相近匹配 + GitHub 版本更新检测
- **v5.14.0** (2026-05-27) - 耗材匹配核心类型提取 + 自定义下拉框 + About 页面
- **v5.13.0** (2026-05-27) - 耗材映射算法修复 + 下拉选择器
- **v5.12.1** (2026-05-27) - 打印确认框重新设计（3 部分）
- **v5.12.0** (2026-05-27) - WebUI 全面优化 + 耗材匹配
- **v5.11.0** (2026-05-27) - 控制面板 UI 优化 + 设备状态显示
- **v5.10.1** (2026-05-27) - 修复风扇控制参数范围
- **v5.10.0** (2026-05-27) - 对齐 OrcaSlicer 原生体验
- **v5.9.0** (2026-05-27) - 修复摄像头参数 + 温度轮询
- **v5.8.3** (2026-05-27) - 修复热床调平参数名
- **v5.8.0** (2026-05-27) - 修复 JSON-RPC 方法名 + 摄像头服务端监控
- **v5.7.3** (2026-05-26) - 安装脚本增强 + WebUI 离线检测
- **v5.7.0** (2026-05-25) - 中英文切换 + 流量校准 + Speed 5 挡
- **v5.5.0** (2026-05-25) - WebUI 全面替换 fetch→JSONP
- **v5.0** (2026-05-24) - Node.js Bridge 重构
- **v3.0** (2026-05-14) - 全品牌耗材库
- **v1.0** (2026-05-13) - 初始版本

---

## 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。

本项目的配置文件来源于以下开源项目：
- **OrcaSlicer** — AGPL-3.0 — https://github.com/SoftFever/OrcaSlicer
- **BambuStudio** — AGPL-3.0 — https://github.com/bambulab/BambuStudio

局域网直连功能基于 Moonraker 的 OctoPrint API 兼容层：
- **Moonraker** — GPL-3.0 — https://github.com/Arksine/moonraker
- **Klipper** — GPL-3.0 — https://github.com/Klipper3d/klipper
