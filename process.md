# Snapmaker U1 BambuStudio 兼容包

## 项目目标
将 Snapmaker U1 3D 打印机配置集成到 BambuStudio 中，实现切片功能 + 原生级设备控制体验

## 当前版本: v5.18.1 (2026-05-30)

---

## 当前状态

### ✅ 核心功能
- 切片配置（1 打印机 + 10 工艺预设 + 80 耗材预设）
- Bridge 代理服务器（HTTP + WebSocket）
- 原生打印确认对话框（耗材映射 + 打印选项）
- WebUI 设备控制面板（摄像头/温度/灯光/风扇/速度/打印控制）
- Fluidd 集成（侧栏一键切换）
- 中英文切换
- About 页面（使用说明 + 版本更新检测）

### ✅ 打印流程（对齐 OrcaSlicer）
1. `SET_PRINT_FILAMENT_CONFIG` — 设置耗材配置（类型/颜色/品牌）
2. `SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=x MAP_EXTRUDER=y` — 设置映射
3. `SET_PRINT_USED_EXTRUDERS EXTRUDERS=0,1` — 标记使用的物理挤出头
4. `SET_PRINT_PREFERENCES BED_LEVEL=1 FLOW_CALIBRATE=1 TIME_LAPSE_CAMERA=1` — 设置打印选项
5. `printer.print.start` — 开始打印

### ✅ 耗材匹配
- 类型优先匹配（extractFilType 提取核心关键词）
- 同类型中 CIEDE2000 颜色相近优先（Lab 色彩空间，对齐 OrcaSlicer）
- 用户可手动选择映射

### ❌ 已知限制
1. **设备面板直接打印 BambuStudio gcode**：闭源触摸屏固件检查 EXECUTABLE_BLOCK，提示"未识别的gcode类型"。只能通过 WebUI 打印。见 traps.md #103
2. **旧 gcode 无层进度**：`layer_change_gcode` 修复只影响新切片的 gcode，旧文件需重新切片。见 traps.md #105

### 📝 下一步
1. 验证 GitHub 版本更新检测
2. 对齐 OrcaSlicer 挤出头取出/放回功能

---

## 版本历史

### v5.18.1 (2026-05-30) — 打印层进度 + 保护用户预设
- 添加 `layer_change_gcode` 生成逐层 `SET_PRINT_STATS_INFO`，WebUI 显示当前层数
- 安装脚本不再删除用户自定义耗材预设，不再重置 `BambuStudio.conf` 预设选择

### v5.18.0 (2026-05-30) — CIEDE2000 颜色匹配 + OrcaSlicer 逆向分析
- 耗材颜色匹配从 RGB 欧几里得距离升级为 CIEDE2000（Lab 色彩空间）
- 逆向分析 OrcaSlicer Flutter Web，确认耗材映射流程已完全对齐
- 记录设备面板 gcode 限制（traps.md #103）

### v5.16.1 (2026-05-27) — 修复耗材映射不生效（严重 bug）
- 改用 OrcaSlicer 分步打印方式，修复 `SDCARD_PRINT_FILE_WITH_PARAMETERS` 的 MAP_TABLE 不更新 `reprint_info` 问题
- 修复 `SET_PRINT_USED_EXTRUDERS` 参数格式（逗号分隔索引列表）
- 添加 `SET_PRINT_FILAMENT_CONFIG` 对齐 OrcaSlicer 格式

### v5.16.0 (2026-05-27) — 外部链接跳转修复
- Bridge 服务端 `open_external` 端点调用系统默认浏览器，解决 WebView 拦截 `window.open`

### v5.15.0 (2026-05-27) — 耗材颜色相近匹配 + GitHub 版本更新检测
- 同类型颜色距离排序匹配、GitHub Releases API 版本对比

### v5.14.0 (2026-05-27) — 耗材匹配核心类型提取 + 自定义下拉框 + About 页面
- extractFilType 关键词匹配、颜色圆点下拉、作者/开源协议

### v5.13.0 (2026-05-27) — 耗材映射算法修复 + 下拉选择器
- 优先分配未占用物理槽位，`<select>` 替代点击循环

### v5.12.1 (2026-05-27) — 打印确认框重新设计
- 3 部分结构：G-code 信息 + 耗材映射 + 打印选项

### v5.12.0 (2026-05-27) — WebUI 全面优化 + 耗材匹配
- 侧栏加宽、灯泡图标、删除 Speed 滑块、打印确认耗材匹配

### v5.11.0 (2026-05-27) — 控制面板 UI 优化 + 设备状态显示
- 风扇/速度滑块控制、灯光按钮高亮、设备状态徽章

### v5.10.1 (2026-05-27) — 修复风扇控制参数范围
- 风扇 speed 参数改为 0-100 百分比，见 traps.md #95

### v5.10.0 (2026-05-27) — 对齐 OrcaSlicer 原生体验
- 控制方式改用 Snapmaker 定制 JSON-RPC 端点、WS 订阅补充、摄像头动态 URL

### v5.9.0 (2026-05-27) — 修复摄像头参数 + 温度轮询
- `camera.start_monitor` 添加 `domain: "lan"` 参数、2 秒定时轮询

### v5.8.3 (2026-05-27) — 修复热床调平参数名
- `task_bed_leveling` → `bed_level`，匹配 Klipper `BED_LEVEL`，见 traps.md #92

### v5.8.1 (2026-05-27) — 修复打印选项布尔值 + 摄像头监控增强
- `true/false` → `1/0`（traps.md #89）、`ensureCamMonitor` await + stale 检测

### v5.8.0 (2026-05-27) — 修复 JSON-RPC 方法名 + 摄像头服务端监控 + 顶栏版本号
- `start_local_print` → `server.files.start_local_print`（traps.md #91）

### v5.7.3 (2026-05-26) — 安装脚本增强 + WebUI 离线检测
### v5.7.2 (2026-05-26) — 修复 mDNS 端口错误
### v5.7.1 (2026-05-25) — 排版优化 + 中文术语修正
### v5.7.0 (2026-05-25) — 中英文切换 + 流量校准 + Speed 5 挡
### v5.5.0 (2026-05-25) — WebUI 全面替换 fetch→JSONP
### v5.4.0 (2026-05-25) — 代理链路完整修复
### v5.2 (2026-05-25) — WebUI + Fluidd 统一界面
### v5.0 (2026-05-24) — Node.js Bridge 重构
### v4.0 (2026-05-24) — 完整发布版
### v3.0 (2026-05-14) — 全品牌耗材库
### v2.0 (2026-05-14) — 局域网直连打印
### v1.0 (2026-05-13) — 初始版本
