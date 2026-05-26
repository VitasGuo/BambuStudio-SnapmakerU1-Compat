# Snapmaker U1 BambuStudio 兼容包

## 项目目标
将 Snapmaker U1 3D 打印机配置集成到 BambuStudio 中，实现切片功能 + 原生级设备控制体验

## 更新日期: 2026-05-27 (v5.8.1)

---

## 当前状态

### ✅ 已修复
1. **IP 显示**：WebUI 顶栏正确显示打印机 IP 和 Bridge 版本号
2. **打印选项 "Method not found"**：修复 JSON-RPC 方法名，`"start_local_print"` → `"server.files.start_local_print"`
3. **打印选项 "unable to parse True"**：修复布尔值问题，`true/false` → `1/0`
4. **挤出流量校准**：已确认可以正确执行（从 Fluidd 日志验证）
5. **Timelapse**：已确认可以正确启动（从 Fluidd 日志验证）

### ⚠️ 待解决
1. **热床调平不生效**：虽然 `AUTO_BED_LEVELING="1"` 参数已正确传递，但设备输出 `print_task_config configuration does not do auto-leveling`。可能原因：
   - 参数名不正确（可能需要 `TASK_BED_LEVELING` 或其他名称）
   - 设备端固件宏定义问题
   - 需要进一步研究 OrcaSlicer 的参数映射

2. **摄像头照片不更新**：`camera.start_monitor` 已改为服务端调用，但图片仍不刷新。可能原因：
   - 设备端摄像头服务未启动（需要 Snapmaker App/OrcaSlicer 先打开摄像头）
   - `monitor.jpg` 文件未被设备端更新
   - 需要添加更多调试日志

### 📝 下一步计划
1. 研究 OrcaSlicer 的 `PrintParams` 到 MQTT `options` 的映射关系
2. 添加更详细的摄像头调试日志
3. 尝试不同的参数名组合测试热床调平

---

## v5.8.1 修复打印选项布尔值 + 摄像头监控增强

### Bug 1: 打印选项 "unable to parse True"
**根因**：`confirm_print.js` 和 `start_print.js` 中 `req.query.auto_bed_leveling === "1"` 返回 JavaScript 布尔值 `true`，JSON 序列化后 Moonraker 的 `start_print_advanced` 将其转为 G-code 中的 `"True"` 字符串，Klipper 无法解析。这是 trap #55 的回归
**修复**：`=== "1"` (boolean) → `=== "1" ? 1 : 0` (integer)，确保 JSON 中是数字 `1`/`0`

### Bug 2: 摄像头照片不更新（持续排查）
**增强**：
1. `ensureCamMonitor()` 改为 `await`，首次调用时等待 `camera.start_monitor` 完成后再获取快照
2. 添加 `camMonitorActive` 状态跟踪，避免不必要的重复调用
3. 添加 `camStaleCount` 检测：连续相同大小的响应计数，每 10 次记录 WARN 日志
4. 添加 `X-Bridge-Cam-Stale` 响应头，便于前端调试

### 修改文件
- `bridge-node/server.js` — 布尔值修复 + ensureCamMonitor await + stale 检测 + 版本号
- `bridge-node/package.json` — 版本号
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.8.1

---

## v5.8.0 修复 JSON-RPC 方法名 + 摄像头服务端监控 + 顶栏版本号

### Bug 1: 打印选项 "Method not found"
**根因**：`callMoonrakerJsonRpc("start_local_print", ...)` 方法名错误。Moonraker 端点注册路径是 `/server/files/start_local_print`（snapmakercloud.py L138-141），JSON-RPC 方法名规则是路径去掉前导 `/` 并将 `/` 替换为 `.`，即 `server.files.start_local_print`
**修复**：`confirm_print.js` 和 `start_print.js` 两个端点中 `"start_local_print"` → `"server.files.start_local_print"`

### Bug 2: 摄像头照片不更新
**根因**：`camera.start_monitor` 必须通过 WS/MQTT 发送到设备端才能触发 `monitor.jpg` 更新（repeater.py L75-84, L133-153）。之前 WebUI 通过浏览器 WS 代理发送 `camRpc('camera.start_monitor')`，但该调用可能因 WS 代理链路不稳定而未到达设备
**修复**：
1. 新增 `ensureCamMonitor()` 函数：`cam_snapshot` 端点自动调用 `camera.start_monitor`（30秒节流），通过服务端 `callMoonrakerJsonRpc` 建立独立 WS 连接，不依赖浏览器 WS 代理
2. 新增 `/api/bridge/cam_start_monitor.js` 和 `/api/bridge/cam_stop_monitor.js` JSONP 端点
3. WebUI `toggleCam()` 改用 `camStartMonitor()`/`camStopMonitor()` 替代 `camRpc()`

### 顶栏显示 Bridge 版本号
- 从 `/api/bridge/config.js` 获取 `version` 字段，显示在 IP 旁边
- 版本号来自运行中的 Bridge 进程（`BRIDGE_VERSION` 常量），非硬编码，可验证 Bridge 是否正确重启

### 修改文件
- `bridge-node/server.js` — 方法名修复 + `ensureCamMonitor()` + `cam_start_monitor.js` + `cam_stop_monitor.js` + 版本号
- `bridge/web/webui.html` — `camStartMonitor()`/`camStopMonitor()` 替代 `camRpc()` + 版本号显示
- `bridge-node/package.json` — 版本号
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.8.0