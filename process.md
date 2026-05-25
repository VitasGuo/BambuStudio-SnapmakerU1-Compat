# Snapmaker U1 BambuStudio 兼容包

## 项目目标
将 Snapmaker U1 3D 打印机配置集成到 BambuStudio 中，实现切片功能 + 原生级设备控制体验

## 更新日期: 2026-05-26 (v5.7.2)

---

## v5.7.2 修复 mDNS 自动检测端口错误（1884→80）

### 问题
uninstall-重启-reinstall 后，WebUI 显示 reconnecting，无法连接打印机。Bridge 日志持续 `WS Moonraker error: read ECONNRESET`。

### 根因
mDNS 自动检测使用 `service.port` 获取端口，U1 的 `_snapmaker._tcp.local.` mDNS 服务注册的端口是 **1884**（MQTT 端口），不是 Moonraker HTTP 端口 80。`autoDetectPrinter()` 将 `printerConfig.port` 设为 1884，导致 `getBaseUrl()` 返回 `http://192.168.1.12:1884`，所有 HTTP/WebSocket 请求发到了 MQTT 端口。traps.md #80

### 修复
- `autoDetectPrinter()`：移除 `service.port` 使用，硬编码 `printerConfig.port = 80`（Moonraker HTTP 端口）
- `/api/bridge/scan`：返回 `port: 80`（HTTP 端口）+ `mdns_port`（mDNS 原始端口，仅供参考）
- 日志改进：显示 mDNS 原始端口和实际使用端口

### 修改文件
- `bridge-node/server.js` — 版本号 5.7.1→5.7.2；mDNS 端口修复；scan 端点修复
- `bridge-node/package.json` — 版本号 5.7.1→5.7.2
- `reinstall.ps1` / `install.ps1` / `uninstall.ps1` — v5.7.2

---

## v5.7.1 排版优化 + 中文术语修正 + Snapmaker logo

### 变更
1. **中文翻译修正为3D打印专业术语**：工具→喷头、目标温度→设定温度、模型风扇→冷却风扇、归零→回原点、已装载→已装入、空闲→待机、在线→已连接等
2. **排版优化**（不改功能）：
   - Control 面板：温度项更紧凑（间距/gap/padding 缩小），温度显示格式 `200/200°C` 替代 `200°C / 200°C`
   - 风扇/速度行：添加 `flex-wrap:wrap` 防止中文横向溢出，图标/字号/间距统一缩小
   - 耗材 slot：统一 `.fil-det` class 替代内联样式，字号 12px，行高 1.3
   - 面板 header/body：padding 缩小，字号从 16px→15px
   - Tool tabs / Step tabs：字号缩小，间距收紧
   - Z 按钮：尺寸从 112×38→100×34
   - Feed Status 区：字号缩小，间距优化
3. **左上角 logo 替换为 Snapmaker 品牌图标**：`bridge/web/snapmaker.png`，服务端新增 `/snapmaker.png` 路由

### 修改文件
- `bridge/web/webui.html` — CSS 排版优化；中文术语修正；logo 替换
- `bridge/web/snapmaker.png` — 新增品牌图标
- `bridge-node/server.js` — 版本号 5.7.0→5.7.1；新增 `/snapmaker.png` 路由
- `bridge-node/package.json` — 版本号 5.7.0→5.7.1
- `bridge-node/package-lock.json` — 版本号 5.4.0→5.7.1
- `reinstall.ps1` / `install.ps1` / `uninstall.ps1` — v5.7.1

---

## v5.7.0 WebUI 中英文切换 + Filament 流量校准 + Speed 5 挡

### 变更
1. **WebUI 中英文切换**：默认中文，顶栏 "中/EN" 按钮一键切换，语言偏好保存到 localStorage
2. **Filament 流量校准按钮**：每个耗材 slot 下方 "流量校准/Flow Cal" 按钮
3. **Speed 5 挡**：50/80/100/120/150%，与设备屏幕对应

### i18n 实现方案
- `I18N` 对象包含 `en` 和 `zh` 两套翻译字典（50+ 条目）
- `data-i18n` 属性标记静态 HTML 元素，`setLang()` 遍历 DOM 更新
- `data-i18n-ph` 属性标记 input placeholder
- `t(key)` 函数处理 JS 动态生成的文本
- 默认语言 `zh`，存储在 `localStorage.bridge_lang`

### 修改文件
- `bridge/web/webui.html` — 完整 i18n 系统；Flow Cal 按钮；Speed 5 挡
- `bridge-node/server.js` — 版本号 5.6.0→5.7.0
- `bridge-node/package.json` — 版本号 5.6.0→5.7.0
- `reinstall.ps1` / `install.ps1` / `uninstall.ps1` — v5.6.0→v5.7.0
- `process.md` — 版本记录

---

## v5.6.0 Filament 流量校准 + Speed 5 挡

### 变更
1. **Filament 模块新增流量校准按钮**：每个耗材 slot 下方添加 "Flow Cal" 按钮，点击后发送 `SM_PRINT_FLOW_CALIBRATE INDEX=n` G-code 命令。打印中自动禁用，点击后 5 秒冷却防止重复触发
2. **Control 模块 Speed 从 4 挡改为 5 挡**：与设备屏幕对应，50% / 80% / 100% / 120% / 150%

### 修改文件
- `bridge/web/webui.html` — 新增 `.fil-cal-btn` CSS；4 个耗材 slot 添加 Flow Cal 按钮；新增 `calibrateFlow()` 函数；Speed 按钮从 4 挡改为 5 挡
- `bridge-node/server.js` — 版本号 5.5.0→5.6.0
- `bridge-node/package.json` — 版本号 5.5.0→5.6.0
- `reinstall.ps1` / `install.ps1` / `uninstall.ps1` — v5.5.0→v5.6.0

---

## v5.5.0 WebUI 全面替换 fetch→JSONP，绕过 BambuStudio WebView XHR 限制

### 核心发现
BambuStudio 的 WebView（wxWebView）**阻止了 `fetch()` 和 `XMLHttpRequest`**，但允许 `<script>` 和 `<img>` 标签的原生加载。这是 WebUI 数据不显示的根本原因。

### 解决方案
采用 JSONP 风格的 `<script>` 标签加载方式绕过限制：
- **bridgeGET(path, cb)**：Moonraker 端点通过 `/api/bridge/proxy.js?path=xxx&cb=callbackName` 代理；Bridge 端点通过 `path.js` JSONP 端点直接返回
- **bridgePOST(path, body, cb)**：将 POST 参数编码为 query string，通过 `path.js?param1=1&param2=0&cb=callbackName` 的 GET 请求完成
- **Camera 轮询**：`new Image()` 替代 `fetch() + blob`
- **初始数据**：`<script src="/api/bridge/init-data.js">` 直接加载

### 服务端新增端点
1. `GET /api/bridge/pending_print.js` — JSONP 版本，返回 `cb({filename: "..."})`
2. `GET /api/bridge/confirm_print.js` — JSONP 版本，query params 传选项
3. `GET /api/bridge/cancel_pending.js` — JSONP 版本
4. `GET /api/bridge/debug/logs.js` — JSONP 版本

