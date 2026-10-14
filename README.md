# Snapmaker U1 BambuStudio 兼容包 v5.48.0 / Snapmaker U1 BambuStudio Compatibility Pack v5.48.0

> **📖 完整版 / Full versions**：
> - [README.zh.md](README.zh.md)（中文完整版 / Full Chinese）
> - [README.en.md](README.en.md)（English / Full English）
> - [traps.md](traps.md) / [traps.en.md](traps.en.md)（踩坑记录 / Pitfalls log）

让 BambuStudio 支持 Snapmaker U1 打印机的切片配置与**原生级设备控制体验**（Bridge 服务器 + 原生打印确认对话框），支持局域网直连与 Tailscale 级联远程打印。
Enables BambuStudio to slice for and print on the Snapmaker U1 with **native-level device control** (via the Bridge server + native print-confirm dialog), supporting LAN direct connection and Tailscale cascade remote printing.

---

## 前置条件 / Prerequisites

- **操作系统 / OS**：Windows 或 Linux / Windows or Linux
- 已安装 **BambuStudio**（[官方下载](https://bambulab.com/en/download/bambu-studio)）/ **BambuStudio** installed ([official download](https://bambulab.com/en/download/bambu-studio))
- 已安装 **Node.js** 18+（[官方下载](https://nodejs.org)）/ **Node.js** 18+ installed ([official download](https://nodejs.org))
- Snapmaker U1 与电脑处于**同一局域网**（外网远程打印需 Tailscale，见[远程打印](#远程打印tailscale-级联架构-v5460)）/ Printer and PC on the **same LAN** (remote printing over the internet requires Tailscale, see [Remote Printing](#远程打印tailscale-级联架构-v5460))

---

## 快速开始 / Quick Start

### 第一步：安装兼容包 / Step 1: Install the Compatibility Pack

#### Windows（自动安装）/ Windows (Automatic)

1. 右键 `install.bat` → **以管理员身份运行** / Right-click `install.bat` → **Run as administrator**
2. 脚本自动执行：检测 BambuStudio 路径 → 清除旧缓存 → 复制配置 → 安装 Bridge → 修补 `print_host` → 创建开机自启 → 启动 Bridge
   The script automatically: detects the BambuStudio path → clears old caches → copies configuration → installs Bridge → patches `print_host` → creates startup auto-launch → starts Bridge
3. 未检测到 BambuStudio 时，手动输入安装路径 / If not detected, enter the installation path manually

> 安装完成后，兼容包原目录可删除（Bridge 和配置已集成到 BambuStudio 目录和 APPDATA）。
> After installation, the original pack directory can be deleted (Bridge and config are integrated into the BambuStudio directory and APPDATA).

#### Linux（自动安装）/ Linux (Automatic)

```bash
# 1. 确保已安装 Node.js 18+ 和 BambuStudio
node --version  # 检查 Node.js

# 2. 赋予执行权限并运行安装脚本
chmod +x install.sh
./install.sh
```

脚本自动：检测安装路径（AppImage / .deb / 目录）→ 清缓存与耗材缓存 → 修补 `print_host` → `http://127.0.0.1:13628` → 复制 profiles → 安装 Bridge → npm 依赖 → 自启动 → 启动。
The script automatically: detects the install path (AppImage/.deb/directory) → clears caches and the filament cache → patches `print_host` → `http://127.0.0.1:13628` → copies profiles → installs Bridge → npm deps → auto-start → starts Bridge.

> AppImage 如需永久安装 profiles：先解压 `./BambuStudio_*.AppImage --appimage-extract`，再让脚本指向 `squashfs-root/` 目录。
> For a permanent profiles install on AppImage: extract first (`./BambuStudio_*.AppImage --appimage-extract`), then point the script at `squashfs-root/`.

Linux 路径（XDG）/ Linux paths (XDG)：Bridge 配置 `~/.config/BambuStudio-Bridge/` · Bridge 数据 `~/.local/share/BambuStudio-Bridge/` · BambuStudio 配置 `~/.config/BambuStudio/`

### 第二步：在 BambuStudio 中添加打印机 / Step 2: Add the Printer in BambuStudio

1. **完全关闭** BambuStudio 后重新打开 / **Completely close** BambuStudio, then reopen it
2. **添加打印机** → 品牌 **Snapmaker** → **Snapmaker U1** → 选择喷嘴直径 / **Add Printer** → brand **Snapmaker** → **Snapmaker U1** → choose the nozzle diameter

> Bridge 首次启动通过 mDNS 自动检测局域网内的打印机，无需手动输入 IP。
> Bridge auto-detects LAN printers via mDNS on first launch — no manual IP entry.

### 第三步：切片并打印 / Step 3: Slice and Print

1. 导入模型 → 选择工艺预设和耗材 → **切片** / Import a model → select process preset and filament → **Slice**
2. 切片完成后点击 **打印** → 选择 **Print** / After slicing, click **Print** → select **Print**
3. Bridge 弹出**原生打印确认对话框** / Bridge pops up the **native print-confirm dialog**：
   - G-code 信息（文件名/预估用时/预估用料）/ G-code info (file name / estimated time / material usage)
   - 耗材映射（gcode 槽位→物理槽位，自动匹配 + 手动选择）/ Filament mapping (gcode slot → physical slot, auto-match + manual)
   - 打印选项（自动调平 / 流量校准 / 延时摄影）/ Print options (auto bed leveling / flow calibration / time-lapse)
4. 点击 **▶ Start Print** → 开始打印 / Click **▶ Start Print** → printing begins

> 选择 **Upload** 仅上传不自动打印，可在 Device 标签页的 WebUI 中手动开始。
> Choosing **Upload** only uploads without auto-printing; start manually from the WebUI in the Device tab.

### 卸载 / Uninstall

- **Windows**：右键 `uninstall.bat` → **以管理员身份运行**（清理配置、Bridge 和缓存，保留用户自定义耗材预设）
  **Windows**: right-click `uninstall.bat` → **Run as administrator** (cleans config, Bridge and caches; keeps user-defined filament presets)
- **Linux**：

```bash
chmod +x uninstall.sh
./uninstall.sh
```

- **重装（Linux）/ Reinstall (Linux)**：`chmod +x reinstall.sh && ./reinstall.sh`

---

## 兼容包内容 / Package Contents

| 类别 / Category | 内容 / Contents | 数量 / Count |
|------|------|------|
| 打印机 / Printer | Snapmaker U1 (0.4 nozzle) | 1 |
| 工艺预设 / Process presets | 0.08~0.28mm（Extra Fine / Fine / Optimal / Standard / Draft 等） | 10 |
| 耗材预设 / Filament presets | Bambu Lab 全系列 + Generic + Snapmaker 官方 | 80 |
| 热床模型 / Bed model | Snapmaker U1 热床 STL + 纹理 SVG + 封面图 | 3 |

关键文件 / Key files：`install.bat`/`install.ps1` · `install.sh` · `uninstall.bat`/`uninstall.sh` · `Snapmaker/`（machine / process / filament）· `bridge-node/`（`server.js` / `slice_agent.js` / `aiClient.js` / `dialog.js` / `netUtils.js`）· `bridge/web/`（`webui.html` / `ailab.js` / `gcvt.js`）

安装后 / After install：Bridge 复制到 `C:\Program Files\Bambu Studio\bridge\` · 配置 `%APPDATA%\BambuStudio-Bridge\` · 日志 `%APPDATA%\BambuStudio-Bridge\bridge.log`

---

## Bridge 架构 / Bridge Architecture

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

---

## 远程打印（Tailscale 级联架构，v5.46.0+）/ Remote Printing (Tailscale Cascade Architecture, v5.46.0+)

在外网也能安全连接家里的打印机——**随处连接自己的打印机，数据完全自己掌控**（WireGuard 端到端加密，无云依赖，不经第三方服务器）。
Securely connect to your home printer from anywhere — **your printer, your data** (WireGuard end-to-end encryption, no cloud dependency, no third-party servers).

**级联架构（两次 Bridge）**：外网机运行本地 Bridge（A），A 把家里 Bridge（B）当作"打印机"——确认弹窗、切片、AI Lab 全在 A 本地处理，B 纯数据透传，外网体验与在家完全一致。
**Cascade architecture (two Bridges)**: the remote machine runs a local Bridge (A); A treats the home Bridge (B) as a "printer" — the confirm dialog, slicing and AI Lab are all handled locally on A, while B does pure data relay, giving an experience identical to being at home.

```
外网 BambuStudio ──> 外网机 Bridge A ──Tailscale 隧道(加密)──> 家里电脑 Bridge B ──局域网──> Snapmaker U1
```

**一键配置（推荐 Tailscale Serve，零防火墙配置）/ One-line setup (Tailscale Serve recommended, zero firewall configuration)**：
1. 家内外设备都安装 [Tailscale](https://tailscale.com/download) 并登录同一账号（免费版即可）/ Install [Tailscale](https://tailscale.com/download) on both devices and log in with the same account (free tier is fine)
2. 家里电脑执行一次（无需管理员，重启后自动生效，tailnet 需启用 HTTPS）/ Run once on the home PC (no admin needed, auto-applies after restart; enable HTTPS on the tailnet)：
   `tailscale serve --bg http://127.0.0.1:13628` —— tailscaled 在本机 loopback 代理并自动签发 HTTPS 证书，防火墙无需放行 node.exe（traps.md #154）
3. 外网机打开 WebUI（`http://127.0.0.1:13628` 齿轮设置）→ **Connection** → 选 **Remote Bridge** → 填家里 serve 地址（如 `https://vitasguo-pc.tailxxxx.ts.net`）→ **Test** 显示 reachable → 保存
   On the remote device, open the WebUI (`http://127.0.0.1:13628` gear settings) → **Connection** → select **Remote Bridge** → enter the home serve address (e.g. `https://vitasguo-pc.tailxxxx.ts.net`) → **Test** shows reachable → save
4. 切片 → Print：上传立即返回，外网机弹出耗材映射确认框（与在家完全相同），确认后开始打印 / Slice → Print: upload returns immediately, the confirm dialog pops up on the remote machine, printing starts after confirmation

**工作机制 / How it works**：
- **级联透传**：A 将 B 视为 Moonraker 端点（HTTP + WebSocket 全透明转发），打印机 apikey 只存 B 侧，A 无需任何打印机凭据（`BRIDGE_CONFIG_DIR` / `BRIDGE_PORT` 支持本机多实例调试）
  **Cascade relay**: A treats B as a Moonraker endpoint (fully transparent HTTP + WebSocket forwarding); the printer apikey lives only on B; `BRIDGE_CONFIG_DIR` / `BRIDGE_PORT` support multi-instance debugging
- **效率与稳定**（v5.47.0+）：keep-alive 连接池、gzip 压缩（跨网流量降 ~70-80%）、大文件流式转发（146MB 实测完整）、WS 30s ping 保活、上传瞬时错误自动重试
  **Efficiency & stability** (v5.47.0+): keep-alive pool, gzip (cross-network traffic −~70-80%), large-file streaming (146MB verified), WS 30s ping keep-alive, upload auto-retry
- **信任模型**：依赖 Tailscale 设备级认证（tailnet 内均为自有设备），serve 仅 tailnet 可达，Bridge 不额外加 token
  **Trust model**: relies on Tailscale device-level auth (your own devices only); serve is tailnet-only; Bridge adds no extra token

**高级：直连模式（bind 三态，需管理员放行防火墙）/ Advanced: direct-connection mode (three-state bind, requires admin firewall rule)**：

| bind 模式 / bind mode | 监听地址 / Listen address | 可访问者 / Who can access |
|-----------|---------|---------|
| Local only（默认 / default） | 127.0.0.1 | 仅本机 / This machine only |
| Tailnet only | 100.x.x.x + 127.0.0.1 双监听 / dual listening | 本机 + tailnet 内设备 / This machine + tailnet devices |
| All interfaces | 0.0.0.0 | 局域网所有设备（不推荐）/ All LAN devices (not recommended) |

> 直连需防火墙放行 node.exe 入站；若此前点过"取消"会残留自动生成的 Block 规则（优先级高于 Allow，需管理员删除，traps.md #154）。serve 模式无此要求，推荐使用。
> Direct mode requires the firewall to allow node.exe inbound; clicking "Cancel" earlier leaves an auto Block rule (higher priority than Allow; delete as admin, traps.md #154). Serve mode has no such requirement — recommended.

---

## 关键设计决策 / Key Design Decisions

- JSONP 桥接（`bridgeGET` / `bridgePOST`）：BambuStudio WebView 阻止 fetch/XHR，但允许 `<script>` 加载 / BambuStudio's WebView blocks fetch/XHR but allows `<script>` loading
- 分步打印命令（非 `SDCARD_PRINT_FILE_WITH_PARAMETERS`）：`SET_PRINT_TASK_PARAMETERS` 不更新 `reprint_info`，映射不生效（traps.md #101）/ Stepwise commands: `SET_PRINT_TASK_PARAMETERS` doesn't update `reprint_info`, so mapping fails (traps.md #101)
- `patchGcodeLayout()` 上传时重组 gcode：BambuStudio CONFIG_BLOCK 在开头，Moonraker 只搜索文件末尾 / reassembles gcode on upload: BambuStudio puts CONFIG_BLOCK first, Moonraker only searches the file end
- Snapshot 轮询（非 MJPEG 流）：U1 不运行 mjpegstreamer，通过 `monitor.jpg` 单张 JPEG 实现 / Snapshot polling via single `monitor.jpg` JPEGs (U1 does not run mjpegstreamer)

## 设备控制功能 / Device Control Features

| 功能 / Feature | WebUI | Fluidd |
|------|-------|--------|
| 摄像头 / Camera | ✅ 实时预览 / Live preview | ✅ 完整监控 / Full monitoring |
| 打印进度 / Print progress | ✅ 百分比 + 层数 / % + layer | ✅ 完整管理 / Full management |
| 温度控制 / Temperature | ✅ 热床+4喷头 / Bed + 4 nozzles | ✅ 完整温度图 / Full graph |
| 灯光 / Lights | ✅ 开关 / On-off | ❌ |
| 风扇 / Fan | ✅ 冷却+腔体 / Cooling + chamber | ✅ 完整风扇图 / Full graph |
| 耗材信息 / Filament info | ✅ 类型+颜色 / Type + color | ❌ |
| 速度调节 / Speed | ✅ 5挡 / 5 levels | ✅ 全部控制 / Full control |
| Z轴控制 / Z-axis | ✅ 上下+回原点 / Up-down + home | ✅ |
| 打印控制 / Print control | ✅ 开始/暂停/恢复/取消 | ✅ 完整 Klipper / Full Klipper |
| AI 实验室 / AI Lab | ✅ G-code 优化 + 打印助手（流式输出 + Thinking 模式） | ❌ |
| G-code 转换 / G-code conversion | ✅ BambuStudio→OrcaSlicer | ❌ |

---

## 关键注意事项 / Key Notes

- **BambuStudio 更新后需重新安装**：更新可能覆盖配置，重新运行 `install.bat` 即可 / **Re-run install after BambuStudio updates**: updates may overwrite config; just re-run `install.bat`
- **打印机自动检测**：Bridge 首启通过 mDNS 自动检测；失败时浏览器打开 `http://127.0.0.1:13628` 手动配置 / **Auto-detection**: mDNS on first launch; if it fails, configure manually at `http://127.0.0.1:13628`
- **多色打印**：U1 的 4 工具头换色正常；确认框映射行按 gcode 实际使用的颜色动态生成（v5.48.0，支持 8+ 色工程），每槽位下拉可选 4 个物理槽位，多槽可映射同一物理头 / **Multi-color**: the U1's 4 tool heads work; mapping rows are generated dynamically from the colors actually used (v5.48.0, supports 8+ color projects); each slot's dropdown offers the 4 physical slots; multiple slots can map to one physical head
- **⚠️ 设备面板直接打印限制**：U1 触摸面板直接打印 BambuStudio gcode 会提示"未识别的gcode类型"（闭源固件检查 `;TYPE:` 层标记）——用 WebUI 侧栏 **转换 / Convert** 标签页的 **G-code 转换** 转为 OrcaSlicer 兼容格式，或通过 WebUI 打印 / **⚠️ Device panel limitation**: printing BambuStudio gcode directly on the U1 touch panel shows "未识别的gcode类型" (the closed-source firmware checks `;TYPE:` markers) — use the **G-code Conversion** in the WebUI **Convert** tab, or print via WebUI

---

## 常见问题 / FAQ

**Q：安装后 BambuStudio 中看不到 Snapmaker U1？/ Can't see the Snapmaker U1 in BambuStudio?**
A：完全关闭并重启 BambuStudio；检查文件是否正确复制到 `resources/profiles/` 目录。/ Completely close and restart BambuStudio; check the files were copied into `resources/profiles/`.
**Q：点击打印直接开始，没有弹出确认对话框？/ Print starts immediately, no confirm dialog?**
A：检查 Bridge 是否运行（任务管理器查找 node 进程）；检查 `print_host` 是否指向 `http://127.0.0.1:13628`；查看日志 `%APPDATA%\BambuStudio-Bridge\bridge.log`。/ Check Bridge is running (look for the node process); check `print_host` points to `http://127.0.0.1:13628`; check the log `%APPDATA%\BambuStudio-Bridge\bridge.log`.
**Q：安装后只看到 2 个耗材？/ Only 2 filaments after installation?**
A：重新运行 `install.bat`，脚本会自动清理耗材缓存。/ Re-run `install.bat`; the script auto-clears the filament cache.
**Q：BambuStudio 更新后兼容包失效？/ Pack stops working after a BambuStudio update?**
A：重新运行 `install.bat`。/ Re-run `install.bat`.

---

## 版本历史 / Version History

- **v5.48.0** (2026-10-08) - 修复 8+ 色工程耗材映射只显示前 4 槽（traps.md #164）/ Fixed 8+ color filament mapping showing only the first 4 slots (traps.md #164)
- **v5.47.0** (2026-08-24) - 级联链路网络效率优化 + 大文件传输稳定性（keep-alive / gzip / 流式转发 / WS ping）/ Cascade network efficiency + large-file transfer stability (keep-alive / gzip / streaming / WS ping)
- **v5.46.0** (2026-08-24) - 级联架构（两次 Bridge）+ WebUI 图形化连接配置（traps.md #161、#162、#163）/ Cascade architecture (two Bridges) + WebUI graphical connection config (traps.md #161, #162, #163)
- **v5.45.0** (2026-08-24) - 安装器远程模式开箱即用 + 正式/Beta 双通道配置目录（traps.md #158、#159、#160）/ Installer remote mode out of the box + stable/Beta dual-channel config dirs (traps.md #158, #159, #160)
- **v5.44.1** (2026-08-24) - Tailscale Serve 远程打印适配，`isLocalRequest` 请求来源判定（traps.md #154、#155）/ Tailscale Serve remote printing adaptation, `isLocalRequest` source detection (traps.md #154, #155)
- **v5.44.0** (2026-08-24) - Tailscale 远程打印正式版：确认交互跟随请求发起方 + bind 三态 / Tailscale remote printing official: confirm follows the request initiator + three-state bind
- **v5.38.0** (2026-07-02) - AI Lab/G-code 转换双语化 + 打印弹窗格式标识（traps.md #149、#150）/ Bilingualized AI Lab/G-code conversion + print dialog format indicator (traps.md #149, #150)
- **v5.36.0** (2026-06-29) - AI 调用公共模块提取 + PowerShell 脚本重构 / Shared AI invocation module extraction + PowerShell script refactor
- **v5.34.0** (2026-06-29) - 阶段 1 安全加固 + 资源泄漏修复（11 项）/ Phase 1 security hardening + resource leak fixes (11 items)
- **v5.31.0** (2026-06-15) - G-code 转换独立为侧栏标签页 / G-code conversion as standalone sidebar tab
- **v5.30.0** (2026-06-10) - Bridge 看门狗（崩溃自动重启）+ uncaughtException 防护 / Bridge watchdog (auto-restart on crash) + uncaughtException guard
- **v5.29.0** (2026-06-10) - G-code 转换功能（BambuStudio→OrcaSlicer 兼容）/ G-code conversion (BambuStudio→OrcaSlicer compatible)
- **v5.20.0** (2026-06-08) - AI 实验室模块 / AI Lab module
- **v5.18.1** (2026-05-30) - 打印层进度 + 保护用户自定义预设 / Print layer progress + protect user-defined presets
- **v5.16.1** (2026-05-27) - 修复耗材映射不生效严重 bug / Fixed severe filament mapping not taking effect
- **v5.12.1** (2026-05-27) - 打印确认框重新设计（3 部分）/ Print confirm dialog redesign (3 sections)
- **v5.10.1** (2026-05-27) - 修复风扇控制参数范围 / Fixed fan control parameter range
- **v5.9.0** (2026-05-27) - 修复摄像头参数 + 温度轮询 / Fixed camera parameters + temperature polling
- **v5.8.3** (2026-05-27) - 修复热床调平参数名 / Fixed bed leveling parameter names
- **v5.5.0** (2026-05-25) - WebUI 全面替换 fetch→JSONP / WebUI fully switched from fetch to JSONP
- **v5.0** (2026-05-24) - Node.js Bridge 重构 / Node.js Bridge rewrite
- **v3.0** (2026-05-14) - 全品牌耗材库 / Full-brand filament library
- **v1.0** (2026-05-13) - 初始版本 / Initial version

---

## 许可证 / License

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。
Released under the [GNU Affero General Public License v3.0](LICENSE).

配置文件来源于 / Config files originate from：**OrcaSlicer** — AGPL-3.0 — https://github.com/SoftFever/OrcaSlicer · **BambuStudio** — AGPL-3.0 — https://github.com/bambulab/BambuStudio
局域网直连基于 Moonraker 的 OctoPrint API 兼容层 / LAN direct connection is based on Moonraker's OctoPrint API layer：**Moonraker** — GPL-3.0 — https://github.com/Arksine/moonraker · **Klipper** — GPL-3.0 — https://github.com/Klipper3d/klipper
