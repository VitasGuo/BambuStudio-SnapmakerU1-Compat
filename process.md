# Snapmaker U1 BambuStudio 兼容包

## 项目目标
将 Snapmaker U1 3D 打印机配置集成到 BambuStudio 中，实现切片功能 + 原生级设备控制体验

## 更新日期: 2026-05-27 (v5.16.1)

---

## 当前状态

### ✅ 已修复
1. **IP 显示**：WebUI 顶栏正确显示打印机 IP 和 Bridge 版本号
2. **打印选项 "Method not found"**：修复 JSON-RPC 方法名
3. **打印选项 "unable to parse True"**：修复布尔值问题
4. **挤出流量校准**：已确认可以正确执行
5. **Timelapse**：已确认可以正确启动
6. **热床调平**：v5.8.3 修复参数名 `bed_level`，已验证通过 ✅
7. **摄像头照片不更新**：v5.9.0 修复 `camera.start_monitor` 参数（添加 `domain: "lan"`），已验证通过 ✅
8. **温度不自动更新**：v5.9.0 添加 2 秒定时轮询 + `refreshCtrl()` 实现，已验证通过 ✅
9. **风扇/速度控制功率不对**：v5.10.1 修复风扇 speed 参数范围（0-100 百分比），见 traps.md #95

### ✅ 已实现
1. **v5.11.0 控制面板 UI 优化**：风扇/速度改用滑块控制，灯光按钮高亮当前状态
2. **v5.11.0 设备状态显示**：Print Job 模块显示 `machine_state_manager` 的详细状态（流量校准中、热床调平等）
3. **v5.11.0 风扇控制修复**：main_fan 和 generic_fan 的 speed 参数改为直接传百分比（0-100）
4. **v5.11.1 Speed 控制保留原有档位**：在滑块控制的基础上，保留原有 5 档按钮（50%、80%、100%、120%、150%），两者状态同步
5. **v5.12.0 WebUI 全面优化**：侧栏加宽 + 灯泡图标 + 删除 Speed 滑块 + 删除流量校准/Feed Status + 打印确认耗材匹配
6. **v5.12.1 打印确认框重新设计**：3部分内容（G-code 信息 + 耗材映射 + 打印选项）
7. **v5.13.0 耗材映射算法修复 + 下拉选择器**：修复匹配算法避免重复分配，用下拉选择器替代点击循环
8. **v5.14.0 耗材匹配核心类型提取 + 自定义下拉框 + About 页面增强**：extractFilType 关键词匹配、颜色圆点下拉、作者/开源协议
9. **v5.15.0 耗材颜色相近匹配 + GitHub 版本更新检测 + 仓库 URL 纯文本**：同类型颜色距离排序、GitHub Releases API 版本对比、WebView 外部链接改为纯文本
10. **v5.16.0 外部链接跳转修复**：通过 Bridge 服务端 `open_external` 端点调用系统默认浏览器，解决 WebView 拦截 `window.open` 的问题
11. **v5.16.1 耗材映射修复（严重 bug）**：改用 OrcaSlicer 分步打印方式（SET_PRINT_EXTRUDER_MAP → SET_PRINT_USED_EXTRUDERS → SET_PRINT_PREFERENCES → printer.print.start），修复 `SDCARD_PRINT_FILE_WITH_PARAMETERS` 的 `MAP_TABLE` 不更新 `reprint_info` 导致映射不生效的问题。同时修复 `SET_PRINT_USED_EXTRUDERS` 参数格式（发送逗号分隔索引列表而非数量）

### 📝 下一步计划
1. 验证 GitHub 版本更新检测是否正常工作
2. 继续对齐 OrcaSlicer 功能（挤出头取出/放回等）

---

## v5.16.1 耗材映射修复（严重 bug）

### 问题
用户选择第二个挤出头（黑色PETG），但实际打印时使用了第一个挤出头（橙色PETG）。Fluidd 控制台显示 `extruder -> extruder`，确认 T0 命令未被映射到物理挤出头 1