### 前端替换（10 处 fetch→bridgeGET/bridgePOST）
1. `loadFiles()` — Print Job 文件列表
2. `onPendingPrint()` — 打印确认耗材信息
3. `printFile()` — 打印文件耗材信息
4. `closePrintModal()` — 取消打印
5. `doPrint()` — 确认打印 + 查询 pending
6. WS onopen — 查询 pending_print
7. `loadFilamentInfo()` — 耗材信息加载
8. `loadDebugLogs()` — Debug 日志
9. 初始数据加载（已在 v5.4.0 完成）
10. Camera 轮询（已在 v5.4.0 完成）

### 修改文件
- `bridge-node/server.js` — 版本号 5.4.0→5.5.0；新增 4 个 JSONP 端点
- `bridge/web/webui.html` — 重写 bridgeGET/bridgePOST；替换全部 10 处 fetch()
- `bridge-node/package.json` — 版本号 5.4.0→5.5.0
- `reinstall.ps1` — v5.4.0→v5.5.0
- `install.ps1` — v5.4.0→v5.5.0
- `uninstall.ps1` — v5.4.0→v5.5.0
- `process.md` — 版本记录
- `traps.md` — 新增 #79

### 已知问题
- 需要在 BambuStudio WebView 中实际测试所有功能

---

## v5.4.0 代理链路完整修复 — Fluidd/Camera/打印一体化代理

### 核心思路
Bridge 的唯一职责是代理。代理通了，Fluidd、Camera、打印自然都通。此前 Fluidd 一直 Connecting、Camera 获取旧照片、打印 formidable 报错等问题，根因都是代理不完整。

### 变更
1. **中间件顺序调整**：`express.raw()` 移到 `express.json()` 之前，确保二进制请求体（G-code 上传）不被 JSON parser 消费
2. **Fluidd SPA 回退路由**：新增 `app.get("/fluidd/{*path}", ...)` 返回 `index.html`，解决 Vue Router 导航到子路径时 404 的问题
3. **`proxyToMoonraker` 完全重写**：完整转发所有响应头（除 `transfer-encoding`、`connection`），改进 body 处理逻辑（支持 Buffer/string/JSON 三种类型）
4. **WebSocket 代理改进**：添加 `moonrakerWs.on("error")` 处理，改进 close 中的清理逻辑，添加消息丢弃日志
5. **Webcam 代理改进**：完整转发响应头，与 `proxyToMoonraker` 保持一致
6. **安装脚本版本同步**：reinstall.ps1 / install.ps1 / uninstall.ps1 全部更新到 v5.4.0

### 代理链路验证结果（全部通过）
- ✅ HTTP 代理：`/api/version`、`/server/info`、`/printer/info`、`/access/token`、`/server/database/item` 正确返回 JSON
- ✅ WebSocket 代理：`server.connection.identify` 正确响应（`connection_id` 正常）
- ✅ Fluidd config.json：正确返回 `endpoints: [{"url": "/"}]`
- ✅ Fluidd 静态资源：JS (559KB) 和 CSS (69KB) 正确返回
- ✅ Fluidd SPA 回退：`/fluidd/printer` 返回 `index.html`
- ✅ Camera 快照：`/server/files/camera/monitor.jpg` 返回 JPEG 图片

### 修改文件
- `bridge-node/server.js` — 版本号 5.3.0→5.4.0；中间件顺序；Fluidd SPA 回退；proxyToMoonraker 重写；WS 代理改进；Webcam 代理改进
- `reinstall.ps1` — v5.2.2→v5.4.0
- `install.ps1` — v5.2.2→v5.4.0
- `uninstall.ps1` — v5.2→v5.4.0
- `process.md` — 版本记录
- `traps.md` — 新增 #70~#73

### 已知问题
- 需要在 BambuStudio WebView 中实际测试 Fluidd 是否能通过 Bridge 代理成功连接 Moonraker

---

## v5.2.2 修复 Fluidd Connecting + Camera 轮询 + 缓存

### 变更
- 修复 Fluidd 一直 Connecting（WebSocket 代理竞态条件：客户端消息在 Moonraker WS 连接前被丢弃）
- 修复摄像头图片轮询不刷新（Express ETag 缓存 + WebView 缓存）
- 修复摄像头一次加载失败就停止轮询（改为连续 5 次失败才停止）
- 移除侧边栏刷新按钮，只保留顶栏刷新按钮
- 禁用 Express ETag 生成（`app.set("etag", false)`）
- 添加全局 Cache-Control/Pragma no-cache 头

### 修改文件
- `bridge-node/server.js` - WebSocket 代理消息队列；禁用 ETag；全局缓存头
- `bridge/web/webui.html` - 摄像头连续错误计数；移除侧边栏刷新按钮

### 已知问题
- 需要添加 debug 日志模块（用户反馈时方便排查问题）traps.md #66 #67

---

## v5.2.1 修复摄像头视频流 + 代理二进制数据

### 变更
- 修复 WebUI 摄像头模块无法显示视频（`proxyToMoonraker` 使用 `r.text()` 破坏二进制 JPEG 数据）
- 将 `proxyToMoonraker` 改为 `Buffer.from(await r.arrayBuffer())` 正确处理二进制响应
- 修复 Fluidd iframe 连接问题（拦截 `/access/token` 返回空 token + config.json endpoints 配置）
- 修复 WebUI 热床温度不显示（初始查询 URL 添加 `heater_bed`）
- 修复 Express 5 `{*path}` 返回数组问题（添加 `wcPath()` 辅助函数）
- 添加界面刷新按钮
- 安装脚本添加 `npm install --production` 步骤

### 修改文件
- `bridge-node/server.js` - 修复 proxyToMoonraker 二进制数据处理；添加 wcPath 辅助函数；拦截 /access/token；简化根路由和 config API
- `bridge/web/webui.html` - 添加侧边栏导航、Fluidd 标签页、切换逻辑、刷新按钮、heater_bed 查询
- `bridge/web/dist/config.json` - Fluidd endpoints 配置
- `reinstall.ps1` / `install.ps1` - 添加 npm install --production 步骤
- `traps.md` - 新增 #62~#65

---

## v5.2 集成 Fluidd 到 WebUI，实现统一界面

### 变更
- 将 Fluidd 直接作为 WebUI 的一个模块，不再需要来回切换
- 侧边栏新增两个导航选项：Device（设备控制）和 Fluidd（控制台）
- Device 标签页：保留原有的 2x2 网格布局（Camera、Control、Print Job、Filament）
- Fluidd 标签页：使用 iframe 嵌入完整的 Fluidd 界面，包括 G-code 控制台、温度图表、文件管理等
- 移除顶部的模式切换按钮
- 简化后端代码，移除 mode 相关 API 逻辑
- Setup 页面移除模式选择，默认使用集成界面

### 修改文件
- `bridge/web/webui.html` - 添加侧边栏导航、Fluidd 标签页、切换逻辑
- `bridge-node/server.js` - 移除 mode 参数处理、renderFluiddWrapper、mode API，简化根路由
- `process.md` - 版本记录

---

## v5.1 mDNS 自动检测完善 + Setup 页面重设计 + 文档更新

