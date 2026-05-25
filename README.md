# Snapmaker U1 BambuStudio 兼容包 v5.7.1

让 BambuStudio 支持 Snapmaker U1 打印机的切片配置与**原生级设备控制体验**（通过 Bridge 服务器 + 原生打印确认对话框）。

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
2. 脚本自动执行以下操作：
   - 检测 BambuStudio 安装路径
   - 清除旧的配置缓存和耗材缓存
   - 复制 Snapmaker 配置文件到 BambuStudio
   - 安装 Bridge 服务器到 BambuStudio 目录
   - 自动修补 `print_host` 指向 Bridge
   - 创建开机自启快捷方式
   - 自动启动 Bridge
3. 如果未检测到 BambuStudio，手动输入安装路径

> 安装完成后，兼容包原目录可以删除，Bridge 和配置已集成到 BambuStudio 目录和 APPDATA 中。

### 第二步：在 BambuStudio 中添加打印机

1. **完全关闭** BambuStudio（确保进程已退出），然后重新打开
2. 点击 **添加打印机** → 选择 **Snapmaker** 品牌
3. 选择 **Snapmaker U1**
4. 选择喷嘴直径（推荐 0.4mm）
5. 完成添加

> Bridge 会在首次启动时通过 mDNS 自动检测局域网内的 Snapmaker 打印机，无需手动输入 IP 地址。

### 第三步：切片并打印

1. 导入 3D 模型文件（STL / 3MF / STEP 等）
2. 选择工艺预设和耗材
3. 点击 **切片**
4. 切片完成后，点击 **打印**
5. BambuStudio 弹出 **Upload / Print / Cancel** 对话框
6. 选择 **Print** → Bridge 弹出 **Windows 原生打印确认对话框**：
   - 耗材选择（4 个 extruder checkbox）
   - 打印选项（自动调平 / 流量校准 / 延时摄影）
7. 点击 **▶ Start Print** → 开始打印

> 如果选择 **Upload**，文件仅上传到打印机但不自动开始打印。可在 Device 标签页的 WebUI 中手动开始打印。

### 卸载

1. 右键 `uninstall.bat` → **以管理员身份运行**
2. 脚本将清理所有配置、Bridge 和缓存
3. 重启 BambuStudio

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
| `bridge-node/dialog.js` | 跨平台原生打印确认对话框 |
| `bridge-node/package.json` | Node.js 依赖声明 |
| `bridge/web/webui.html` | WebUI 设备控制面板 |

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
│   ├── dialog.js                   # 原生对话框
│   └── package.json                # 依赖声明
└── bridge/                         # WebUI 资源
    └── web/
        ├── webui.html              # 设备控制面板
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
  │    │     - 耗材选择 (4 extruder)               │
  │    │     - 自动调平 / 流量校准 / 延时摄影       │
  │    │  5. 确认后发送 SDCARD_PRINT_FILE_WITH_    │
  │    │     PARAMETERS (WebSocket)                │
  │    └──────────────────────────────────────────┘
  │
  │ 6. Device 标签页 → WebUI / Fluidd
  │    实时监控、温度控制、灯光、风扇等
  │
  ▼
Snapmaker U1 (Moonraker + Klipper)
```

### 设备控制功能

| 功能 | WebUI 模式 | Fluidd 模式 |
|------|------------|-------------|
| 摄像头 | ✅ 实时预览（snapshot 轮询） | ✅ 完整监控 |
| 打印进度 | ✅ 查看/暂停/恢复/取消 | ✅ 完整管理 |
| 温度控制 | ✅ 热床+4喷头 | ✅ 完整温度图 |
| 灯光 | ✅ 开关 | ❌ 不支持 |
| 风扇 | ✅ 冷却风扇+腔体风扇 | ✅ 完整风扇图 |
| 耗材信息 | ✅ 类型+颜色+进料检测 | ❌ 不支持 |
| 流量校准 | ✅ 每个耗材独立校准 | ❌ 不支持 |
| 速度调节 | ✅ 5挡（50/80/100/120/150%） | ✅ 全部控制 |
| Z轴控制 | ✅ 上下移动+回原点 | ✅ |
| 打印控制 | ✅ 开始/暂停/恢复/取消 | ✅ 完整 Klipper 控制 |
| 中英文切换 | ✅ 一键切换 | ❌ |
| 调试日志 | ✅ 内置 Debug 面板 | ❌ |

---

## 注意事项

- **BambuStudio 更新后需重新安装**：更新可能覆盖配置文件，重新运行 `install.bat` 即可
- **打印机自动检测**：Bridge 首次启动时通过 mDNS 自动检测局域网内的 Snapmaker 打印机。如果自动检测失败，可在浏览器打开 `http://127.0.0.1:13628` 手动配置
- **G-code 兼容性**：U1 使用 Klipper 固件，G-code 包含 Snapmaker 专有命令
- **多色打印**：BambuStudio 支持多色切片，U1 的 4 工具头换色机制可正常工作
- **耗材选择**：在 BambuStudio 中手动选择与 U1 工具头实际装载一致的耗材预设

