# Snapmaker U1 BambuStudio 兼容包 v5.47.0

让 BambuStudio 支持 Snapmaker U1 打印机的切片配置与**原生级设备控制体验**（通过 Bridge 服务器 + 原生打印确认对话框），支持局域网直连与 Tailscale 级联远程打印。

---

本项目使用字节跳动旗下的 Solo，配合智谱的 GLM-5.1&5.2 开发。

---

## 前置条件

- **操作系统**：Windows 或 Linux
- 已安装 **BambuStudio**（[官方下载](https://bambulab.com/en/download/bambu-studio)）
- 已安装 **Node.js** 18+（[官方下载](https://nodejs.org)）
- Snapmaker U1 打印机与电脑处于**同一局域网**（外网远程打印需 Tailscale，见[远程打印](#远程打印tailscale-级联架构-v5460)章节）

---

## 快速开始

### 第一步：安装兼容包

#### Windows（自动安装）

1. 右键 `install.bat` → **以管理员身份运行**
2. 脚本自动执行：检测 BambuStudio 路径 → 清除旧缓存 → 复制配置 → 安装 Bridge → 修补 `print_host` → 创建开机自启 → 启动 Bridge
3. 如果未检测到 BambuStudio，手动输入安装路径

> 安装完成后，兼容包原目录可以删除，Bridge 和配置已集成到 BambuStudio 目录和 APPDATA 中。

#### Linux（自动安装）

```bash
# 1. 确保已安装 Node.js 18+ 和 BambuStudio
node --version  # 检查 Node.js

# 2. 赋予执行权限并运行安装脚本
chmod +x install.sh
./install.sh
```

安装脚本自动执行：
1. 检测 BambuStudio 安装路径（支持 AppImage / .deb / 目录安装）
2. 清除旧的 system 缓存
3. 清理 BambuStudio.conf 中的耗材缓存
4. 修补用户 machine 配置的 `print_host` → `http://127.0.0.1:13628`
5. 复制 Snapmaker profiles 到 BambuStudio 的 `resources/profiles/`
6. 安装 Bridge Server 到 `~/.local/share/BambuStudio-Bridge/bridge/`
7. 安装 npm 依赖
8. 创建 systemd user service（或 .desktop autostart + cron 看门狗）
9. 启动 Bridge Server

**BambuStudio 安装方式说明**：

| 安装方式 | profiles 安装位置 | 说明 |
|----------|-------------------|------|
| .deb 包 | `/opt/BambuStudio/resources/profiles/` | 直接写入，永久生效 |
| 目录安装 | `<dir>/resources/profiles/` | 直接写入，永久生效 |
| AppImage | `~/.config/BambuStudio/system/` | 用户缓存目录，BambuStudio 重启后可能被覆盖 |

> AppImage 用户如需永久安装 profiles，建议先解压 AppImage（`./BambuStudio_*.AppImage --appimage-extract`），再用安装脚本指向 `squashfs-root/` 目录。

**配置/日志路径**（Linux XDG 标准）：
- Bridge 配置：`~/.config/BambuStudio-Bridge/`
- Bridge 数据：`~/.local/share/BambuStudio-Bridge/`
- BambuStudio 配置：`~/.config/BambuStudio/`

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

**Windows**：右键 `uninstall.bat` → **以管理员身份运行**。脚本清理配置、Bridge 和缓存，保留用户自定义耗材预设。

**Linux**：
```bash
chmod +x uninstall.sh
./uninstall.sh
```
脚本停止 Bridge、移除自启动、清理 profiles 和配置，保留用户自定义耗材预设。

**重装（Linux）**：
```bash
chmod +x reinstall.sh
./reinstall.sh
```

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
| `bridge-node/slice_agent.js` | AI Lab 核心：G-code 优化引擎 + G-code 转换引擎 + Workspace 系统 |
| `bridge-node/aiClient.js` | AI 调用公共模块（AiClient 类 + AI_PROVIDERS + extractErrorMessage，v5.36.0+） |
| `bridge-node/dialog.js` | 跨平台原生打印确认对话框（v5.44.0+ 支持跨通道取消） |
| `bridge-node/netUtils.js` | 请求来源判定（isLocalAddress，远程/本地确认交互分流，v5.44.0+） |
| `bridge-node/package.json` | Node.js 依赖声明 |
| `bridge-node/workspace/` | AI Agent Workspace（Soul/Knowledge/Skills/Memory Markdown） |
| `bridge/web/webui.html` | WebUI 设备控制面板 |
| `bridge/web/ailab.css` | AI Lab 样式 |
| `bridge/web/ailab.js` | AI Lab 前端逻辑（G-code 优化 + 打印助手） |
| `bridge/web/gcvt.js` | G-code 转换前端逻辑（独立标签页） |

### 目录结构

```
BambuStudio-SnapmakerU1-Compat/
├── install.bat / install.ps1       # 安装脚本
├── reinstall.bat / reinstall.ps1   # 重装脚本
├── uninstall.bat / uninstall.ps1   # 卸载脚本
├── install-common.psm1             # 安装脚本公共模块（v5.36.0+，含 BambuStudio/Beta 双通道配置遍历）
├── install.sh / reinstall.sh / uninstall.sh  # Linux 脚本（v5.39.0+）
├── make-zip.ps1                    # 发布打包脚本
├── deploy-home.ps1                 # 家用机 Bridge 一键部署脚本（v5.45.0+）
├── Snapmaker.json                  # 品牌配置入口
├── Snapmaker/                      # 切片配置目录
│   ├── machine/                    # 打印机配置
│   ├── process/                    # 工艺预设
│   └── filament/                   # 耗材预设
├── bridge-node/                    # Bridge 服务器（Node.js）
│   ├── server.js                   # 核心服务器
│   ├── slice_agent.js              # AI Lab 优化引擎
│   ├── aiClient.js                 # AI 调用公共模块（AiClient 类）
│   ├── dialog.js                   # 原生对话框
│   ├── netUtils.js                 # 请求来源判定（远程打印分流，v5.44.0+）
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
        ├── gcvt.js                 # G-code 转换前端逻辑
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

### 远程打印（Tailscale 级联架构，v5.46.0+）

在外网也能安全连接家里的打印机——**随处连接自己的打印机，数据完全自己掌控**（WireGuard 端到端加密，无云依赖，不经第三方服务器）。

采用**级联架构（两次 Bridge）**：外网机也运行本地 Bridge（A），A 把家里 Bridge（B）当作"打印机"——确认弹窗、切片、AI Lab 全在外网机本地处理，家里电脑只做纯数据透传，外网体验与在家完全一致。

```
外网 BambuStudio ──> 外网机 Bridge A ──Tailscale 隧道(加密)──> 家里电脑 Bridge B ──局域网──> Snapmaker U1

  外网切片点 Print → A 本地弹确认框（家里桌面不弹窗）
  → 外网机确认 → A 经 B 透传 → 开始打印
```

**配置步骤（推荐：Tailscale Serve，零防火墙配置）**：

1. 家里电脑和外部设备都安装 [Tailscale](https://tailscale.com/download) 并登录同一账号（免费版即可）
2. 家里电脑执行一次（无需管理员，重启/重连后自动生效，tailnet 需启用 HTTPS）：
   `tailscale serve --bg http://127.0.0.1:13628`
   —— 由 tailscaled 服务在本机 loopback 代理流量并自动签发 HTTPS 证书，Windows 防火墙无需放行 node.exe（traps.md #154）
3. 外部设备安装本兼容包 v5.46.0+（纯本地安装，无任何模式选择）
4. 外部设备打开 WebUI（http://127.0.0.1:13628 齿轮设置）→ Connection → 选 **Remote Bridge** → 填家里 serve 地址（如 `https://vitasguo-pc.tailxxxx.ts.net`，443 端口无需写端口号）→ 点 **Test** 显示 reachable → 保存
5. 切片 → Print：上传立即返回，外网机弹出耗材映射确认框（与在家完全相同），确认后开始打印

**工作机制**：

- **级联透传**：A 将 B 视为 Moonraker 端点（HTTP + WebSocket 全透明转发），打印机 apikey 只存 B 侧，A 无需持有任何打印机凭据；`BRIDGE_CONFIG_DIR`/`BRIDGE_PORT` 环境变量支持本机多实例调试
- **确认交互在 A 本地**：弹窗/耗材映射在发起请求的外网机本地处理，家里电脑无人值守不受影响
- **网络效率**（v5.47.0+）：keep-alive 连接池（跨网请求免重复 TLS 握手，面板刷新提速的主修复项）、gzip 双层压缩（文件列表/G-code 文本跨网流量降 ~70-80%，JPEG 等已压内容自动跳过）、大文件流式转发（146MB G-code 实测完整下载，双端零全量内存）
- **稳定性保障**（v5.47.0+）：WebSocket 30s ping 保活（防 Tailscale/NAT 空闲断连）、上传瞬时网络错误自动重试（Moonraker 上传幂等，重试安全）、上传不限时（按文件大小×网速自然完成）
- **大文件预案**：家里宽带上行是硬约束（上行 5Mbps 时 100MB G-code 上传约需 3 分钟，属物理极限）；级联链路异常时降级通道——外网浏览器直接访问 `https://<machine>.ts.net/fluidd` 操作 WebUI/Fluidd，不经级联
- **serve 代理识别**（v5.44.1+）：`tailscale serve` 的代理连接来源是 loopback，但会携带 `X-Forwarded-For`（真实客户端 tailnet IP）——loopback + XFF 判为远程请求（traps.md #155），直接 socket 地址判定会误判
- **信任模型**：依赖 Tailscale 设备级认证（tailnet 内均为你自己的设备），serve 仅 tailnet 可达（非 Funnel、不经公网），Bridge 不额外加 token

**高级：直连模式（bind 三态，需管理员放行防火墙）**

WebUI 齿轮设置 → Remote Access 可选监听模式，直连 `http://100.x.x.x:13628`：

| bind 模式 | 监听地址 | 可访问者 |
|-----------|---------|---------|
| Local only（默认） | 127.0.0.1 | 仅本机 |
| Tailnet only | 100.x.x.x + 127.0.0.1 双监听 | 本机 + 你 tailnet 内的设备 |
| All interfaces | 0.0.0.0 | 局域网所有设备（不推荐） |

注意：直连模式要求 Windows 防火墙放行 node.exe 入站。若此前在防火墙弹窗点过"取消"，会残留自动生成的 Block 规则（优先级高于 Allow，必须管理员删除，traps.md #154）；serve 模式无此要求，推荐使用。

### 关键设计决策

| 决策 | 原因 |
|------|------|
| JSONP 桥接（`bridgeGET`/`bridgePOST`） | BambuStudio WebView 阻止 fetch/XHR，但允许 `<script>` 加载 |
| 分步打印命令（非 `SDCARD_PRINT_FILE_WITH_PARAMETERS`） | `SET_PRINT_TASK_PARAMETERS` 不更新 `reprint_info`，映射不生效（traps.md #101） |
| CIEDE2000 颜色匹配 | RGB 空间不感知均匀，对齐 OrcaSlicer 原生实现 |
| `patchGcodeLayout()` 上传时重组 gcode | BambuStudio CONFIG_BLOCK 在开头，Moonraker 只搜索文件末尾 |
| Snapshot 轮询（非 MJPEG 流） | U1 不运行 mjpegstreamer，通过 `monitor.jpg` 单张 JPEG 实现 |
| 远程确认交互跟随请求发起方（v5.44.0） | 家里电脑只做数据桥接：远程请求不弹家里桌面，确认框弹在远程侧 WebUI，体验与本地无感统一 |
| bind=tailnet 双监听（v5.44.0） | 绑定 tailnet 专用地址（局域网不可达）+ loopback（本地 BambuStudio 零改动） |
| 信任 Tailscale 设备认证，不加 token（v5.44.0） | tailnet 内均为自有设备；避免 BambuStudio 请求 URL 改造成本，保持零配置体验 |
| `cancelActiveDialog()` 跨通道取消（v5.44.0） | WebUI 确认/取消后自动关闭残留的桌面对话框，消除双通道竞争导致的重复打印风险 |
| 远程入口用 `tailscale serve`（v5.44.1） | tailscaled 在 loopback 代理 + 自动 HTTPS 证书，绕过 Windows 防火墙 node.exe Block 规则（traps.md #154），零配置零提权 |
| loopback + `X-Forwarded-For` 判为远程（v5.44.1） | serve 代理请求 socket 来源是 127.0.0.1，只有识别 XFF 才能让确认交互跟随真实发起方（traps.md #155） |
| 安装器远程模式自动探测 + 改写 print_host（v5.45.0，v5.46.0 移除） | 命令行模式选择体验差；v5.46.0 改为 WebUI 图形化 Connection 区块（Local printer / Remote Bridge 单选 + Test 探测），安装器回归纯本地 |
| 级联架构（两次 Bridge，v5.46.0） | 外网机 Bridge A 把家里 Bridge B 视为"打印机"：弹窗/切片/AI Lab 全在 A 本地处理，B 纯透传；打印机凭据只存 B 侧，外网体验与在家一致 |
| 代理响应剥离 content-encoding/content-length（v5.46.0） | node-fetch 自动解压 gzip 后 body 已是明文，转发原编码头会让下游客户端 gunzip 失败（级联 A→B 必现，traps.md #161） |
| keep-alive 连接池 + gzip 压缩 + 流式转发（v5.47.0） | 级联跨 Tailscale 每请求 TLS 握手 +100~400ms 是"卡"主因；文本流量压缩比 ~75%；arrayBuffer 全缓冲使大文件双端内存翻倍 |
| JSONP 请求豁免压缩（v5.47.0） | JSONP 走 `<script>` 标签，老 WebView 不保证解压 gzip 响应；`cb=` 参数是 JSONP 特征，豁免零风险 |

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
| AI 实验室 | ✅ G-code 优化 + 打印助手（流式输出 + Thinking 模式） | ❌ |
| G-code 转换 | ✅ BambuStudio→OrcaSlicer | ❌ |

---

## 注意事项

- **BambuStudio 更新后需重新安装**：更新可能覆盖配置文件，重新运行 `install.bat` 即可
- **打印机自动检测**：Bridge 首次启动时通过 mDNS 自动检测。失败时可在浏览器打开 `http://127.0.0.1:13628` 手动配置
- **多色打印**：BambuStudio 支持多色切片，U1 的 4 工具头换色机制可正常工作
- **耗材选择**：在 BambuStudio 中手动选择与 U1 工具头实际装载一致的耗材预设
- **⚠️ 设备面板直接打印限制**：BambuStudio 生成的 gcode 在 U1 设备触摸面板上直接打印时提示"未识别的gcode类型"（闭源触摸屏固件检查 `;TYPE:` 层标记），可通过 WebUI 侧栏"转换"标签页的 **G-code 转换** 功能将 BambuStudio gcode 转换为 OrcaSlicer 兼容格式后再上传，或通过 WebUI 打印

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

- **v5.47.0** (2026-08-24) - 级联链路网络效率优化 + 大文件传输稳定性（外网实测"卡"的针对性修复）：1) **keep-alive 连接池**（http/https Agent）——原每请求新建 TCP+TLS，跨 Tailscale 每次握手 +100~400ms、设备面板一次刷新几十个请求是"卡"主因；2) **gzip 响应压缩**（express compression，≥1KB，JSONP `cb=` 请求豁免防老 WebView）——文件列表/G-code 文本跨网流量降 ~70-80%；3) **流式转发**（proxyToMoonraker/webcam 从 arrayBuffer 全缓冲改 pipeline）——146MB G-code 级联下载实测完整（17.5s），双端零全量内存；4) **WS 30s ping 保活**——防 Tailscale/NAT 空闲断连导致面板状态卡死；5) **上传瞬时网络错误自动重试**（ECONNRESET/ETIMEDOUT 等，2s 后重试 1 次，Moonraker 上传幂等安全）；6) deploy-home.ps1 新增依赖自动同步（compression 新运行时依赖，旧 node_modules 缺失会启动崩溃）
- **v5.46.0** (2026-08-24) - 级联架构（两次 Bridge）+ WebUI 图形化连接配置：外网机 Bridge A 把家里 Bridge B 视为"打印机"——弹窗/切片/AI Lab 全在 A 本地处理，B 纯透传，打印机凭据只存 B 侧；WebUI 齿轮新增 Connection 区块（Local printer / Remote Bridge 单选 + Test 连通性探测 `/api/bridge/test_upstream.js`）；安装器回归纯本地（移除 v5.45.0 命令行模式选择，远程配置全部交给 WebUI）；修复级联必现的 gzip 转发头 bug（node-fetch 自动解压后转发原 content-encoding 头，下游 gunzip 明文报 incorrect header check，traps.md #161）；新增 `BRIDGE_CONFIG_DIR` 环境变量支持多实例调试（traps.md #162）；test script 补回 net_utils.test.js 恢复 52/52（traps.md #163）
- **v5.45.0** (2026-08-24) - 安装器远程模式开箱即用（v5.46.0 已被 WebUI 配置取代）：安装时选择本地/远程模式，远程模式自动探测 tailnet 在线设备的 Bridge 并改写 print_host；支持 BambuStudio 正式版/Beta 双通道配置目录（traps.md #159）；修复 machine JSON 正则匹配（traps.md #158）；Linux 脚本 CRLF 换行修复 + `.gitattributes` 防回归（traps.md #160）；新增 deploy-home.ps1（家用机一键部署）+ make-zip.ps1（发布打包）
- **v5.44.1** (2026-08-24) - Tailscale Serve 远程打印适配：部署时发现 Windows 防火墙存在 node.exe 入站 Block 规则（防火墙弹窗点"取消"自动生成，优先级高于 Allow，traps.md #154），直连模式外网不可达且无管理员权限无法删除。改用 `tailscale serve`（tailscaled 在 loopback 代理 + 自动 HTTPS 证书，零防火墙配置）：1) `netUtils.js` 新增 `isLocalRequest(req)`——loopback 且无 `X-Forwarded-For` 才判本地，loopback + XFF = 经 serve 代理的远程请求（traps.md #155），修复 serve 场景下远程上传误弹家里桌面对话框；2) README 远程打印章节重写：serve 为推荐路径，bind 直连降级为高级模式；3) 单元测试新增 8 个 isLocalRequest 用例（总 52 个）
- **v5.44.0** (2026-08-24) - Tailscale 远程打印正式版：1) **确认交互跟随请求发起方**——本地请求弹本地桌面对话框（不变），远程请求跳过家里桌面弹窗、立即返回上传成功，确认框弹在远程侧 WebUI（Device 标签页），家里电脑纯数据桥接；2) **双通道竞争修复**——`dialog.js` 新增 `cancelActiveDialog()`，WebUI 确认/取消后自动关闭残留桌面对话框，消除重复打印风险；3) **bind 三态**（`127.0.0.1`/`tailnet`/`0.0.0.0`）——推荐 tailnet 模式双监听 tailnet IP + loopback，局域网不可达且本地 BambuStudio 零改动；4) **Tailscale 状态检测**——`tailscale status --json` 拿 MagicDNS 主机名 + 在线状态（网卡扫描兜底，10s 缓存），WebUI 设置弹窗显示推荐 Remote URL 一键复制；5) 新增 `netUtils.js`（isLocalAddress 纯函数）+ 16 个单元测试（总 44 个）
- **v5.38.0** (2026-07-02) - AI Lab/G-code 转换双语化 + 打印弹窗格式标识（traps.md #149、#150）：1) `ailab.js` / `gcvt.js` 新增 `aiT(zh,en)` / `gcvtT(zh,en)` 翻译函数，IIFE 改为可重调用函数 + ApplyLang 函数，`setLang()` 末尾调用重新渲染面板，~90 个文本点全部双语化跟随 WebUI 语言切换；2) `server.js` 新增 `check_gcode_format.js` JSONP 端点（HTTP Range 下载前 32KB 检测格式），`showPrintDialog` 异步显示格式标识，BambuStudio 格式显示橙色警告 + "前往转换"跳转链接
- **v5.37.3** (2026-06-29) - 修复上传超时回归 bug（traps.md #148）：v5.37.2 代码审查修复 M2 给上传/下载加了固定超时（120s/60s），大 G-code 文件在慢网络下超时被 abort，报 `HTTP 500: The user aborted a request`。上传和下载改回裸 `fetch`（无超时），列表操作保留 10s 超时
- **v5.37.2** (2026-06-29) - 全量代码审查安全修复（traps.md #142-#147）：setup 页面 mDNS XSS（H1，添加 escHtml 转义）；dialog.js fetch timeout 遗漏标准化（M1，AbortController）；server.js 三处 AI Lab 端点裸 fetch 无超时（M2，fetchWithTimeout）；webui.html 文件列表双重转义失效 XSS（M3，data-path + dataset）；ailab.js/gcvt.js 转义函数缺单引号（M4，补齐 &#39;）；extruder_map_table GET query 无大小限制（M5，4096 字节 + Array 校验）；打印机设置弹窗 curHost/curPort 未转义（L1）
- **v5.37.1** (2026-06-29) - 修复 G-code 转换 EXECUTABLE_BLOCK 范围错误（traps.md #141）：`EXECUTABLE_BLOCK_END` 从启动代码后移到 `PRINT_END` 后，包裹整个打印过程，与 OrcaSlicer 原生格式一致；新增单元测试验证
- **v5.37.0** (2026-06-29) - 阶段 4 单元测试 + fetch 超时标准化 + 代码组织：1) 新建 `test/` 目录 + `node:test` 框架，28 个测试覆盖 patchGcodeContent 5 种操作 + convertGcodeContent 格式检测/转换；提取纯函数 `patchGcodeContent`/`convertGcodeContent`（无文件 I/O）供测试调用；2) 新增 `fetchWithTimeout` helper 用标准 AbortController 替代 node-fetch v2 非标准 `timeout` 选项，8 处 fetch 调用全部替换；3) 从 handleUploadWithConfirm 内提取 patchGcodeLayout 为顶层函数
- **v5.36.1** (2026-06-29) - 修复 AI 问答流式空响应（traps.md #138）：后端 `printQAStream` 流式读取从 `resp.body.getReader()` 改为 `for await` async iterator（node-fetch v2 兼容）；前端 done 分支检查 `pd.error` 显示错误信息而非"空响应"；qa_stream_start 去掉多余 query 参数
- **v5.36.0** (2026-06-29) - 阶段 3 AI 调用公共模块提取 + PowerShell 脚本重构：1) 提取 `bridge-node/aiClient.js`（AiClient 类 + AI_PROVIDERS + extractErrorMessage），slice_agent.js 三函数（testAiConnection/optimizeGcode/printQAStream）改造消除 ~50 行重复 + 统一错误处理（修复 cause 链丢失）；2) ailab.js optimize_gcode 删除 4 个多余 query 参数，消除 apiKey GET URL 泄露风险；3) 提取 `install-common.psm1` 模块（14 个公共函数，558 行），install.ps1 508→199 / reinstall.ps1 524→228 / uninstall.ps1 236→157；参数化设计；`exit 1` → `throw` + 调用方 try/catch；统一启用 regex fallback
- **v5.35.0** (2026-06-29) - 阶段 2 死代码清理 + 前端 XSS 修复：删除 slice_agent.js 22 个死函数（-1448 行/-47.2%）+ server.js 10 个死端点；修复 10 处 XSS（ailab.js 代码块反向解码 / webui.html 文件名耗材类型未转义 / gcvt.js 错误信息温度值未转义）
- **v5.34.0** (2026-06-29) - 阶段 1 安全加固 + 资源泄漏修复（11 项）：JSONP cb 注入 / open_external 命令注入 / 上传临时文件泄漏 / listGcodeFiles 全量读 / add_retract 时机 / extractGcodeStats G92 E0 误计 / printQAStream 泄漏 / loadJS DOM 泄漏 / ws.onmessage 异常保护 / dialog Linux 崩溃 / reinstall watchdog 文件锁
- **v5.33.0** (2026-06-27) - WebUI 顶栏新增打印机设置弹窗（齿轮图标），可手动修改 IP/Port/API Key
- **v5.32.1** (2026-06-27) - 修复 Node.js v26 上 npm install 失败（`Get-Command` 返回 `npm.ps1` 导致语法错误）
- **v5.32.0** (2026-06-27) - AI 打印助手流式输出 + Thinking 模式支持（自动检测 reasoning_content，折叠展示思考过程）
- **v5.31.4** (2026-06-21) - 修复本地模型 API Key 检查误拦截
- **v5.31.3** (2026-06-21) - 修复 LMStudio 模型升级后连接失败（自动发现模型）
- **v5.31.2** (2026-06-18) - 修复 start-hidden.vbs 括号路径语法错误 (800A03EA)
- **v5.31.1** (2026-06-17) - 代码审查修复：版本号一致性 + skills 文档命名统一
- **v5.31.0** (2026-06-15) - G-code 转换独立为侧栏标签页（从 AI Lab 拆分）
- **v5.30.0** (2026-06-10) - Bridge 看门狗（崩溃自动重启）+ uncaughtException 防护
- **v5.29.3** (2026-06-10) - G-code 转换 EXEC 块完善（温度/清洗流程/格式检测修复）
- **v5.29.0** (2026-06-10) - G-code 转换功能（BambuStudio→OrcaSlicer 兼容）+ 上传字段名修复
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