### 变更
- Setup 页面重设计：Scan Network 大按钮为主操作，手动输入 IP 降为备选（"or enter manually" 分隔线下方）
- Setup 页面副标题从"Connect your Klipper printer"改为"Auto-detection did not find a printer on your network."，明确告知自动检测已尝试
- Setup 页面提示信息更新：强调打印机需开机且在同一网络
- README.md 用户安装流程重写：4 步简化为 3 步，移除手动输入 IP 步骤
- 安装脚本 Next steps 更新：提示 mDNS 自动检测，无需手动输入 IP
- 全项目审查：移除所有"手动输入 IP"的过时描述

### 修改文件
- `bridge-node/server.js` - Setup 页面重设计（Scan 为主，手动为备）
- `README.md` - 用户流程 4 步→3 步
- `install.ps1` - Next steps 更新
- `reinstall.ps1` - Next steps 更新
- `process.md` - 版本记录

---

## v5.0 Node.js Bridge 重构 + 原生打印确认对话框 + 冗余清理

### 变更
- Bridge 从 Python 重构为 Node.js（`bridge-node/` 替代 `bridge/server/`）
- 新增 Windows 原生打印确认对话框（`bridge-node/dialog.js`）
- 切片后点击 Print → Bridge 弹出 WinForms 对话框（耗材选择 + 打印选项）
- 安全修复：Base64 编码防止 PowerShell 变量注入、随机化临时文件名
- 代码审查修复 12 个问题（3 严重 + 4 中等 + 5 轻微）
- 安装脚本全部更新：Python→Node.js，v4.9→v5.0
- 清理旧 Python Bridge 代码（`bridge/server/`, `bridge/setup.bat`, `bridge/start.bat`）
- 清理构建产物（`bridge-node/dist/`, `bridge-node/node_modules/`）
- 更新 `.gitignore`、`README.md`

### 修改文件
- `bridge-node/server.js` — 新文件，Node.js Bridge 核心
- `bridge-node/dialog.js` — 新文件，跨平台原生对话框
- `bridge-node/package.json` — 新文件，Node.js 依赖
- `bridge-node/build.js` — 新文件，esbuild 打包脚本
- `reinstall.ps1` — v5.0，Python→Node.js
- `install.ps1` — v5.0，Python→Node.js
- `uninstall.ps1` — v5.0，停止进程兼容 Node.js
- `README.md` — 重写，反映 v5.0 架构
- `.gitignore` — 更新规则
- 删除 `bridge/server/`（main.py, installer.py, print_dialog.py, requirements.txt）
- 删除 `bridge/setup.bat`, `bridge/start.bat`

---

## v4.8 完整代码审查修复

### 审查发现并修复的问题
1. **`gcode()` 函数使用不存在的 HTTP 端点** — 所有 G-code 命令（移动/加热/风扇/灯光/暂停/恢复/取消）通过 `/printer/gcode/script` HTTP 端点发送，但该端点在 U1 Moonraker 中不存在。修复：优先使用 WebSocket JSON-RPC 发送，HTTP 作为 fallback
2. **`doPrintSimple()` 使用不存在的 HTTP 端点且无安全检测** — 修复：改用 WebSocket JSON-RPC + `SDCARD_PRINT_FILE` 命令，添加打印机状态检查
3. **`BRIDGE_VERSION` 未更新** — 从 `"4.0"` 更新到 `"4.7"`
4. **WebSocket 代理中重复 `import websockets`** — 删除函数内部的重复导入
5. **`_notify_webui` 使用已弃用的 `asyncio.get_event_loop()`** — 改为 `asyncio.get_running_loop()`
6. **`doPrint()` else 分支未清除 pending_print_file** — WebSocket 发送成功后调用 `/api/bridge/cancel_pending` 清除 Bridge 端的 pending 状态

### 修改文件
- `bridge/server/main.py` — 版本号更新；删除重复导入；修复弃用 API
- `bridge/web/webui.html` — `gcode()` 改用 WebSocket 优先；`doPrintSimple()` 改用 WebSocket + 安全检测；清除 pending 状态

---

## v4.7 G-code 参数格式 + Physical Printer 覆盖修复

### 问题
1. 打印确认对话框点击 Start Print 后报 "unable to parse True"/"unable to parse False"
2. 切片后打印不触发确认对话框（上传直接到打印机，绕过 Bridge）

### 根因
- **问题 1**：Klipper 的 G-code 宏解析器不能识别字符串 `"True"`/`"False"`，只接受数字 `1`/`0`。Fluidd 日志明确显示：`!! Error on 'SDCARD_PRINT_FILE_WITH_PARAMETERS ... AUTO_BED_LEVELING="True"': unable to parse True`
- **问题 2**：用户自定义 machine 配置 `Snapmaker U1 (0.4 nozzle) - 拷贝.json` 中 `"print_host": "192.168.1.12"` 覆盖了系统配置的 `"print_host": "http://127.0.0.1:13628"`，导致 BambuStudio 直接与打印机通信，绕过 Bridge

### 修复
- **G-code 参数格式**：`AUTO_BED_LEVELING="True"` → `AUTO_BED_LEVELING=1`，`FLOW_CALIBRATE="False"` → `FLOW_CALIBRATE=0`（去掉引号，用数字代替字符串）
- **Bridge `confirm_print`**：同样改为数字格式，并将布尔值转换逻辑统一
- **Physical Printer 配置**：需要用户手动在 BambuStudio 中修改 Physical Printer 的 print_host 为 `http://127.0.0.1:13628`

### 修改文件
- `bridge/web/webui.html` — `doPrint()` 参数格式 `True/False` → `1/0`
- `bridge/server/main.py` — `confirm_print` 参数格式统一转换

### 用户操作
⚠️ reinstall 脚本已自动修补用户配置中的 `print_host`（v4.9）。如手动在 BambuStudio 中重新添加 Physical Printer，需确保 print_host 设为 `http://127.0.0.1:13628`

---

## v4.6 WebSocket G-code + 安全检测 + 日志增强

### 问题
1. 打印确认对话框点击 Start Print 后报 "gcode failed"
2. 打印无安全检测，耗材加载中/热端移动中也能启动打印
3. 切片后打印不触发确认对话框（上传成功但通知未到达 WebUI）

### 根因
- **问题 1**：U1 Moonraker 的 `/printer/gcode/script` **没有注册为 HTTP 端点**（klippy_apis.py 中只注册了 `/printer/print/start` 等端点，`gcode/script` 只是 Klipper 内部 RPC 端点）。WebUI 和 Bridge 通过 HTTP POST 调用此端点会返回 404
- **问题 2**：`doPrint()` 没有检查打印机状态
- **问题 3**：上传拦截逻辑正确（文件已上传到 Moonraker），但需要日志确认 `print=true` 是否被正确拦截

### 修复
- **WebUI `doPrint()`**：else 分支改用 WebSocket JSON-RPC 发送 `printer.gcode.script`（通过已有的 WebSocket 连接），不再使用 HTTP 端点
- **Bridge `confirm_print`**：改用 `websockets` 库建立临时 WebSocket 连接到 Moonraker，发送 `printer.gcode.script` JSON-RPC 请求，读取响应确认成功/失败
- **安全检测**：`doPrint()` 添加 `print_stats.state` 检查，printing/paused 状态禁止启动新打印
- **布尔值格式**：JavaScript `true/false` → Python `True/False`（与 klippy_apis.py 一致）
- **日志增强**：上传拦截添加详细日志（content_type、filename、print_flag、uploaded_path、Moonraker 响应状态）