### 根因
`SDCARD_PRINT_FILE_WITH_PARAMETERS` 调用 `cmd_SET_PRINT_TASK_PARAMETERS`（print_task_config.py L1038），该函数只更新 `extruder_map_table`，**没有同步更新 `reprint_info`**。而 `virtual_sdcard.py` L2107 在处理 T0 命令时读取的是 `reprint_info["extruder_map_table"]`，导致映射不生效

### 修复
改为 OrcaSlicer 的分步打印方式（逆向分析 `main.dart.js` L36935/L131518 确认）：
1. `SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=0 MAP_EXTRUDER=1` — 同时更新 `extruder_map_table` 和 `reprint_info`
2. `SET_PRINT_USED_EXTRUDERS EXTRUDERS=0,1` — 标记使用的物理挤出头索引（逗号分隔列表）
3. `SET_PRINT_PREFERENCES BED_LEVEL=1 FLOW_CALIBRATE=1 TIME_LAPSE_CAMERA=1` — 设置打印选项
4. `printer.print.start` — 开始打印（只传 filename，不带 options）

### 附带修复
- `SET_PRINT_USED_EXTRUDERS` 参数格式：从 `EXTRUDERS=${usedExtruders.length}`（数量）改为 `EXTRUDERS=${usedExtruders.join(',')}`（逗号分隔索引列表），匹配 Klipper `cmd_SET_PRINT_USED_EXTRUDERS` 的解析逻辑（`extruders_str.split(',')`）
- `filament_used_mm` 不可靠：改用 `filament_type` 判断 gcode 槽位是否使用

### 修改文件
- `bridge-node/server.js` — confirm_print 和 start_print 端点改为分步方式 + SET_PRINT_USED_EXTRUDERS 参数修复 + 版本号 5.16.1
- `bridge/web/webui.html` — mapTable 构建逻辑修复（改用 filament_type）+ 版本号 5.16.1
- `bridge-node/package.json` — 版本号 5.16.1
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.16.1
- `README.md` — v5.16.1

---

## v5.16.0 外部链接跳转修复

### 改进
1. **外部链接跳转**：添加 `openExternal(url)` 函数，通过 Bridge 服务端 `/api/bridge/open_external.js` 端点调用系统默认浏览器打开 URL，解决 BambuStudio WebView 拦截 `window.open` 的问题
2. **About 页面链接恢复**：开源项目链接和仓库 URL 恢复为可点击的 `<a>` 标签，点击后通过 `openExternal()` 在外部浏览器打开
3. **版本更新提示可点击**：检测到新版本时，"请访问仓库下载更新"变为可点击链接，直接跳转 GitHub Releases 页面
4. **Fluidd 打开修复**：`openFluidd()` 也改用 `openExternal()` 确保在 WebView 中正常工作

### 技术实现
- server.js 新增 `/api/bridge/open_external.js` JSONP 端点：验证 URL 格式（必须 http/https），使用 `child_process.exec` 调用系统命令打开（Windows: `start ""`，macOS: `open`，Linux: `xdg-open`）
- webui.html 新增 `openExternal(url)` 函数：先尝试 `window.open()`（普通浏览器可用），再通过 JSONP 调用 Bridge 端点（WebView 可用）
- 安全限制：只允许 `http://` 或 `https://` 开头的 URL

### 修改文件
- `bridge-node/server.js` — 新增 `open_external.js` 端点 + 版本号 5.16.0
- `bridge/web/webui.html` — `openExternal()` 函数 + About 页面链接 + 版本更新提示 + `openFluidd()` 修复
- `bridge-node/package.json` — 版本号 5.16.0
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.16.0
- `README.md` — v5.16.0

---

## v5.15.0 耗材颜色相近匹配 + GitHub 版本更新检测 + 仓库 URL 纯文本

### 改进
1. **耗材匹配颜色相近优先**：同类型多个物理槽位时，按 RGB 欧几里得距离排序，颜色最相近的优先匹配
2. **GitHub 版本更新检测**：About 页面自动检测 GitHub Releases 最新版本，与本地版本对比，有更新时显示提示
3. **仓库 URL 改为纯文本**：WebView 无法通过 `window.open` 跳转外部链接，改为纯文本 `user-select:all` 供用户复制