---

## 常见问题

**Q: 安装后 BambuStudio 中看不到 Snapmaker U1？**
A: 请确保完全关闭并重启 BambuStudio。如果仍看不到，检查文件是否正确复制到 `resources/profiles/` 目录。

**Q: 切片后点击打印直接开始打印，没有弹出确认对话框？**
A: 检查 Bridge 是否正在运行（任务管理器中查找 node 进程）。检查 `print_host` 是否指向 `http://127.0.0.1:13628`。查看日志 `%APPDATA%\BambuStudio-Bridge\bridge.log`。

**Q: 安装后只看到 2 个耗材？**
A: 重新运行 `install.bat`，脚本会自动清理耗材缓存。

**Q: 安装脚本报错 "Failed to copy"？**
A: 需要以管理员身份运行。右键 → 以管理员身份运行。

**Q: BambuStudio 更新后兼容包失效？**
A: 重新运行 `install.bat`。

---

## 版本历史

- **v5.7.1** (2026-05-25) - 排版优化 + 中文术语修正 + Snapmaker logo
  - WebUI 排版优化：温度显示格式、风扇/速度行防溢出、耗材 slot 更紧凑
  - 中文翻译修正为3D打印专业术语（喷头/设定温度/冷却风扇/回原点/待机等）
  - 左上角 logo 替换为 Snapmaker 品牌图标
- **v5.7.0** (2026-05-25) - 中英文切换 + 流量校准 + Speed 5 挡
  - WebUI 中英文一键切换（默认中文，50+ 翻译条目）
  - 每个耗材 slot 新增流量校准按钮（`SM_PRINT_FLOW_CALIBRATE`）
  - Speed 从 4 挡改为 5 挡（50/80/100/120/150%），与设备对应
- **v5.5.0** (2026-05-25) - WebUI 全面替换 fetch→JSONP
  - 发现 BambuStudio WebView 阻止 fetch/XMLHttpRequest，但不阻止 script/img 加载
  - 所有 fetch() 替换为 JSONP 风格的 `<script>` 标签加载
  - 新增 4 个服务端 JSONP 端点（pending_print.js/confirm_print.js/cancel_pending.js/debug/logs.js）
- **v5.4.0** (2026-05-25) - 代理链路完整修复
  - 中间件顺序调整、Fluidd SPA 回退、proxyToMoonraker 完全重写
  - WebSocket 代理改进、上传代码改用 form-data 包
  - Fluidd Service Worker 拦截、JSONP 代理端点、初始数据端点
- **v5.2** (2026-05-25) - WebUI + Fluidd 统一界面
  - 将 Fluidd 集成为 WebUI 的一个模块，侧边栏一键切换，无需来回跳转
  - 移除模式切换按钮和 mode API，简化架构
  - 修复安装脚本缺少 `npm install` 导致部署后无法启动的问题
- **v5.1** (2026-05-25) - mDNS 自动检测完善：
  - Setup 页面重设计：Scan Network 为主操作，手动输入 IP 降为备选
  - 用户安装流程简化：4 步→3 步，移除手动输入 IP 步骤
  - 全项目审查：移除所有"手动输入 IP"的过时描述
- **v5.0** (2026-05-24) - Node.js Bridge 重构：
  - Bridge 从 Python 重构为 Node.js，解决 Python 嵌入式包的依赖管理问题
  - 新增 Windows 原生打印确认对话框（耗材选择 + 打印选项）
  - 切片后点击 Print → 自动弹出确认对话框，无需手动切换标签
  - 跨平台支持（Windows=PowerShell+WinForms, Linux=zenity）
  - 安全修复：Base64 编码防止 PowerShell 变量注入、随机化临时文件名
  - 清理旧 Python Bridge 代码
- **v4.9** (2026-05-24) - print_host 自动修补
- **v4.0** (2026-05-24) - 完整发布版：Bridge 安装到 BambuStudio 目录 + 开机自启
- **v3.12** (2026-05-16) - 全面参数对齐与优化
- **v3.0** (2026-05-14) - 全品牌耗材库支持（80 个耗材预设）
- **v2.0** (2026-05-14) - 支持局域网直连打印（OctoPrint 协议）
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