### 修改文件
- `bridge/server/main.py` — `confirm_print` 改用 WebSocket；上传拦截加日志
- `bridge/web/webui.html` — `doPrint()` 改用 WebSocket JSON-RPC；添加安全检测

---

## v4.5 打印确认流程关键修复

### 问题
1. BambuStudio 切片后点打印不触发确认对话框
2. 从文件列表触发确认对话框后，点击 Start Print 打印机无反应

### 根因
- **问题 2**：U1 Moonraker 的 `/server/files/start_local_print` 端点注册时使用 `transports=(TransportType.all() & ~TransportType.HTTP)`，**明确排除了 HTTP 传输**，只支持 WebSocket/MQTT。Bridge 和 WebUI 通过 HTTP POST 调用此端点会被 Moonraker 拒绝
- **问题 1**：BambuStudio 上传时 WebUI 可能还没加载（用户在 Prepare 标签页），WebSocket 通知发出后无人接收。WebUI 加载后不检查 pending print

### 修复
- Bridge 的 `confirm_print` 端点改为通过 `/printer/gcode/script` 发送 `SDCARD_PRINT_FILE_WITH_PARAMETERS` G-code 命令（参考 klippy_apis.py:332 的 `start_print_advanced` 实现），绕过 HTTP 传输限制
- WebUI 的 `doPrint()` else 分支也改用 G-code 方式而非 `/server/files/start_local_print`
- WebUI 的 `doPrint()` 添加 HTTP 状态码检查和错误提示
- WebSocket 连接建立后检查 `/api/bridge/pending_print`，如有待确认打印则弹出对话框

### 修改文件
- `bridge/server/main.py` — `confirm_print` 改用 G-code 发送
- `bridge/web/webui.html` — `doPrint()` 改用 G-code；添加 pending print 检查；添加错误提示

---

## v4.4 热床模型高度修复

### 问题
切片界面热床模型高度不对，薄模型（如首层 0.2mm）会和热床模型重叠导致显示异常