### 技术实现
- `hexToRgb()` / `colorDist()` 函数：RGB 欧几里得距离计算
- 匹配算法 candidates 排序：未分配优先 + 颜色距离升序
- server.js 新增 `/api/bridge/check_update.js` JSONP 端点：调用 GitHub Releases API
- `cmpVer(a,b)` 版本号比较函数 + `checkUpdate()` 5 分钟节流检测
- About 页面仓库 URL 改为 `<div user-select:all>` 纯文本

### 修改文件
- `bridge/web/webui.html` — 颜色匹配 + 版本检测 + 仓库 URL 纯文本
- `bridge-node/server.js` — `check_update.js` 端点 + 版本号 5.15.0

### 改进
1. **耗材匹配核心类型提取**：`extractFilType()` 函数从类型字符串中提取核心关键词（如 "Snapmaker PETG" → "PETG"，"Generic PETG HF" → "PETG"），解决品牌前缀导致 `===` 匹配失败的问题
2. **匹配条件放宽**：不再检查 `gFilUsed[i] > 0`，只要 gcode 槽位有类型就尝试匹配
3. **自定义下拉框**：用带颜色圆点的自定义下拉组件替代原生 `<select>`，每个选项显示颜色圆点+类型名+子类型+匹配标记
4. **About 页面 GitHub 链接修复**：改用 `onclick="event.preventDefault();window.open(this.href,'_blank')"` 绕过 WebView 拦截
5. **About 页面添加作者和开源协议**：显示作者 Vitas Guo，列出 AGPL-3.0 协议和引用的开源项目（OrcaSlicer、BambuStudio、Moonraker、Klipper）

### 技术实现
- `FILAMENT_TYPES` 数组 + `extractFilType()` 函数定义在全局作用域（`filamentMap` 旁边），`showPrintDialog` 和 `refreshMapStatus` 共用
- 自定义下拉组件 CSS：`.map-dropdown`、`.map-dropdown-current`、`.map-dropdown-list`、`.map-dropdown-item`
- `toggleDropdown(idx)` / `selectDropdown(idx,val)` 函数 + 全局 `document.addEventListener('click')` 关闭下拉
- `unused` 判断改为 `!used && !gType`（只有既未使用又无类型才显示灰色占位）

### 修改文件
- `bridge/web/webui.html` — 匹配算法 + 下拉组件 + CSS + About 页面 + i18n

---

## v5.13.0 耗材映射算法修复 + 下拉选择器

### 改进
1. **匹配算法修复**：优先分配未被占用的物理槽位，避免多个 gcode 槽位默认映射到同一个物理槽位
2. **下拉选择器**：每个 gcode 槽位用 `<select>` 下拉框替代点击循环，用户可清楚看到所有物理槽位的类型和子类型
3. **实时状态更新**：切换下拉选项后，✓/⚠ 图标和边框颜色实时更新

### 匹配算法
- 第一轮：对每个使用的 gcode 槽位，找**未被占用**的同类型物理槽位
- 第二轮：如果第一轮没找到（所有同类型槽位已被占用），退而找第一个同类型槽位
- 用 `assigned` 字典跟踪已分配的物理槽位

### UI 改进
- `<select>` 下拉框显示：`槽位 1: PETG (HF)`、`槽位 4: TPU (95A) [无耗材]`
- `refreshMapStatus()` 函数在下拉改变后更新状态图标和行边框颜色
- 删除 `cycleFilamentMap()` 函数

### 修改文件
- `bridge/web/webui.html` — 匹配算法 + 下拉选择器 + CSS
- `bridge-node/server.js` — 版本号 5.13.0
- `bridge-node/package.json` — 版本号 5.13.0
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.13.0
- `README.md` — v5.13.0

---

## v5.12.1 打印确认框重新设计

### 改进
重新设计打印确认框为3部分结构，对齐 OrcaSlicer 原生体验：

1. **G-code 信息区**：显示文件名、预估用时、预估用料（带图标）
2. **耗材映射区**：可视化 gcode 槽位→物理槽位的映射关系
   - 默认按 filament_type 自动匹配
   - 同类型不同颜色的物理槽位可点击切换
   - 绿色 ✓ 匹配 / 黄色 ⚠ 不匹配 / 灰色未使用
   - 显示耗材颜色圆点、类型、重量、子类型
3. **打印选项区**：Auto Bed Leveling / Flow Calibration / Timelapse（与之前一致）

### 技术实现
- `showPrintDialog` 重写，新增 `meta` 参数接收 gcode metadata
- 从 metadata 提取 `estimated_time`、`filament_weight_total`、`filament_weight`
- 耗材映射行使用 `.modal-map-row` 新样式，左侧 gcode→右侧物理槽位
- `cycleFilamentMap(idx)` 循环切换同类型物理槽位
- 新增 CSS：`.modal-meta`、`.modal-map-row`、`.modal-map-arrow`、`.modal-map-dot` 等
- 新增 i18n：`gcode_info`、`estimated_time`、`estimated_weight`、`filament_mapping`、`click_to_change`

### 修改文件
- `bridge/web/webui.html` — 确认框重写 + CSS + i18n
- `bridge-node/server.js` — 版本号 5.12.1
- `bridge-node/package.json` — 版本号 5.12.1
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.12.1
- `README.md` — v5.12.1

---

## v5.12.0 WebUI 全面优化 + 打印确认耗材匹配

### 改进
1. **侧栏加宽**：sidebar 76→88px，logo 44→48px，nav-item 54→62px，svg 28→30px，media query 66→76px
2. **灯光图标更换**：太阳图标→灯泡图标，更直观
3. **删除 Speed 滑块**：保留 5 档按钮，移除冗余的连续滑块（档位按钮更实用）
4. **删除 Filament 流量校准按钮和 Feed Status**：简化 Filament 模块，移除不常用的流量校准按钮和进料检测区域
5. **打印确认耗材匹配**：最关键改进
   - 打印确认框自动获取 gcode 元数据（filament_type、filament_used_mm、filament_colour）
   - 自动匹配 gcode 耗材类型与设备物理槽位
   - 匹配成功显示绿色 ✓，不匹配显示黄色 ⚠
   - 用户可点击循环切换映射
   - 构建 `extruder_map_table`（格式 `[[logical,physical],...]`）传给 `start_local_print`

### 技术实现
- `onPendingPrint`/`printFile`：先获取 gcode metadata，再显示确认框
- `showPrintDialog(name, task, meta)`：新增 `meta` 参数，解析 `filament_type`（可能是分号分隔字符串或数组）、`filament_used_mm`、`filament_colour`
- 自动匹配：`filamentMap[i]` = 第 i 个 gcode 槽位对应的物理槽位，按 `filament_type` 大小写不敏感匹配
- `cycleFilamentMap(idx)`：点击循环切换物理槽位映射
- `doPrint()`：构建 `mapTable = [[logical,physical],...]`，仅包含 `filament_used_mm > 0` 的槽位
- `bridgePOST` 传递 `extruder_map_table: JSON.stringify(mapTable)`
- server.js 两个端点（confirm_print、start_print）解析 `extruder_map_table` 参数并传入 options

### 修改文件
- `bridge/web/webui.html` — 5 项 UI 改动
- `bridge-node/server.js` — 支持 extruder_map_table 参数

---

## v5.11.1 Speed 控制保留原有档位

### 改进
1. **保留原有 5 档 Speed 按钮**：在滑块控制的基础上，保留用户熟悉的 5 档按钮（50%、80%、100%、120%、150%）
2. **双向状态同步**：
   - 点击档位按钮时，同步更新滑块位置和当前值显示
   - 拖动滑块时，档位按钮的高亮状态会根据当前值自动更新
3. **用户体验优化**：既有熟悉的档位按钮快速选择，又有滑块的连续调节能力