### 根因
`Snapmaker U1_bed_texture.stl`（bed_model）的 Z 范围为 0.000 ~ 0.510，整个模型在 Z=0（打印面）之上。BambuStudio 默认 Z 偏移仅 -0.03（[3DBed.cpp:609](file:///c:/Users/VitasGuo/Documents/SOLO/3D-printer/BambuStudio-master/BambuStudio-master/src/slic3r/GUI/3DBed.cpp#L609)），偏移后模型顶部仍在 Z=0.480，远高于打印面

### 修复
- `Snapmaker U1_bed_texture.stl`：所有 Z 坐标下移 0.510，Z 范围从 `0.000~0.510` → `-0.510~0.000`
- `Snapmaker U1_bed.stl`：所有 Z 坐标下移 0.050，Z 范围从 `-0.450~0.050` → `-0.500~0.000`
- 偏移后模型顶部在 Z=-0.03，刚好在打印面之下，不再与模型重叠

### 修改文件
- `Snapmaker/Snapmaker U1_bed_texture.stl` — Z 坐标下移 0.510
- `Snapmaker/Snapmaker U1_bed.stl` — Z 坐标下移 0.050

---

## v4.3 Bridge 代理打印 4 个关键 Bug 修复

### 核心改动
- **Bug 1: 初始查询缺少 `print_stats`/`display_status`** — 页面加载时的 HTTP 查询只查了 extruder/fan/gcode_move 等，没有查 `print_stats` 和 `display_status`。`D.print_stats` 始终为 `{}`，`ps.state` 为 `undefined`，`if(ps.state)` 判断失败，按钮永远不更新。修复：添加 `print_stats` 和 `display_status` 到初始查询 URL，查询完成后调用 `upd({})` 触发完整 UI 更新
- **Bug 2: WebSocket 订阅响应未处理** — `ws.onmessage` 只处理 `notify_status_update`，但 WebSocket 订阅的初始响应格式是 `{result: {status: {...}}}`（没有 `method` 字段），被完全忽略。修复：添加 `if(m.result&&m.result.status)upd(m.result.status)` 处理订阅响应
- **Bug 3: `bridge_confirm_print` 不读取请求体** — 参数 `options: dict = None` 被 FastAPI 当作 query parameter，前端发送的 JSON 选项（auto_bed_leveling/flow_calibrate/timelapse）永远为 None。修复：改为 `request: Request` + `await request.json()` 读取请求体
- **Bug 4: 上传拦截仍转发 `print=true` 导致直接打印** — 旧代码将原始 multipart body（含 `print=true`）直接转发给 Moonraker 的 `/api/files/local`，Moonraker 收到后立即启动打印。Bridge 虽然设置了 `pending_print_file`，但打印已经开始了。修复：改用 `request.form()` 解析 multipart 表单，提取 file 和 print 字段，使用 Moonraker 原生上传 API (`/server/files/upload`) 只上传文件不启动打印，然后返回 OctoPrint 兼容响应给 BambuStudio

### 技术细节
- Moonraker 原生上传 API `/server/files/upload` 不会自动启动打印（不像 OctoPrint 兼容层 `/api/files/local` 会根据 `print=true` 自动启动）
- 原生 API 响应格式：`{"result": {"item": {"path": "test.gcode", "root": "gcodes", ...}, "action": "create_file"}}`
- Bridge 返回 OctoPrint 兼容格式：`{"files": [{"name": "test.gcode", "path": "test.gcode", "origin": "local"}], "done": 1}`
- BambuStudio 的 OctoPrint 上传只检查 HTTP 状态码，不严格解析响应体

### 配置提醒
- reinstall 脚本已自动修补用户配置中的 `print_host`（v4.9+）
- 如果 Physical Printer 仍指向打印机 IP，BambuStudio 会直接与 Moonraker 通信，绕过 Bridge，打印确认对话框不会触发
- machine JSON 中的 `print_host: "http://127.0.0.1:13628"` 只影响新建的 Physical Printer，已有的 Physical Printer 由 reinstall 脚本自动修补

### 修改文件
- `bridge/web/webui.html` — 初始查询添加 print_stats/display_status；查询后调用 upd({})；WebSocket 订阅响应处理
- `bridge/server/main.py` — _handle_upload_with_confirm 改用原生上传 API；bridge_confirm_print 改用 Request 读取请求体

---

## v4.2 Print Job 修复 + 打印确认对话框 + Bridge 代理打印

### 核心改动
- **Print Job 按钮状态修复** — `printing` 状态不再要求 `display_status.progress!=null`，只要 `print_stats.state==='printing'` 就显示 Pause+Stop 按钮；idle 状态显示具体状态文本（Complete/Cancelled/Error/Idle）
- **删除 Record 按钮** — U1 不支持录像功能
- **Camera 播放按钮修复** — 添加 `camProbing` 状态，探测期间显示 "Detecting camera..."；探测完成后更新 UI 文本
- **打印确认对话框** — 点击文件列表中的 gcode 文件后弹出确认对话框：
  - 耗材选择：4 个挤出机的类型/颜色/状态，可勾选
  - 打印选项：Auto Bed Leveling / Flow Calibration / Timelapse
  - 使用 `POST /server/files/start_local_print` API
- **Bridge 代理打印** — machine JSON 添加 `print_host` 和 `host_type: octoprint`，BambuStudio 切片打印请求经过 Bridge 代理
  - `POST /api/files/local` 上传拦截：`print=true` 时上传文件但不启动打印，通过 WebSocket 通知 WebUI 弹出确认对话框
  - 新增 API：`/api/bridge/pending_print`、`/api/bridge/confirm_print`、`/api/bridge/cancel_pending`
  - WebSocket 客户端跟踪（`ws_bridge_clients`），Bridge 事件通过 `notify_bridge_event` 注入

### 技术细节
- U1 Moonraker 有 OctoPrint 兼容层，`/api/version` 返回 `"OctoPrint (Moonraker 1.3.0)"`
- `SDCARD_PRINT_FILE_WITH_PARAMETERS` 宏支持 `AUTO_BED_LEVELING`、`FLOW_CALI`、`TIME_LAPSE_CAMERA` 参数
- `POST /server/files/start_local_print` 接受 `{path, options, print_plate}` 参数
- BambuStudio OctoPrint 上传使用 multipart form，`print=true` 字段控制是否自动启动打印

### 修改文件
- `bridge/web/webui.html` — Print Job 按钮逻辑；Camera 修复；打印确认对话框；WebSocket 事件处理
- `bridge/server/main.py` — 上传拦截；pending print 管理；WebSocket 客户端跟踪；Bridge 事件通知
- `Snapmaker/machine/Snapmaker U1 (0.4 nozzle).json` — 添加 `print_host` 和 `host_type`

---

## v4.1 摄像头模块改造 + mDNS 打印机自动发现

### 核心改动
- **摄像头从 MJPEG stream 改为 snapshot 轮询** — U1 不提供 MJPEG 视频流（`/webcam/?action=stream` 返回 502），而是通过 `/server/files/camera/monitor.jpg` 单张 JPEG 照片轮询方式实现（500ms 间隔），与 Snapmaker App 和 OrcaSlicer 行为一致
- **移除旧的摄像头探测逻辑** — 删除 `printerHost`/`camUrl`/`probeCam()` 变量和函数，改为 IIFE 直接探测 `/server/files/camera/monitor.jpg`
- **简化摄像头架构** — 不再需要获取打印机 IP 来拼接摄像头 URL，所有请求通过桥接代理转发
- **mDNS 打印机自动发现** — 新增 `/api/bridge/scan` 端点，通过 zeroconf 库扫描 `_snapmaker._tcp.local.` mDNS 服务自动发现局域网内的 Snapmaker 打印机
- **Setup 页面扫描按钮** — IP 输入框旁添加 Scan 按钮，点击后自动扫描并填充打印机 IP；单台自动填充，多台显示列表供选择

### mDNS 发现机制
- U1 的 Moonraker 配置了 `[zeroconf]` 段，`mdns_hostname: U1`
- 服务类型：`_snapmaker._tcp.local.`（Snapmaker 专有，非标准 Moonraker 的 `_moonraker._tcp.local`）
- 服务属性包含：`ip`（IP 地址）、`device_name`、`sn`、`machine_type`、`version` 等
- 扫描使用同步 `zeroconf.Zeroconf` + `ServiceBrowser`，在线程池中运行避免阻塞事件循环
- 默认扫描超时 5 秒，最长 10 秒

### 修改文件
- `bridge/server/main.py` — 新增 `/api/bridge/scan` 端点；setup 页面添加 Scan 按钮和扫描结果展示
- `bridge/server/requirements.txt` — 新增 `zeroconf>=0.100.0`
- `bridge/web/webui.html` — `toggleCam()`/`pollCam()`/`camError()`/`showCamErr()` 改为 snapshot 轮询；删除 `printerHost`/`camUrl`/`probeCam()` 旧逻辑；`camAvail` 通过 IIFE 探测初始化
- `traps.md` #46 — 根因从"mjpegstreamer 未运行"改为"U1 使用 snapshot 轮询方式，非 MJPEG stream"

---

## v4.0 完整发布版

### 核心改进
- **Bridge 完全集成** — 安装到 BambuStudio 目录，兼容包原目录可删除
- **开机自启** — 创建 Windows Startup 快捷方式，登录时 Bridge 自动后台运行
- **配置独立** — `bridge_config.json` 移到 `%APPDATA%\BambuStudio-Bridge\`，避免 Program Files 权限问题
- **模式切换优化** — 两种模式按钮完全统一，添加防重复点击，提升响应速度

### 安装脚本改进
- `install.ps1` — 7 步完整流程，自动启动 Bridge
- `reinstall.ps1` — 9 步完整重装，更新所有文件
- `uninstall.ps1` — 7 步完整清理，包括 APPDATA 配置

### 版本统一
- Bridge: v4.0
- 兼容包: v4.0

---

## v3.22 Bridge 安装到 BambuStudio 目录 + 开机自启（Bridge v0.6.0）

**核心改动**：Bridge 服务器安装到 BambuStudio 安装目录下（`C:\Program Files\Bambu Studio\bridge\`），不再依赖兼容包原始目录。安装后可删除兼容包目录

**配置文件迁移**：`bridge_config.json` 从 bridge/ 目录迁移到 `%APPDATA%\BambuStudio-Bridge\`，避免 Program Files 写入权限问题。首次加载时自动从旧位置迁移配置

**开机自启**：安装脚本创建 VBS 隐藏启动器（`start-hidden.vbs`）+ Windows Startup 文件夹快捷方式，Bridge 在登录时自动后台运行，无需手动启动

**install.ps1 重写**：7 步→7 步（增加 Bridge 安装 + 自启配置 + 自动启动），安装完成后 Bridge 立即可用

**uninstall.ps1 重写**：6 步→6 步（增加 Bridge 停止 + 目录删除 + 自启快捷方式清理）

**reinstall.ps1 重写**：7 步→9 步（增加 Bridge 停止 + 重装 + 自启更新 + 自动启动）

---

## v3.21 修复（Bridge v0.5.1 — WebUI 去 zoom + 按钮统一 + 热床居中）

**WebUI 去 zoom 方案**：移除 `body{zoom:1.4}`，所有 CSS 尺寸直接按 ~1.4x 放大（根字体 13px→18px，sidebar 56px→76px，topbar 40px→56px，按钮 font-size 10px→14px 等）。新增 `.tbtn` CSS 类统一管理 Light/Fan/Speed 按钮样式，清除所有冗余内联 `font-size`。修复 "Loading files..." 文字过小（11px→15px）

**Fluidd wrapper 按钮统一**：模式切换按钮从 `padding:3px 10px; font-size:10px` 改为 `padding:5px 14px; font-size:14px`，与 WebUI 模式完全一致。设备名从 14px 改为 20px

**热床 STL 居中**：`Snapmaker U1_bed_texture.stl` 从左下角原点（X: -2.5~273.5, Y: -10.5~282.5）居中为以中心为原点（X: -138~138, Y: -146.5~146.5）。原因：BambuStudio 的 `update_model_offset()` 将 STL 的 (0,0,0) 移到 `printable_area` 中心 (135,135)，如果 STL 以左下角为原点，偏移后热床会偏到右上角（traps.md #41）

---

## v3.20 修复（WebUI 缩放 + BambuStudio 集成准备）

**WebUI 缩放**：添加 `body { zoom: 1.4 }` 使界面在 100% 浏览器缩放下即可舒适使用（之前需要 150%）

**BambuStudio 集成关键配置**：在 `Snapmaker U1 (0.4 nozzle).json` 中添加 `"print_host_webui": "http://127.0.0.1:13628"`，使 BambuStudio 的 Device 标签页自动加载桥接服务器 WebUI

**setup.bat 修复**：重写 `python312._pth` 配置逻辑（直接 `Set-Content` 而非 `-replace`），添加 `python312.zip` 解压到 `Lib/` 的步骤

**reinstall.ps1 更新**：Next steps 增加 Bridge 启动步骤和 Device 标签页使用说明

---

## v3.19 修复（Bridge v0.5.0 — Light/Camera/Filament 三项修复）

**Light 修复**：`SET_LED` 命令增加 `WHITE=1` 参数。U1 的 `cavity_led` 有 4 通道 `[RED, GREEN, BLUE, WHITE]`，缺少 WHITE 通道灯不亮（traps.md #38）

**Camera 修复**：MJPEG 视频流改为直接指向打印机 IP，绕过桥接代理。通过 `/api/bridge/config` 获取 `printer_host`，摄像头 URL 从 `http://localhost:13628/webcam/` 改为 `http://{printer_ip}/webcam/`（traps.md #39）

**Filament 修复**：耗材类型和颜色信息从 `snapmaker/print_task.json` 获取（`filament_type`、`filament_color_rgba`、`filament_sub_type`），而非 `filament_feed` 对象（该对象只有物理状态，无材料类型）。新增 `loadFilamentInfo()` 函数（traps.md #40）

**关键发现**：U1 的耗材数据架构
- `filament_feed left/right`：物理传感器状态（`filament_detected`、`channel_state`）
- `snapmaker/print_task.json`：耗材配置信息（类型/颜色/厂商/SKU）
- `filament_parameters`：材料参数库（流量/温度参数，按材料类型→厂商→子类型组织）

---

## v3.18 新增（Bridge 服务器 Python 环境重建 + U1 Moonraker 源码分析）

**Python 环境重建**：旧 `bambustudio-bridge` 目录已删除，在新位置 `BambuStudio-SnapmakerU1-Compat/bridge/python/` 重新安装嵌入式 Python 3.12.9 环境：
- 下载 python-3.12.9-embed-amd64.zip 并解压
- 修复 `python312._pth`（4 行：`.`、`Lib`、`Lib\site-packages`、`import site`）
- 解压 `python312.zip` 到 `Lib/` 目录
- 通过 Python urllib 下载 `get-pip.py` 并安装 pip 26.1.1
- 通过阿里云镜像安装所有依赖（fastapi 0.136.1、uvicorn 0.47.0、httpx 0.28.1、websockets 16.0、pystray 0.19.5、Pillow 12.2.0 等）

**U1 Moonraker 源码分析**（`u1-moonraker-main`）：
- `lava/moonraker.conf`：无 `[webcam]` 段，确认摄像头需通过 octoprint_compat 默认配置（`stream_url = /webcam/?action=stream`）或数据库配置
- `snapmakercloud.py`：Snapmaker 专有云打印组件，支持 3MF/Gcode/ZIP 文件下载和远程打印，通过 MQTT 与设备通信
- `octoprint_compat.py`：默认摄像头配置 `streamUrl: '/webcam/?action=stream'`，`webcamEnabled: true`
- `webcam.py`：支持从配置文件和数据库两种来源加载摄像头，部分 URL 自动转换为本地地址
- `authorization`：U1 默认信任 `192.0.0.0/8`（覆盖所有 192.x.x.x 地址）

**清理**：
- 删除临时文件 `bridge/do-setup.ps1` 和 `bridge/python/get-pip.py`
- 旧 `bambustudio-bridge` 目录已完全删除

**验证**：桥接服务器 v0.4.0 成功启动在 `http://127.0.0.1:13628`，WebUI 模式正常加载，API 代理正常工作（G-code 文件列表、缩略图、WebSocket 订阅等）

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

### U1 网页控制方案（v3.15 新增）

BambuStudio 原生支持在 Device 标签中嵌入 WebView 显示非 BBL 打印机的 Web 控制面板。U1 内置 Moonraker 服务，可以在 BambuStudio 中加载 Fluidd 控制面板。

**Snapmaker Orca 的设备页面架构**：

Snapmaker 官方安装版 OrcaSlicer 的设备页面 URL 是 `http://127.0.0.1:13619/web/flutter_web/index.html`，这是一个**本地 HTTP 服务器 + Flutter Web 应用**的方案，**不是 Fluidd/Mainsail**。这个 Flutter Web 应用是 Snapmaker 的闭源定制功能，在开源的 OrcaSlicer 仓库中不存在（已确认源码中无 `flutter_web`、`13619`、`DeviceWeb` 等关键字）。

**Snapmaker 开源了 U1 的 Fluidd 定制版**：https://github.com/Snapmaker/u1-fluidd
- 这是 Fluidd 的 fork，基于 Vue.js + TypeScript（GPL-3.0 协议）
- Snapmaker 只有 1 个自己的 commit（"Release firmware version 1.2.0"），其余 2734 个 commit 都是上游 Fluidd 的
- 定制内容极少，主要是固件版本发布相关的配置
- U1 内置的 Fluidd 就是这个 fork 的编译产物

**BambuStudio 的设备页面架构**：

BambuStudio 的方案更简单——直接加载打印机的 Web 前端：
1. 选择非 BBL 打印机后，`show_device(false)` 将 Device 标签切换为 `PrinterWebView`（嵌入式浏览器）
2. `Plater.cpp:3370-3385` 读取 `print_host_webui`（或 `print_host`）URL，调用 `load_printer_url(url)`
3. `EVT_LOAD_PRINTER_URL` 事件触发 `m_printer_view->load_url(url)` → WebView 加载 `http://<U1-IP>`
4. U1 的 Moonraker 内置 Fluidd 前端在 WebView 中渲染

**API Key 认证问题与解决方案**：

BambuStudio 原始代码**不会自动注入 API Key**（Snapmaker Orca 有 `SendAPIKey()` 方法自动注入 `X-API-Key` 请求头，BambuStudio 没有）。解决方案是通过 Moonraker 配置信任局域网请求：

```ini
# moonraker.conf
[authorization]
trusted_clients:
    192.168.0.0/16
    127.0.0.0/8
cors_domains:
    *.local
    *://localhost
```

配置后，来自局域网的请求无需 API Key 即可操作 Fluidd。

**BambuStudio vs Snapmaker Orca PrinterWebView 对比**：

| 功能 | Snapmaker Orca | BambuStudio 原始 | 影响 |
|------|---------------|-----------------|------|
| 设备页面 | 闭源 Flutter Web（本地服务器） | 直接加载打印机 Fluidd | 体验不同 |
| WebView 加载 URL | ✅ | ✅ | 无 |
| API Key 自动注入 | ✅ `SendAPIKey()` | ❌ | 需配置 Moonraker trusted_clients |
| OnLoaded 事件绑定 | ✅ | ❌ | 页面加载后无处理 |
| OnNewWindow 拦截 | ✅ 外部链接用系统浏览器 | ❌ | 外部链接在 WebView 内打开 |
| Linux WebKitGTK 兼容 | ✅ `inject_vue_resize_workaround()` | ❌ | Linux 上 Fluidd 可能崩溃 |
| 文件上传 IPC | ✅ `PrinterWebViewHandler` | ❌ | 无法从 WebView 内触发切片器上传 |
| 摄像头监控 | ✅ Flutter Web 内置 | ✅ Fluidd 内置 | 都支持 |

**纯配置方案（不改源码）**：
1. 在 U1 的 `moonraker.conf` 中添加 `[authorization]` 段，信任局域网
2. 在 BambuStudio 物理打印机设置中填写 U1 的 IP 地址
3. 切换到 Device 标签 → 自动加载 Fluidd 控制面板（含摄像头监控）

**源码修改方案（完整体验）**：
如需 Snapmaker Orca 级别的原生体验，需修改 BambuStudio 源码：
1. `PrinterWebView.hpp/cpp`：添加 `SendAPIKey()`、`OnLoaded`/`OnNewWindow` 事件、Linux 兼容
2. `MainFrame.cpp`：修改 `load_printer_url` 调用链传递 API Key
3. `Plater.cpp`：修改 `load_printer_url` 调用传递 API Key
4. 需要重新编译 BambuStudio

**无法复刻 Flutter Web 方案的原因**：
Snapmaker 的 Flutter Web 应用是闭源的商业软件，源码不在开源 OrcaSlicer 仓库中。该应用通过本地 HTTP 服务器（端口 13619）提供，内嵌在安装版 OrcaSlicer 中，与 U1 通过 Moonraker API 通信。BambuStudio 兼容包无法包含此闭源组件。

### 开源桥接插件方案（v3.16 新增）

**核心思路**：不改 BambuStudio 源码，通过本地 HTTP 服务器提供增强的设备控制体验。

**原理**：BambuStudio 的 `print_host_webui` 配置字段支持指向任意 URL，包括 localhost。将 `print_host_webui` 设为 `http://localhost:PORT`，本地桥接服务器提供定制版 Fluidd 前端 + API Key 自动注入 + WebSocket 代理。

**架构**：
```
BambuStudio (PrinterWebView)
  → http://localhost:PORT/?host=<打印机IP>&apikey=<API Key>
  → 开源桥接服务器
    → 提供定制 Fluidd 前端（基于 Snapmaker/u1-fluidd）
    → 代理 Moonraker HTTP API（自动注入 API Key）
    → 代理 WebSocket（实时状态推送）
    → 代理摄像头流（MJPEG/HLS）
  → U1 / 任何 Klipper 打印机（Moonraker）
```

**可行性依据**：
1. BambuStudio 已支持 `print_host_webui`，无需改源码
2. Snapmaker 闭源 Flutter Web 就是这个架构（`127.0.0.1:13619`）
3. BambuStudio 自己的耗材管理器也是这个架构（`localhost:13628`，见 `DeviceWebPage`）
4. Snapmaker 开源了 U1 的 Fluidd 定制版：https://github.com/Snapmaker/u1-fluidd

**BambuStudio 插件机制分析**：
- BambuStudio 的网络插件（`bambu_network_plugin.dll`）通过 `LoadLibrary`/`dlopen` 动态加载
- 加载时有 `IsSamePublisher` 代码签名验证，无法注入自定义 DLL
- 但 `print_host_webui` 是纯配置方案，不涉及插件加载，完全可以利用

**功能清单**：

| 功能 | 实现方式 | 优先级 |
|------|---------|--------|
| 提供定制 Fluidd 前端 | 静态文件服务 | P0 |
| API Key 自动注入 | HTTP 代理 + 请求头注入 | P0 |
| WebSocket 代理 | ws 透传 | P0 |
| 摄像头流代理 | MJPEG/HLS 透传 | P0 |
| 自动读取 BambuStudio 配置 | 解析 BambuStudio 配置文件 | P1 |
| 打印机自动发现 | mDNS/SSDP 扫描 | P1 |
| 文件上传桥接 | 接收 G-code → 调 Moonraker API | P2 |
| 多打印机管理 | 前端路由 | P2 |
| 系统托盘 + 自动启动 | 桌面集成 | P2 |

**技术选型**：Python (FastAPI) + 嵌入式 Python 3.12.9 + uvicorn + httpx + websockets

**已实现功能**（bridge/ 目录）：

| 功能 | 实现方式 | 状态 |
|------|---------|------|
| 提供定制 Fluidd 前端 | 静态文件挂载到 /fluidd/ | ✅ |
| API Key 自动注入 | HTTP 代理 + X-API-Key 请求头注入 | ✅ |
| WebSocket 代理 | /websocket 路径透传 | ✅ |
| 摄像头流代理 | /webcam/ 路径透传 | ✅ |
| WebUI 模式 | 单页面 4 模块（Camera/Print Job/Control/Filament） | ✅ |
| Fluidd 模式 | iframe wrapper + hosted 模式 | ✅ |
| 模式切换 | 顶部工具栏 WebUI/Fluidd 按钮 | ✅ |
| 预设安装 | Python installer（install 子命令） | ✅ |
| 嵌入式 Python | 绿色便携 Python 3.12.9 | ✅ |
| 自动读取 BambuStudio 配置 | 解析 BambuStudio 配置文件 | 待实现 |
| 打印机自动发现 | mDNS/SSDP 扫描 | 待实现 |
| 文件上传桥接 | 接收 G-code → 调 Moonraker API | 待实现 |
| 多打印机管理 | 前端路由 | 待实现 |
| 系统托盘 + 自动启动 | 桌面集成 | 待实现 |

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

### v3.17 新增（Bridge 服务器合并入 Compat 仓库）

**架构变更**：将 bambustudio-bridge 项目合并到 BambuStudio-SnapmakerU1-Compat 仓库的 `bridge/` 子目录下，统一项目管理。

**目录结构**：
```
BambuStudio-SnapmakerU1-Compat/
├── Snapmaker/                    # 预设文件（保持原位）
├── Snapmaker.json                # 品牌配置
├── bridge/                       # 桥接服务器
│   ├── server/main.py            # FastAPI 服务器 v0.4.0
│   ├── server/installer.py       # Python 预设安装器
│   ├── server/requirements.txt   # Python 依赖
│   ├── web/webui.html            # WebUI 界面
│   ├── web/dist/                 # Fluidd 前端（.gitignore）
│   ├── python/                   # 嵌入式 Python（.gitignore）
│   ├── start.bat                 # 启动脚本
│   └── setup.bat                 # 首次安装脚本
├── install.bat/ps1               # 预设安装脚本
├── uninstall.bat/ps1
├── process.md
└── traps.md
```

**路径更新**：
- `main.py`：`PRESETS_DIR` 从 `parent.parent / "presets"` 改为 `parent.parent.parent / "Snapmaker"`
- `installer.py`：`PRESETS_DIR` 从 `parent.parent / "presets"` 改为 `parent.parent.parent / "Snapmaker"`
- `CONFIG_FILE` 放在 `bridge/` 目录下

**WebUI v0.4.0 改进**：
- 参考 Snapmaker WebUI 布局重设计：浅色主题 + 2x2 网格（Camera/Print Job/Control/Filament）
- Camera 模块：ON/OFF 开关控制视频流
- Control 模块：4 热端温度 + 热床温度 + 2 风扇功率 + 速度百分比
- Print Job 模块：双标签（当前任务进度 + G-code 文件列表）
- Filament 模块：4 挤出机耗材装载状态 + 材料类型 + 颜色
- 模式切换按钮统一到顶部工具栏右侧（WebUI/Fluidd 位置一致）

### v3.15 新增（Fluidd 网页控制方案研究）

**需求**：在 BambuStudio 的 Device 标签中嵌入 Fluidd 控制面板，实现类似 OrcaSlicer 的原生体验。

**源码分析结论**：
- BambuStudio 已有 `PrinterWebView`（嵌入式 wxWebView），选择非 BBL 打印机时自动切换 Device 标签为 WebView
- `Plater.cpp:3370-3385` 读取 `print_host_webui`/`print_host` 并调用 `load_printer_url(url)` → WebView 加载该 URL
- `MainFrame.cpp:1438-1463` `show_device(false)` 将 MonitorPanel 替换为 PrinterWebView
- 原始代码**不会自动注入 API Key**，也没有 `OnLoaded`/`OnNewWindow` 事件处理

**OrcaSlicer 对比**：
- OrcaSlicer 的 `PrinterWebView` 有 `SendAPIKey()` 方法，在页面加载后注入 JavaScript 拦截 `window.fetch`，自动添加 `X-API-Key` 请求头
- OrcaSlicer 有 `PrinterWebViewHandler` 工厂模式，为不同品牌打印机创建不同的 IPC Handler（目前只有 Elegoo）
- OrcaSlicer 有 Linux WebKitGTK 的 `inject_vue_resize_workaround()` 修复 Fluidd/Mainsail 崩溃问题
- OrcaSlicer 的 `OnNewWindow` 事件拦截外部链接，用系统浏览器打开

**纯配置方案（不改源码）**：
- 在 U1 的 `moonraker.conf` 中添加 `[authorization]` 段，配置 `trusted_clients: 192.168.0.0/16` 信任局域网
- 这样 Fluidd 在 BambuStudio WebView 中加载时无需 API Key 即可正常操作
- 用户体验：切换到 Device 标签 → 自动显示 Fluidd 控制面板 → 可直接控制温度/速度/打印任务等

**源码修改方案（完整体验，需重编译）**：
- 修改 `PrinterWebView.hpp/cpp`：添加 `SendAPIKey()`、`OnLoaded`/`OnNewWindow` 事件、Linux 兼容
- 修改 `MainFrame.cpp`：`load_printer_url` 调用链传递 API Key
- 修改 `Plater.cpp`：`load_printer_url` 调用传递 API Key

### v3.14 修复（热床 3D 模型和纹理加载）

**问题**：BambuStudio 中 Snapmaker U1 的热床显示为默认矩形形状，而非 U1 的实际热床形状。

**根因**：`Snapmaker U1.json`（machine_model）中 `bed_model` 和 `bed_texture` 字段为空字符串，BambuStudio 无法加载热床 3D 模型和纹理贴图。虽然项目目录下已有 `Snapmaker U1_bed.stl` 和 `Snapmaker U1_texture.svg` 文件，但未在配置中引用。

**源码路径解析逻辑**（Preset.cpp:4003-4012）：
1. 先查找 `data_dir()/vendor/{vendor_id}/{bed_model}`（用户缓存目录）
2. 若不存在，查找 `resources_dir()/profiles/{vendor_id}/{bed_model}`（安装目录）
3. `bed_model` 值为相对于 vendor 根目录的文件名

**参考**：Anker M5 官方配置使用 `"bed_model": "M5-CE-bed.stl"`，文件放在 `profiles/Anker/` 根目录下。

**修复内容**：
- `Snapmaker U1.json`：`bed_model` 从 `""` 改为 `"Snapmaker U1_bed.stl"`
- `Snapmaker U1.json`：`bed_texture` 从 `""` 改为 `"Snapmaker U1_texture.svg"`

### v3.13 新增（Linux 平台支持）

**源码分析结论**：兼容包的所有 JSON 配置文件（Snapmaker.json、80+ 个机器/工艺/耗材文件）100% 跨平台通用，BambuStudio 在所有平台上使用完全相同的逻辑加载 `resources/profiles/` 目录。Linux 和 Windows 的差异仅在路径：

| 项目 | Windows | Linux |
|------|---------|-------|
| 资源目录 | `C:\Program Files\Bambu Studio\resources\profiles\` | `/usr/share/BambuStudio/resources/profiles/`（FHS）或 `<安装目录>/resources/profiles/`（AppImage） |
| 数据目录 | `%APPDATA%\BambuStudioBeta\` | `~/.config/BambuStudioBeta/`（XDG 规范） |
| 系统缓存 | `%APPDATA%\BambuStudioBeta\system\Snapmaker\` | `~/.config/BambuStudioBeta/system/Snapmaker/` |
| 配置文件 | `%APPDATA%\BambuStudioBeta\BambuStudio.conf` | `~/.config/BambuStudioBeta/BambuStudio.conf` |

**源码依据**：
- `GUI_App.cpp:2482-2490`：Linux 使用 `$XDG_CONFIG_HOME/BambuStudioBeta`（默认 `~/.config/BambuStudioBeta`）
- `BambuStudio.cpp:8137-8146`：Linux FHS 安装使用 `SLIC3R_FHS_RESOURCES`（通常 `/usr/share/BambuStudio/resources`），AppImage 使用 `<安装目录>/resources`
- `AppConfig.cpp:1474-1487`：配置文件路径为 `data_dir()/BambuStudio.conf`
- `Preset.hpp:18`：`PRESET_SYSTEM_DIR = "system"`，所有平台一致

**变更内容**：
- README.md 更新：前置条件从"仅 Windows"改为"Windows + Linux"
- README.md 新增：Linux 手动安装步骤（7 步，含缓存清理和 jq 命令）
- README.md 新增：Linux 手动卸载步骤
- README.md 更新：常见问题适配 Linux 路径，新增 Linux 资源目录查找 FAQ
- README.md 更新：注意事项适配双平台

**不提供 Linux 安装脚本的原因**：Linux 发行版和安装方式多样（FHS/AppImage/Flatpak/tarball），路径差异大，用户自行处理更灵活。

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
- [x] v3.13 Linux 平台支持（README 更新手动安装/卸载步骤，源码分析确认配置文件跨平台通用）
- [x] v3.14 热床 3D 模型和纹理加载修复（bed_model/bed_texture 从空字符串改为实际文件名）

### v3.7 审查未修改项（基于 G-code 实际对比）

**H1：standby_temperature_delta 机器/工艺冲突 → 升级为 CRITICAL，见 traps.md #25**
- 状态：未修改（BambuStudio 源码限制，需修改源码才能解决）
- 根因：BambuStudio 自行增加了 `ooze_prevention` 和 `wipe_tower` 互斥检查（PrusaSlicer 原版没有），导致空闲喷头无法降温。WipeTower 代码还会生成 `M104 Tn Sxxx N0` 把空闲喷头重新加热。详见 traps.md #25
- 风险：空闲喷头保持高温，PETG 持续渗出；U1 换头式设计影响可控但不理想

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