### 技术实现
- `setSpeed()` 函数同时更新按钮高亮和滑块位置
- `onSpeedSlider()` 函数在滑块拖动时清除按钮高亮状态
- HTML 结构中按钮添加 `data-speed` 属性便于状态管理

### 修改文件
- `bridge/web/webui.html` — 添加档位按钮 + 同步逻辑
- `bridge-node/server.js` — 版本号 5.11.1
- `bridge-node/package.json` — 版本号 5.11.1
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.11.1
- `README.md` — v5.11.1

---

## v5.11.0 控制面板 UI 优化 + 设备状态显示

### 新增功能
1. **风扇/速度滑块控制**：Model Fan、Cavity Fan 改用 `<input type="range">` 滑块，支持 0-100% 连续调节；Speed 改用 10-200% 滑块。滑块拖动时 150ms 防抖后发送 RPC 命令
2. **灯光按钮高亮**：On/Off 按钮根据 `led cavity_led.white` 状态高亮当前选中项
3. **设备状态徽章**：Print Job 模块新增状态徽章，根据 `machine_state_manager` 的 `main_state` 和 `action_code` 显示详细状态（如"流量校准中"、"热床调平中"、"回原点"等），带脉冲动画
4. **WS 订阅补充**：添加 `machine_state_manager` 对象订阅
5. **滑块同步**：WS 推送的风扇/速度值自动同步到滑块位置

### 技术实现
- `ACTION_CODE_MAP`：OrcaSlicer `action_code` → i18n key 映射（从 `main.dart.js` L35737-35777 逆向提取）
- `MAIN_STATE_MAP`：OrcaSlicer `main_state` 枚举 → i18n key 映射（从 `main.dart.js` L35706-35721 逆向提取）
- `getDeviceStatus()`：优先使用 `action_code`（更详细），回退到 `main_state`，最后回退到 `print_stats.state`
- 状态徽章 CSS：`.job-status-badge` + `.working/.error/.paused/.complete/.idle` 颜色变体 + `.pulse` 脉冲动画

### 修改文件
- `bridge/web/webui.html` — 滑块控制 + 状态徽章 + i18n + WS 订阅 + JS 逻辑
- `bridge-node/server.js` — 版本号 5.11.0
- `bridge-node/package.json` — 版本号 5.11.0
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.11.0
- `README.md` — v5.11.0

---

## v5.10.1 修复风扇控制参数范围

### 根因分析
v5.10.0 将控制方式从 G-code 改为 Snapmaker 定制 JSON-RPC 端点时，风扇参数范围未正确适配：

1. **main_fan**：`setFan('fan', pct)` 传 `{speed: Math.round(pct*2.55)}`（0-100% → 0-255），但 Klipper `_handle_control_main_fan`（fan.py L146-153）期望 `S` 范围是 0-100（百分比），超过 100 被 clamp。所以 50%→128→clamp 100%，100%→255→clamp 100%，两者效果相同
2. **generic_fan**：`setFan('fan_generic cavity_fan', pct)` 传 `{speed: pct/100}`（0-100% → 0-1），但 Moonraker `klippy_apis.py` L233 用 `get_int('speed', 0)` 取整，1.0→1。Klipper `_handle_control_generic_fan`（fan_generic.py L25-30）做 `1/100=0.01`，所以 100% 只显示 1%

### 修复
`setFan` 函数两个分支都改为直接传 `pct`（0-100 整数百分比），匹配 Klipper 端 `S` 参数的 0-100 范围

### 修改文件
- `bridge/web/webui.html` — `setFan()` 参数修复
- `bridge-node/server.js` — 版本号 5.10.1
- `bridge-node/package.json` — 版本号 5.10.1
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.10.1
- `README.md` — v5.10.1

---

## v5.10.0 对齐 OrcaSlicer 原生体验

### 根因分析
通过逆向分析 OrcaSlicer Flutter Web (`main.dart.js`)，发现以下差异：

1. **控制方式**：OrcaSlicer 使用 Snapmaker 定制的 JSON-RPC 端点（`printer.control.led/bed_temp/extruder_temp/print_speed/main_fan/generic_fan`），我们用 G-code 命令。定制端点更原生，通过 WS/MQTT 通道直达 Klipper
2. **WS 订阅**：OrcaSlicer 额外订阅了 `virtual_sdcard`（打印进度/文件位置）、`motion_report`（实时位置/速度）、`idle_timeout`
3. **摄像头动态 URL**：`camera.start_monitor` 返回的 `result` 包含 `url` 字段，OrcaSlicer 在局域网模式下使用 `http://{ip}/server{url}` 直接访问

### 修改文件
- `bridge/web/webui.html` — 控制方式改用 `rpcCall()` + WS JSON-RPC；WS 订阅补充 `virtual_sdcard/motion_report/idle_timeout`；摄像头动态 URL
- `bridge-node/server.js` — `cam_start_monitor.js` 端点返回动态 URL；版本号 5.10.0

---

## v5.9.0 修复摄像头参数 + 温度轮询

### 根因分析
通过逆向分析 OrcaSlicer Flutter Web (`main.dart.js`) 发现：

1. **摄像头参数缺失**：OrcaSlicer 调用 `camera.start_monitor` 时传 `{ domain: "lan", interval: 0, expect_pw: true }`，而我们只传了 `{ req_id: reqId }`。缺少 `domain` 参数可能导致设备端不响应
2. **温度不更新**：`refreshCtrl()` 是空函数；WS `notify_status_update` 在 BambuStudio WebView 环境中可能被限制。添加 2 秒定时轮询作为后备

### 关键发现（OrcaSlicer Flutter 逆向）
- `camera.start_monitor` 参数：`{ domain: "lan"|"wan", interval: 0, expect_pw: true, clientid: "..." }`
- `camera.start_monitor` 响应：`{ state: "success", url: "...", salt: "...", iterations: ..., pw: "...", url_type: "..." }`
- 打印选项参数名确认：`bed_level`、`flow_calibrate`、`time_lapse_camera`（与 v5.8.3 一致）
- OrcaSlicer 也使用 `printer.objects.subscribe` + `notify_status_update` 获取温度

### 修改文件
- `bridge-node/server.js` — `camera.start_monitor` 参数修复 + 版本号 5.9.0
- `bridge/web/webui.html` — 添加 `queryStatus()` + 2 秒定时轮询 + `refreshCtrl()` 实现

---

## v5.8.3 修复热床调平参数名（第二次）

### 根因分析
v5.8.2 将 `auto_bed_leveling` 改为 `task_bed_leveling`，但用户测试后仍然报 `print_task_config configuration does not do auto-leveling`。

从 Snapmaker u1-klipper 开源仓库的 `print_task_config.py` 源码确认：
- L965: `bed_level = gcmd.get_int('BED_LEVEL', None, minval=0, maxval=1)` — G-code 参数名是 `BED_LEVEL`
- L966: `flow_calibrate = gcmd.get_int('FLOW_CALIBRATE', None, minval=0, maxval=1)` — 已正确
- L969: `time_lapse_camera = gcmd.get_int('TIME_LAPSE_CAMERA', None, minval=0, maxval=1)` — 已正确

`klippy_apis.py` L333-335 的 `start_print_advanced` 会将 options 字典的 key 转 `.upper()` 后用双引号包裹值拼成 G-code 参数：
- `bed_level: 1` → `BED_LEVEL="1"` → Klipper `get_int('BED_LEVEL')` 正确解析

### 修复
`task_bed_leveling` → `bed_level`（匹配 `print_task_config.py` L965 的 G-code 参数名 `BED_LEVEL`）

### 修改文件
- `bridge-node/server.js` — `confirm_print.js` 和 `start_print.js` 两个端点
- `bridge-node/package.json` — 版本号 5.8.3
- `install.ps1` / `reinstall.ps1` / `uninstall.ps1` — v5.8.3
- `README.md` — v5.8.3

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