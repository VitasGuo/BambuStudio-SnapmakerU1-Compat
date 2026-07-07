# BambuStudio 第三方打印机适配踩坑记录

> 编号递增，三段式：现象→根因→解决方案。用 `---` 分隔。
> 状态标记：✅ 已解决 / ⚠️ 部分解决 / ❌ 未解决

---

## 索引（按类别）

> 统计：共 150 条 — ✅ 已解决 146 | ⚠️ 部分解决 2（#16/#25）| ❌ 未解决 1（#103 固有限制）

### BambuStudio 配置系统
#1 跨厂商继承不支持 | #2 filament_list 加载顺序 | #3 PowerShell JSON 格式错误 | #4 AppConfig filaments 缓存 | #5 compatible_printers_condition | #6 厂商匹配检查 | #7 删除 models 段 | #8 Copy-Item 嵌套 | #9 user/default 残留 | #10 conf 写入时机 | #11 filament_vendor 缺失 | #20 只看 @U1 不够 | #21 Orca GitHub 过时

### G-code 与打印流程
#12 换色温度不够停机 | #13 auxiliary_fan=0 | #14 enable_pre_heating=0 | #15 preheat delta 符号 | #16 ooze_prevention 与擦料塔互斥 | #22 retract_length_toolchange | #23 Support PLA-PETG 继承错误 | #24 required_nozzle_HRC | #55 G-code 布尔参数格式 | #103 设备面板不识别 BambuStudio gcode | #105 打印层进度不显示 | #116 格式检测误判 OrcaSlicer | #141 EXECUTABLE_BLOCK_END 位置错误

### 耗材参数
#17 跨材料基类参数缺失 | #18 Snapmaker 基础耗材缺覆盖 | #19 filament_type 缺失

### 热床与 3D 显示
#26 bed_model/bed_texture 为空 | #27 SVG 不渲染 | #41 STL 不居中 | #50 热床模型高度

### Bridge 代理与通信
#28 WebView 不注入 API Key | #29 网络插件签名验证 | #30 /moonraker/ 前缀不工作 | #31 /ws 路径错误 | #62 Express 5 {*path} 数组 | #63 /access/token 拦截 | #64 热床温度不显示 | #70 中间件顺序 | #71 只转发 content-type | #72 Fluidd SPA 404 | #73 WS 缺错误处理 | #94 温度不自动更新 | #122 JSONP cb 注入 | #123 open_external 命令注入 | #124 上传临时文件泄漏 | #130 ws.onmessage 无异常保护 | #139 node-fetch timeout 非标准 | #142 setup 页面 mDNS XSS | #143 dialog.js fetch timeout 遗漏 | #144 三处 AI Lab 端点裸 fetch 无超时

### 打印确认流程
#47 print_stats 初始查询缺失 | #48 切片不触发确认 | #49 confirm_print 参数解析 | #51 start_local_print 不支持 HTTP | #52 WebUI 未加载通知丢失 | #53 gcode/script HTTP 不可用 | #54 无安全检测 | #56 print_host 被覆盖 | #57 gcode() 用不存在的 HTTP | #58 用户预设覆盖 print_host | #59 python-multipart 缺失 | #61 弹窗体验 | #89 布尔值回归 | #91 JSON-RPC 方法名错误 | #92 热床调平参数名（BED_LEVEL） | #96 耗材匹配缺失 | #97 bridgePOST 数组参数 | #101 MAP_TABLE 不更新 reprint_info | #102 SET_PRINT_USED_EXTRUDERS 参数格式 | #106 耗材信息被 gcode 覆盖 | #150 弹窗缺格式标识

### 摄像头（重点）
#37 webcams/list 返回空 | #39 MJPEG 流代理不工作 | #46 U1 用 snapshot 轮询 | #65 代理破坏二进制 JPEG | #67 Express ETag 缓存 | #85 camera.start_monitor 必须走 WS | #90 摄像头监控需服务端触发 | #93 摄像头参数缺失（domain）

### WebUI 前端
#34 Flutter Web DOM 不可读 | #38 SET_LED 缺 WHITE | #40 filament_feed 无类型 | #66 WS 竞态条件 | #78 Fluidd SW 拦截 fetch | #79 WebView 阻止 fetch/XHR | #82 event.stopPropagation | #83 gcode() 不返回值 | #84 EXTRUDER vs INDEX | #95 风扇控制参数范围 | #99 耗材类型品牌前缀 | #100 WebView 外部链接拦截 | #104 颜色匹配精度不足 | #129 loadJS script 标签泄漏 | #134 webui.html XSS 文件名/耗材类型未转义 | #145 文件列表双重转义 XSS | #146 转义函数缺单引号

### AI Lab（G-code 优化 + 打印助手）
#125 listGcodeFiles 全量读文件 | #126 add_retract 时机错误 | #127 extractGcodeStats G92 E0 误计 | #128 printQAStream qaStreams 泄漏 | #132 slice_agent.js 1448 行死代码 | #133 server.js 10 个死端点 | #135 ailab.js/gcvt.js XSS | #136 AI 调用重复 + 错误处理不一致 | #137 ailab.js apiKey GET 传递泄露 | #138 printQAStream getReader 不兼容导致空响应 | #140 纯函数提取（测试性） | #149 ailab/gcvt i18n 双语化

### 安装与部署
#32 系统无 Python | #33 Fluidd hosted 模式 | #35 CWD 指向已删目录 | #36 curl 下载失败 | #42 Bridge 依赖原目录 | #43 Program Files 权限 | #44 需手动启动 | #45 VBS 权限 | #60 Python 嵌入式限制 | #68 formidable 构造函数 | #69 bridge/web 未复制 | #74 undici 未声明 | #75 node-fetch 不兼容 undici | #76 undici 不导出 Blob | #77 旧进程未重启 | #80 mDNS 端口错误 | #81 VBS 裸 node 命令 | #121 dialog Linux execFileSync 未导入 | #131 reinstall watchdog 文件锁冲突

### BambuStudio 固有限制
#25 ooze_prevention 与擦料塔互斥（源码限制）

---

#1 ✅
**现象**：Snapmaker vendor 耗材文件 `inherits: "fdm_filament_pla"`（BBL base），加载报 "Can not find inherits"
**根因**：`load_vendor_configs_from_json`（PresetBundle.cpp:4736-4751）的 `config_maps` 只含当前 vendor，跨厂商查找永远失败
**解决方案**：每个 vendor 目录下创建完整 base 配置文件，耗材只继承同 vendor 内的 base

---

#2 ✅
**现象**：`Bambu PLA Basic @U1.json` 排在 `fdm_filament_pla.json` 前面，报 "Can not find inherits: fdm_filament_pla"
**根因**：BambuStudio 按 `filament_list` 数组顺序逐个加载，子文件 inherits 目标未加载则失败
**解决方案**：`filament_list` 按依赖拓扑排序——base 在前，派生在后

---

#3 ✅
**现象**：批量生成耗材 JSON 出现尾部逗号、换行符破坏 JSON、缺少 setting_id
**根因**：PowerShell `ConvertTo-Json` 对换行符处理不当，无法控制尾部逗号
**解决方案**：改用 StringBuilder 手动构建 JSON

---

#4 ✅
**现象**：80 个耗材文件全部正确加载，但只显示 2 个可用耗材
**根因**：`BambuStudio.conf` 的 `filaments` 数组控制可见性。只要缓存中有 1 个兼容耗材，`add_default_materials = false`，不再添加其余
**解决方案**：install 脚本用 JSON 感知方式清理 `filaments` 数组中所有 `@U1` 条目

---

#5 ✅
**现象**：`compatible_printers_condition: "printer_model == 'Snapmaker U1'"` 的耗材全部显示"不支持"
**根因**：PlaceholderParser 对条件表达式求值可能不正确
**解决方案**：改用 `compatible_printers: ["Snapmaker U1 (0.4 nozzle)"]` 列表格式

---

#6 ✅
**现象**：BBL 厂商耗材即使 compatible_printers 包含正确打印机名，仍显示"不支持"
**根因**：`is_compatible_with_printer`（Preset.cpp:731-733）第一行检查 `preset.vendor != active_printer.vendor` 则直接返回 false
**解决方案**：所有 @U1 耗材放在 Snapmaker vendor 目录下

---

#7 ✅
**现象**：install 脚本删除 models 段导致需要两次重启
**根因**：`load_installed_filaments` 只处理 is_visible 的打印机，删除 models → 打印机不可见 → 不添加默认耗材
**解决方案**：保留 models 段中 Snapmaker U1 条目，只清理 filaments 缓存

---

#8 ✅
**现象**：`Copy-Item -Recurse` 向已有目录拷贝时嵌套创建新目录
**根因**：PowerShell `Copy-Item` 在目标目录已存在时将源作为子目录拷入
**解决方案**：拷贝前先 `Remove-Item -Recurse -Force` 删除目标目录

---

#9 ✅
**现象**：卸载后重装仍显示旧 Snapmaker 用户预设副本
**根因**：`%APPDATA%\BambuStudioBeta\user\default` 中的副本不随 system 目录清理
**解决方案**：install/reinstall/uninstall 脚本只清理系统缓存（`system\Snapmaker`），不删除用户目录中的文件，保护用户自定义耗材预设

---

#10 ✅
**现象**：install 脚本修改 BambuStudio.conf 后被覆盖
**根因**：BambuStudio 退出时将当前配置写回 conf，覆盖外部修改
**解决方案**：install/uninstall 脚本开头检查 BambuStudio 进程是否运行，运行则拒绝执行

---

#11 ✅
**现象**：Bambu PPA-CF、Generic PLA 等耗材被归类到 Snapmaker 品牌下
**根因**：`filament_vendor` 缺失时默认使用 vendor 目录名（Snapmaker）
**解决方案**：为所有 @U1 文件添加 `filament_vendor: ["Bambu Lab"]` / `["Generic"]` / `["Snapmaker"]`

---

#12 ✅
**现象**：多色打印时第一次换喷头报"温度不够"直接停止
**根因**：`change_filament_gcode` 为空，BambuStudio 只发 `T{n}` 不等待温度，而 start gcode 把非活跃喷头设为 0°C
**解决方案**：填写 `change_filament_gcode`（M109 等温 + T 切换 + SM_PRINT_PREEXTRUDE_FILAMENT），设置 `standby_temperature_delta: -150`、`filament_preheat_temperature_delta: -50`

---

#13 ✅
**现象**：G-code 中没有 `M106 P2`（辅助风扇）命令
**根因**：`auxiliary_fan: "0"` 禁用了整个辅助风扇系统
**解决方案**：`auxiliary_fan` 从 `"0"` 改为 `"1"`

---

#14 ✅
**现象**：换色前无预热命令
**根因**：`fdm_machine_common.json` 缺少 `enable_pre_heating: "1"`
**解决方案**：添加 `enable_pre_heating: "1"` 激活 PreCoolingInjector

---

#15 ✅
**现象**：`filament_preheat_temperature_delta` 设为 `"-50"` 导致预热温度 = 220-(-50)=270°C
**根因**：PreCoolingInjector 计算 `nozzle_temp - delta`，负值导致过热
**解决方案**：从 `["-50"]` 改为 `["50"]`

---

#16 ⚠️ BambuStudio 固有限制
**现象**：启用 `ooze_prevention` 后报"当启用擦料塔时 目前不支持防滴功能"
**根因**：BambuStudio `Print.cpp:1416-1417` 硬性禁止两者同时启用（PrusaSlicer 原版允许）
**解决方案**：不设置 `ooze_prevention`，接受空闲喷头保持高温。WipeTower 会重新加热空闲喷头（`M104 Tn Sxxx N0`），`standby_temperature_delta` 在 `ooze_prevention=0` 时不生效

---

#17 ✅
**现象**：PPA-CF 继承 `fdm_filament_abs`（240°C），实际需要 290°C
**根因**：项目无 `fdm_filament_ppa` 基类
**解决方案**：在具体 @U1 文件中显式覆盖所有与基类不同的参数

---

#18 ✅
**现象**：4 个 Snapmaker "plain" 耗材缺少 PA 参数和热床温度覆盖
**根因**：v2.0 最小化配置只设了 flow_ratio 和 max_volumetric_speed
**解决方案**：补全 `enable_pressure_advance`、`pressure_advance`、热床温度

---

#19 ✅
**现象**：Generic PE/PP/PCTG 显示为 PETG 类型
**根因**：继承基类未覆盖 `filament_type`
**解决方案**：显式设置正确的 `filament_type`

---

#20 ✅
**现象**：对比 @U1 文件参数认为一致，但实际 G-code 差异巨大
**根因**：@U1 文件只含覆盖值，大量参数从基类继承
**解决方案**：解析完整继承链后对比有效参数值

---

#21 ✅
**现象**：Orca GitHub 仓库参数与官方安装版差异巨大
**根因**：GitHub 仓库可能不是最新版本
**解决方案**：以官方安装版参数为准

---

#22 ✅
**现象**：换色时严重漏料
**根因**：`retract_length_toolchange` 设为 2mm，U1 官方值为 10mm
**解决方案**：从 2 改为 10

---

#23 ✅
**现象**：Bambu Support For PLA-PETG @U1 热床 80°C、PA 0.04
**根因**：继承了 `fdm_filament_pet`，应继承 `fdm_filament_pla`
**解决方案**：`inherits` 从 `fdm_filament_pet` 改为 `fdm_filament_pla`

---

#24 ✅
**现象**：CF/GF 材料显示"需要 HRC 55 以上喷嘴"
**根因**：`required_nozzle_HRC: ["55"]` 是 BBL 钢喷嘴标准，U1 喷嘴 HRC 40 即可
**解决方案**：U1 兼容包中 CF/GF 材料从 55 改为 40

---

#25 ⚠️ 同 #16（ooze_prevention 与擦料塔互斥）

---

#26 ✅
**现象**：热床显示默认矩形形状
**根因**：`Snapmaker U1.json` 中 `bed_model: ""` 和 `bed_texture: ""` 为空
**解决方案**：填入 `"bed_model": "Snapmaker U1_bed_texture.stl"` 和 `"bed_texture": "Snapmaker U1_texture.svg"`

---

#27 ✅
**现象**：配置了 `bed_texture` 指向 SVG 后热床仍不显示 logo
**根因**：BambuStudio `3DBed.cpp` 中 `render_texture()` 整体被注释掉，SVG 纹理加载和渲染代码全部禁用
**解决方案**：将 logo 以 3D 浮雕几何体嵌入 `Snapmaker U1_bed_texture.stl`。如需彩色需改源码恢复 `render_texture`

---

#28 ✅
**现象**：Fluidd 显示"未授权"
**根因**：BambuStudio `PrinterWebView` 不自动注入 API Key
**解决方案**：桥接服务器 HTTP 代理自动注入 `X-API-Key` 请求头

---

#29 ✅
**现象**：无法注入自定义 DLL 插件
**根因**：`NetworkAgent.cpp:212-213` 使用 `IsSamePublisher()` 检查数字签名
**解决方案**：不使用 DLL 插件，改用 `print_host_webui` 配置字段

---

#30 ✅
**现象**：Fluidd 无法工作
**根因**：`/moonraker/{path}` 前缀代理，Fluidd 请求路径不含前缀
**解决方案**：v0.2.0 重构为直接代理 Moonraker API 路径

---

#31 ✅
**现象**：Fluidd WebSocket 连接失败
**根因**：Moonraker WS 路径是 `/websocket` 不是 `/ws`
**解决方案**：WS 代理路径改为 `/websocket`

---

#32 ✅
**现象**：系统没有 Python
**根因**：用户系统未安装 Python
**解决方案**：Python 嵌入式版本（后改为 Node.js Bridge）

---

#33 ✅
**现象**：Fluidd 显示连接设置页面
**根因**：`config.json` 中 `hosted: false`
**解决方案**：Bridge 启动时 patch `config.json`，设置 `hosted: true`

---

#34 ✅
**现象**：无法解析 Flutter Web UI 样本的 DOM
**根因**：Flutter Web release 模式不启用语义树
**解决方案**：逆向分析 `main.dart.js` + 用户描述确认 4 模块 2x2 网格布局

---

#35 ✅
**现象**：嵌入式 Python 命令返回 exit code 1 无输出
**根因**：终端 CWD 指向已删除的旧目录
**解决方案**：使用新终端执行命令

---

#36 ✅
**现象**：`curl` / `Invoke-WebRequest` 下载 `get-pip.py` 失败
**根因**：Windows 下错误信息被吞掉
**解决方案**：用 Python `urllib.request.urlretrieve()` 下载

---

#37 ✅
**现象**：`/server/webcams/list` 返回空数组
**根因**：U1 `moonraker.conf` 无 `[webcam]` 配置段
**解决方案**：回退到 `/webcam/?action=stream`（后改为 snapshot 轮询，见 #46）

---

#38 ✅
**现象**：开灯不工作（关灯正常）
**根因**：U1 `cavity_led` 有 4 通道 [R,G,B,WHITE]，`SET_LED` 缺少 `WHITE=1`
**解决方案**：`SET_LED LED=cavity_led RED=1 GREEN=1 BLUE=1 WHITE=1`

---

#39 ✅
**现象**：Camera 点击开始不能显示视频流
**根因**：MJPEG 流是长连接，`httpx.AsyncClient.get()` 无法流式转发
**解决方案**：v4.1 改为 snapshot 轮询方式（见 #46）

---

#40 ✅
**现象**：Filament 模块不能同步耗材类型/颜色
**根因**：`filament_feed` 只有物理状态，类型信息在 `snapmaker/print_task.json`
**解决方案**：通过 `/server/files/config/snapmaker/print_task.json` 获取

---

#41 ✅
**现象**：热床 3D 模型偏到右上角
**根因**：`update_model_offset()` 将 STL (0,0,0) 移到 printable_area 中心 (135,135)
**解决方案**：STL 以中心为原点建模

---

#42 ✅
**现象**：Bridge 安装后依赖兼容包原始目录
**根因**：Bridge 从兼容包目录运行
**解决方案**：install.ps1 将 bridge/ 复制到 BambuStudio 安装目录

---

#43 ✅
**现象**：Bridge 安装到 Program Files 后配置无法写入
**根因**：`bridge_config.json` 在 Program Files 下需管理员权限
**解决方案**：配置路径改为 `%APPDATA%\BambuStudio-Bridge\bridge_config.json`

---

#44 ✅
**现象**：Bridge 需手动启动
**根因**：无自动启动机制
**解决方案**：VBS 隐藏启动器 + Windows Startup 快捷方式

---

#45 ✅
**现象**：创建 `start-hidden.vbs` 报"对路径的访问被拒绝"
**根因**：VBS 放在 Program Files 下无写入权限
**解决方案**：VBS 放到 `%APPDATA%\BambuStudio-Bridge\start-hidden.vbs`

---

#46 ✅ 摄像头核心发现
**现象**：`/webcam/?action=stream` 返回 502 Bad Gateway
**根因**：U1 不使用 MJPEG stream 方案。摄像头通过 `/server/files/camera/monitor.jpg` 单张 JPEG 轮询实现，Snapmaker App 和 OrcaSlicer 都用此方式。mjpegstreamer 服务未运行
**解决方案**：`pollCam()` 每 1s 请求 `/server/files/camera/monitor.jpg?_t=TIMESTAMP`。启动时 IIFE 探测 URL 可用性设置 `camAvail`

---

#47 ✅
**现象**：Print Job 按钮一直显示 Start，不显示 Pause/Stop
**根因**：初始查询缺 `print_stats`/`display_status`；WS 订阅响应 `{result:{status:...}}` 被忽略
**解决方案**：查询 URL 添加 print_stats/display_status；`onmessage` 处理 `m.result.status`

---

#48 ✅
**现象**：切片后点打印直接开始，不弹确认框
**根因**：Bridge 将含 `print=true` 的 multipart body 直接转发，Moonraker 立即启动打印
**解决方案**：解析 multipart 提取 file 和 print 字段，用 Moonraker 原生上传 API 只上传不启动

---

#49 ✅
**现象**：打印选项永远不生效
**根因**：FastAPI 把 `options: dict = None` 当 query parameter，不从 request body 读取
**解决方案**：改为 `request: Request` + `await request.json()`

---

#50 ✅
**现象**：薄模型与热床模型重叠
**根因**：`Snapmaker U1_bed_texture.stl` Z 范围 0~0.510，偏移后顶部仍在打印面之上
**解决方案**：STL 所有 Z 坐标下移，使顶部对齐 Z=0

---

#51 ✅
**现象**：点击 Start Print 后打印机无反应
**根因**：`/server/files/start_local_print` 注册时 `transports=(...&~HTTP)` 排除 HTTP
**解决方案**：改用 `/printer/gcode/script` 发送 `SDCARD_PRINT_FILE_WITH_PARAMETERS`

---

#52 ✅
**现象**：切片后打印不触发确认框
**根因**：WebUI 未加载时 WS 通知无人接收
**解决方案**：WS `onopen` 后检查 `/api/bridge/pending_print`

---

#53 ✅
**现象**：点击 Start Print 报 "gcode failed"
**根因**：`/printer/gcode/script` 未注册为 HTTP 端点，只支持 WS JSON-RPC
**解决方案**：WebUI 和 Bridge 改用 WebSocket JSON-RPC 发送 G-code

---

#54 ✅
**现象**：耗材加载中/热端移动中也能启动打印
**根因**：`doPrint()` 无状态检查
**解决方案**：添加 `print_stats.state` 检查

---

#55 ✅
**现象**：`SDCARD_PRINT_FILE_WITH_PARAMETERS` 报 "unable to parse True/False"
**根因**：Klipper 宏解析器只接受数字 1/0，不接受字符串 "True"/"False"
**解决方案**：`AUTO_BED_LEVELING=1`（数字，无引号）

---

#56 ✅
**现象**：切片后打印不触发确认框（即使 print_host 已设为 Bridge）
**根因**：用户自定义 machine 配置 `print_host: "192.168.1.12"` 覆盖了系统配置
**解决方案**：reinstall 脚本自动修补用户配置中的 print_host

---

#57 ✅
**现象**：所有 G-code 控制命令不生效
**根因**：`gcode()` 通过 HTTP POST 调用不存在的端点
**解决方案**：优先使用 WebSocket JSON-RPC

---

#58 ✅（同 #56 合并）

---

#59 ✅
**现象**：上传报 `The 'python-multipart' library must be installed`
**根因**：Python Bridge `requirements.txt` 缺少 `python-multipart`
**解决方案**：添加依赖（后迁移到 Node.js Bridge 彻底解决）

---

#60 ✅
**现象**：Python 嵌入式包缺 tkinter、pip 权限问题、依赖装到用户目录
**根因**：Python 嵌入式包设计为最小运行时
**解决方案**：Bridge 从 Python 重构为 Node.js

---

#61 ✅
**现象**：切片后需手动切到 Device 标签看确认框
**根因**：BambuStudio 无耗材选择弹窗
**解决方案**：Bridge 弹出 Windows 原生对话框（PowerShell + WinForms）

---

#62 ✅
**现象**：所有代理请求返回 500
**根因**：Express 5 `{*path}` 返回数组而非字符串，`.startsWith()` 报 TypeError
**解决方案**：添加 `wcPath(req)` 辅助函数兼容数组和字符串

---

#63 ✅
**现象**：Fluidd 一直 "Connecting"
**根因**：`/access/token` 返回 404；`config.json` endpoints 为空
**解决方案**：Bridge 拦截 `/access/token` 返回空 token；config.json 添加 `endpoints: [{url: "/"}]`

---

#64 ✅
**现象**：热床温度不显示
**根因**：初始查询 URL 遗漏 `heater_bed`
**解决方案**：添加 `&heater_bed`

---

#65 ✅ 摄像头关键修复
**现象**：摄像头图片加载失败，`camAvail=false`
**根因**：`proxyToMoonraker` 用 `r.text()` 读取响应，UTF-8 解码破坏了 JPEG 二进制数据
**解决方案**：改为 `Buffer.from(await r.arrayBuffer())` 读取二进制响应体

---

#66 ✅
**现象**：Fluidd 一直 "Connecting"（即使 token 拦截已配置）
**根因**：WS 代理竞态——客户端消息在 Moonraker WS 连接前被丢弃
**解决方案**：`ws.on("message")` 立即注册；添加 `pendingMsgs` 队列缓存

---

#67 ✅ 摄像头缓存修复
**现象**：摄像头图片代理返回有效 JPEG 但不刷新
**根因**：Express 自动生成 ETag 头，WebView 用 ETag 做缓存判断。`res.removeHeader("ETag")` 在 `res.send()` 之前执行，但 `send()` 内部又添加 ETag
**解决方案**：`app.set("etag", false)` 应用级别禁用 ETag + `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache`

---

#68 ✅
**现象**：上传报 `formidable.IncomingForm is not a constructor`
**根因**：`const { formidable } = require("formidable")` 解构导入，v3 直接导出 `IncomingForm`
**解决方案**：`const formidable = require("formidable")` 直接导入

---

#69 ✅
**现象**：reinstall 后 WebUI 和 Fluidd 都不工作
**根因**：install.ps1 只复制 `bridge-node`，没复制 `bridge/web`
**解决方案**：添加复制 `bridge/web` 到 `$bridgeDst\web` 的步骤

---

#70 ✅
**现象**：上传 G-code `req.body` 为空
**根因**：`express.json()` 在 `express.raw()` 之前注册，消费了请求体
**解决方案**：`express.raw()` 移到 `express.json()` 之前

---

#71 ✅
**现象**：Fluidd 通过代理连接卡在 "Connecting"
**根因**：`proxyToMoonraker` 只转发 `content-type` 响应头，丢失关键头
**解决方案**：转发所有响应头（仅排除 `transfer-encoding`、`connection`）

---

#72 ✅
**现象**：Fluidd 子路径返回 404
**根因**：Vue SPA history 模式，服务端需对所有子路径返回 `index.html`
**解决方案**：新增 `app.get("/fluidd/{*path}", ...)` SPA 回退路由

---

#73 ✅
**现象**：Moonraker 重启后 Bridge WS 客户端连接不释放
**根因**：缺少 `moonrakerWs.on("error")` 处理
**解决方案**：添加 error 处理程序关闭客户端 WS

---

#74 ✅
**现象**：上传报 `Cannot find package 'undici'`
**根因**：`package.json` 未声明 `undici` 依赖
**解决方案**：改用 `form-data` 包替代 undici（见 #76）

---

#75 ✅
**现象**：上传报 `Content-Type is not multipart/form-data`
**根因**：`node-fetch` v2 不兼容 `undici.FormData`
**解决方案**：改用 `form-data` 包

---

#76 ✅
**现象**：`undici.Blob is not a constructor`
**根因**：undici v6 不导出 Blob
**解决方案**：彻底放弃 undici，改用 `form-data` 包

---

#77 ✅
**现象**：reinstall 后仍运行旧代码
**根因**：VBS 启动的 node 进程 CommandLine 为空，reinstall 查找进程匹配不到
**解决方案**：改用 `Get-NetTCPConnection -LocalPort 13628` 按端口查找进程

---

#78 ✅
**现象**：WebUI 数据不显示，Camera 正常
**根因**：Fluidd Service Worker 拦截了 fetch 请求（SW 能拦截 fetch 但不能拦截 Image 加载）
**解决方案**：Bridge 拦截 `/fluidd/sw.js` 返回自动注销脚本，拦截 manifest 返回 404

---

#79 ✅ WebView 核心发现
**现象**：WebUI 在浏览器正常但在 BambuStudio WebView 中 fetch/XHR 全部失败
**根因**：BambuStudio `PrinterWebView`（wxWebView/WebKit）阻止 `fetch()` 和 `XMLHttpRequest`，但允许 `<script>` 和 `<img>` 原生加载
**解决方案**：JSONP 风格桥接——`bridgeGET()`/`bridgePOST()` 通过 `<script>` 标签加载，Camera 用 `new Image()`

---

#80 ✅
**现象**：reinstall 后 WebUI 显示 reconnecting，WS 持续 ECONNRESET
**根因**：mDNS `_snapmaker._tcp.local.` 的 `service.port` 是 1884（MQTT），不是 80（HTTP）
**解决方案**：`autoDetectPrinter()` 硬编码 `printerConfig.port = 80`

---

#81 ✅
**现象**：重启电脑后 Bridge 不运行
**根因**：VBS 用裸 `node` 命令，登录时 PATH 未加载
**解决方案**：VBS 改用 `node.exe` 完整路径

---

#82 ✅
**现象**：Flow Cal 按钮点击无反应
**根因**：`event.stopPropagation()` 在 wxWebView 内联 onclick 中 `event` 未定义
**解决方案**：改为 `calibrateFlow(0);return false;`

---

#83 ✅
**现象**：Flow Cal 按钮仍无反应（修复 #82 后）
**根因**：部署目录运行旧版 `gcode()` 不返回值 + `calibrateFlow()` 无视觉反馈
**解决方案**：`gcode()` 返回 boolean + 断连 alert；`calibrateFlow()` 按钮文字变"校准中..."

---

#84 ✅
**现象**：Flow Cal G-code 发送成功但打印机不执行
**根因**：`SM_PRINT_FLOW_CALIBRATE INDEX=0` 参数名错误，应为 `EXTRUDER=0`。Klipper 静默忽略未知参数
**解决方案**：`INDEX=` → `EXTRUDER=`

---

#85 ✅ 摄像头 RPC 机制
**现象**：摄像头照片不更新，始终显示同一张旧照片
**根因**：U1 的 `camera.start_monitor` / `camera.stop_monitor` 端点（repeater.py:75-84）注册时 `transports=(TransportType.all() & ~TransportType.HTTP)`，**仅支持 WebSocket/MQTT**。这些端点通过 MQTT 转发到设备端摄像头服务，触发 `monitor.jpg` 文件更新。不调用 `start_monitor` 则设备端不更新快照文件。WebUI 的 `camRpc()` 已通过 WS JSON-RPC 发送，但需确认 WS 连接正常且 RPC 方法名正确（`camera.start_monitor`，不是 `camera.start_monitor` 带 `/` 前缀）
**解决方案**：
1. `camRpc()` 通过 WS JSON-RPC 发送 `camera.start_monitor` / `camera.stop_monitor`（当前已实现 ✅）
2. Bridge 代理正确处理二进制 JPEG（#65 已修复 ✅）
3. Bridge 禁用 ETag + no-cache 头（#67 已修复 ✅）
4. `pollCam()` 用 `_t=Date.now()` 缓存破坏（当前已实现 ✅）
5. 走 Bridge 代理获取 `monitor.jpg` 完全可行，无需直连打印机 IP

---

## 摄像头问题历史总结

摄像头经历了多次迭代修复，核心链路：`camera.start_monitor`（WS RPC）→ 设备更新 `monitor.jpg` → Bridge 代理（二进制+禁缓存）→ WebUI `new Image()` 轮询

| 版本 | 问题 | 修复 |
|------|------|------|
| v3.19 | MJPEG 流代理不工作 (#39) | 改直连打印机 IP |
| v4.1 | U1 不支持 MJPEG (#46) | 改为 snapshot 轮询 |
| v5.2.1 | 代理破坏二进制 JPEG (#65) | `arrayBuffer()` 替代 `text()` |
| v5.2.2 | Express ETag 缓存 (#67) | `app.set("etag",false)` + no-cache |
| v5.7.x | 照片仍不更新 (#85) | 确认 `camera.start_monitor` 必须走 WS，走 Bridge 代理可行 |

**当前状态**：走 Bridge 代理获取摄像头完全可行。如果照片不更新，排查顺序：
1. WS 连接是否正常（`camRpc` 依赖 WS）
2. `camera.start_monitor` RPC 是否被设备接收（检查 Moonraker 日志）
3. 设备端是否在更新 `monitor.jpg`（直接访问 `http://打印机IP/server/files/camera/monitor.jpg` 对比）
4. Bridge 代理是否返回新数据（检查 Debug Logs 中 proxy 日志）

---

#86 ✅
**现象**：顶栏不显示打印机 IP
**根因**：`bridgeGET('/api/bridge/config')` 走 JSONP 加载 `/api/bridge/config.js`，但服务端只有 `/api/bridge/config`（非 JSONP），缺少 `.js` 端点
**解决方案**：添加 `/api/bridge/config.js` JSONP 端点

---

#87 ✅
**现象**：打印确认选项（Auto Bed Leveling / Flow Calibration / Timelapse）不生效
**根因**：之前手动构建 `SDCARD_PRINT_FILE_WITH_PARAMETERS` G-code，参数名可能不正确（`auto_bed_leveling`/`flow_calibrate`/`time_lapse_camera` 是否与 U1 Klipper 宏定义匹配未知），且缺少 `_fill_metadata` 元数据（klippy_apis.py:285-310 会自动附加 line_width、layer_height 等参数）
**解决方案**：改用 Moonraker 的 `start_local_print` JSON-RPC 端点，让 Moonraker 自己生成完整的 G-code。`start_local_print` → `process_local_file` → `start_print_advanced` → 自动 `_fill_metadata` + 正确参数格式

---

#88 ✅
**现象**：reinstall 后 Bridge 不重启，WebUI 显示旧代码
**根因**：reinstall.ps1 中 `Get-Process -Name "node"` 杀掉所有 node 进程（包括其他应用的），可能杀错进程或遗漏 Bridge 进程
**解决方案**：只按端口查找进程 `Get-NetTCPConnection -LocalPort 13628`，不再杀所有 node 进程

---

#89 ✅（#55 回归）
**现象**：打印确认框勾选选项后，Fluidd 控制台报 `unable to parse True`，设备报错 0003-0529-0000-0001
**根因**：`confirm_print.js` 和 `start_print.js` 中 `req.query.auto_bed_leveling === "1"` 返回 JavaScript 布尔值 `true`，JSON 序列化后 Moonraker 的 `start_print_advanced` 将其转为 G-code 中的 `AUTO_BED_LEVELING="True"`，Klipper 无法解析字符串 `"True"`。与 #55 相同根因，改用 `server.files.start_local_print` 后参数传递方式变化导致回归
**解决方案**：`=== "1"` (boolean) → `=== "1" ? 1 : 0` (integer)，确保 JSON 中是数字 `1`/`0`

---

#90 ✅
**现象**：摄像头照片不更新，始终显示一张非当前状态的照片
**根因**：`camera.start_monitor` 必须通过 WS/MQTT 发送到设备端才能触发 `monitor.jpg` 更新（repeater.py L133-153）。之前 WebUI 通过浏览器 WS 代理发送 `camRpc('camera.start_monitor')`，但该调用经 Bridge WS 代理转发可能不稳定。`cam_snapshot` 端点只负责获取图片，不负责触发设备更新
**解决方案**：
1. `cam_snapshot` 端点自动调用 `ensureCamMonitor()`，通过服务端 `callMoonrakerJsonRpc` 建立独立 WS 连接发送 `camera.start_monitor`（30秒节流）
2. 新增 `/api/bridge/cam_start_monitor.js` 和 `/api/bridge/cam_stop_monitor.js` JSONP 端点
3. WebUI `toggleCam()` 改用服务端 JSONP 端点替代浏览器 WS 代理的 `camRpc()`

---

#91 ✅
**现象**：打印确认框勾选选项后弹窗 "Print failed: Method not found"
**根因**：`callMoonrakerJsonRpc("start_local_print", ...)` 方法名错误。Moonraker 端点注册路径是 `/server/files/start_local_print`（snapmakercloud.py L138-141），JSON-RPC 方法名规则是路径去掉前导 `/` 并将 `/` 替换为 `.`，即 `server.files.start_local_print`
**解决方案**：`"start_local_print"` → `"server.files.start_local_print"`

---

#92 ✅
**现象**：打印确认框勾选 Auto Bed Leveling 后，Fluidd 日志显示参数正确传递 `AUTO_BED_LEVELING="1"`，但设备输出 `print_task_config configuration does not do auto-leveling`，热床调平未执行。Flow Calibration 和 Timelapse 正常工作
**根因**：G-code 参数名不正确。`klippy_apis.py` L333-335 的 `start_print_advanced` 将 options 字典的 key 转 `.upper()` 后拼成 G-code 参数。从 Snapmaker u1-klipper 开源仓库 `print_task_config.py` L965 确认：G-code 参数名是 `BED_LEVEL`（不是 `AUTO_BED_LEVELING`，也不是 `TASK_BED_LEVELING`）。L42 内部字段名 `'auto_bed_leveling'` 与 G-code 参数名 `BED_LEVEL` 不同，这是 Snapmaker 的命名不一致
**解决方案**：options key 从 `auto_bed_leveling`/`task_bed_leveling` → `bed_level`（v5.8.3），`klippy_apis.py` 转 `.upper()` 后生成 `BED_LEVEL="1"`，匹配 `print_task_config.py` L965 的 `gcmd.get_int('BED_LEVEL')`。已验证通过 ✅

---

#93 ✅
**现象**：WebUI 摄像头照片不更新，点击摄像头按钮后 monitor.jpg 始终是同一张图
**根因**：`camera.start_monitor` 参数缺失。通过逆向 OrcaSlicer Flutter Web (`main.dart.js` L131485-131487) 发现，OrcaSlicer 传参 `{ domain: "lan", interval: 0, expect_pw: true }`，而 Bridge 只传了 `{ req_id: reqId }`。`repeater.py` 的 `_handle_camera_timelapse_request` 通过 MQTT 转发到设备端闭源 lmd 进程，缺少 `domain` 参数导致 lmd 不响应
**解决方案**：`camera.start_monitor` 参数改为 `{ domain: "lan", interval: 0, expect_pw: true }`（v5.9.0），`camera.stop_monitor` 参数改为 `{ domain: "lan" }`。已验证通过 ✅

---

#94 ✅
**现象**：WebUI Control 模块温度/风扇/速度等信息不自动更新，点模块刷新按钮无效，只有点顶栏刷新（location.reload）才更新
**根因**：1. `refreshCtrl()` 是空函数，没有实现主动查询；2. BambuStudio WebView 环境可能限制 WS `notify_status_update` 推送，导致 `upd()` 不被触发
**解决方案**：1. 实现 `refreshCtrl()` → 调用 `queryStatus()` 通过 `printer.objects.query` 主动查询；2. 添加 2 秒定时轮询 `setInterval(queryStatus, 2000)` 作为 WS 推送的后备（v5.9.0）。已验证通过 ✅

---

#95 ✅
**现象**：Model Fan 点 50% 和 100% 都是 100% 风速；Cavity Fan 点 100% 只显示 1%。速度倍率正常
**根因**：v5.10.0 改用定制端点后风扇参数范围错误。1. `main_fan`：传 `{speed: Math.round(pct*2.55)}`（0-255），但 Klipper `_handle_control_main_fan`（fan.py L148-153）期望 `S` 范围 0-100，超过 100 被 clamp。50%→128→clamp 100%，100%→255→clamp 100%。2. `generic_fan`：传 `{speed: pct/100}`（0-1 浮点），但 Moonraker `klippy_apis.py` L233 用 `get_int('speed', 0)` 取整，1.0→1。Klipper `_handle_control_generic_fan`（fan_generic.py L25-30）做 `1/100=0.01`，100% 只显示 1%
**解决方案**：`setFan()` 两个分支都改为直接传 `pct`（0-100 整数百分比），匹配 Klipper 端 `S` 参数的 0-100 范围（v5.10.1）

---

#96 ✅
**现象**：打印确认框只显示设备上的耗材信息，无法知道 gcode 需要什么耗材，也无法自动匹配物理槽位
**根因**：`showPrintDialog` 只接收 `print_task.json` 数据（设备端耗材），未获取 gcode 元数据中的 `filament_type`/`filament_used_mm`/`filament_colour`，无法建立 gcode 槽位→物理槽位的映射
**解决方案**：1. `onPendingPrint`/`printFile` 先通过 `bridgeGET('/server/files/metadata?filename=xxx')` 获取 gcode 元数据；2. `showPrintDialog(name, task, meta)` 新增 meta 参数，解析 `filament_type`（可能是分号分隔字符串需 split）、`filament_used_mm`、`filament_colour`；3. 自动按 `filament_type` 大小写不敏感匹配物理槽位；4. `doPrint()` 构建 `extruder_map_table: [[logical,physical],...]` 仅含使用槽位；5. server.js 两个端点解析 JSON 字符串参数传入 options（v5.12.0）

---

#97 ✅
**现象**：`bridgePOST` 传递数组参数时，`String([[0,1],[1,0]])` 变成 `"0,1,1,0"` 无法还原结构
**根因**：`bridgePOST` 将 body 转为 query string，对复杂类型只做 `String(v)`，丢失数组结构
**解决方案**：对 `extruder_map_table` 先 `JSON.stringify(mapTable)` 再传入，server.js 端用 `JSON.parse(req.query.extruder_map_table)` 还原（v5.12.0）

---

#98 ✅
**现象**：`extruder_map_table` 参数传入 Klipper 后不被识别，`SET_PRINT_TASK_PARAMETERS` 收不到映射表
**根因**：`klippy_apis.py` L333-335 将 options key 转 `.upper()` 后拼成 G-code 参数，`extruder_map_table` → `EXTRUDER_MAP_TABLE`，但 `print_task_config.py` L963 期望的参数名是 `MAP_TABLE`，不是 `EXTRUDER_MAP_TABLE`
**解决方案**：server.js 中将 `options.extruder_map_table` 改为 `options.map_table`，这样 `.upper()` 后变成 `MAP_TABLE`，匹配 Klipper 期望的参数名（v5.12.1）

---

#99 ✅
**现象**：耗材类型 "Snapmaker PETG" 与 "Generic PETG" 匹配失败，`===` 严格比较不通过
**根因**：耗材类型字符串包含品牌前缀（如 "Snapmaker PETG"、"Generic PETG HF"），直接 `===` 比较无法匹配同类型不同品牌的耗材
**解决方案**：`extractFilType()` 函数从类型字符串中提取核心关键词（遍历 `FILAMENT_TYPES` 数组做 `indexOf` 匹配），"Snapmaker PETG" → "PETG"，"Generic PETG HF" → "PETG"（v5.14.0）

---

#100 ✅
**现象**：BambuStudio WebView 中点击 About 页面链接无法跳转到外部浏览器，`window.open()` 和 `<a target="_blank">` 均被拦截
**根因**：1. BambuStudio `PrinterWebView`（wxWebView/WebKit）拦截 `window.open` 和 `<a target="_blank">`；2. `bridgeGET` 对含 query string 的路径直接追加 `.js`，导致 `/api/bridge/open_external?url=xxx.js` 而非 `/api/bridge/open_external.js?url=xxx`，Express 路由匹配失败
**解决方案**：1. Bridge 服务端新增 `/api/bridge/open_external.js` JSONP 端点，使用 `child_process.exec` 调用系统默认浏览器；2. 修复 `bridgeGET`：当 path 含 `?` 时用 `path.replace('?', '.js?')` 将 `.js` 插到 `?` 前面，而非追加到末尾。安全限制：只允许 `http://` 或 `https://` 开头的 URL（v5.16.0）

---

#101 ✅
**现象**：用户在打印确认框选择第二个挤出头（黑色PETG），但实际打印使用第一个挤出头（橙色PETG）。Fluidd 控制台显示 `extruder -> extruder`，T0 命令未被映射
**根因**：`SDCARD_PRINT_FILE_WITH_PARAMETERS` 调用 `cmd_SET_PRINT_TASK_PARAMETERS`（print_task_config.py L1038），该函数只更新 `extruder_map_table`，**没有同步更新 `reprint_info["extruder_map_table"]`**。而 `virtual_sdcard.py` L2107 处理 T0 命令时读取 `reprint_info["extruder_map_table"]`，映射表为默认值 `[0,1,2,3]`，T0 映射到物理挤出头 0。对比 `cmd_SET_PRINT_EXTRUDER_MAP`（L494-495）同时更新两者
**解决方案**：放弃 `server.files.start_local_print`（生成 `SDCARD_PRINT_FILE_WITH_PARAMETERS`），改用 OrcaSlicer 分步方式：先 `SET_PRINT_EXTRUDER_MAP`（同时更新两者）→ `SET_PRINT_USED_EXTRUDERS` → `SET_PRINT_PREFERENCES` → `printer.print.start`（生成 `SDCARD_PRINT_FILE` 不带 options）。逆向分析 `main.dart.js` L36935/L131518 确认此流程（v5.16.1）

---

#102 ✅
**现象**：`SET_PRINT_USED_EXTRUDERS EXTRUDERS=1` 在某些场景下标记错误的挤出头。例如 mapTable=`[[0,0]]` 时发送 `EXTRUDERS=1`（数量），Klipper 解析为 `used_extruders=[1]`（索引），标记物理挤出头 1 而非 0
**根因**：`cmd_SET_PRINT_USED_EXTRUDERS`（print_task_config.py L738-741）用 `extruders_str.split(',')` 解析参数为索引列表 `[int(value) for value in extruders_str.split(',')]`，期望逗号分隔的挤出头索引（如 `"0,1"`），而非数量（如 `"1"` 或 `"2"`）。当只有一个索引时 `"1"` 恰好被解析为 `[1]`，在 mapTable=`[[0,1]]` 场景下结果正确，但在 mapTable=`[[0,0]]` 场景下 `usedExtruders.length=1` 发送 `EXTRUDERS=1`，Klipper 解析为索引 1 而非 0
**解决方案**：`usedExtruders.length`（数量）→ `usedExtruders.join(',')`（逗号分隔索引列表），如 `EXTRUDERS=0,1` 或 `EXTRUDERS=0`（v5.16.1）

---

#103 ❌ BambuStudio 固有限制
**现象**：BambuStudio 生成的 gcode 文件在 Snapmaker U1 设备触摸面板上直接打印时提示"未识别的gcode类型"，但通过 WebUI 打印确认框可以正常打印
**根因**：设备面板闭源触摸屏固件在直接打印 gcode 时检查文件中的 EXECUTABLE_BLOCK 内容。BambuStudio 生成的 EXECUTABLE_BLOCK 包含某些特征（如 EXCLUDE_OBJECT 定义、FEATURE→TYPE 关键字差异等）导致不被识别。通过多轮对比测试确认：
1. HEADER 标识符无关（改成 BambuStudio 标识的 OrcaSlicer 文件仍可识别）
2. CONFIG_BLOCK 位置是关键（OrcaSlicer 在末尾，BambuStudio 在开头）——Moonraker `parse_filament_type` 只搜索 `footer_data`（文件末尾 1 MiB），BambuStudio 的 CONFIG_BLOCK 在开头无法被解析
3. 即使 CONFIG 移到末尾，BambuStudio 的 EXECUTABLE_BLOCK 内容仍被设备面板拒绝
4. OrcaSlicer HEADER+THUMB+CONFIG + BambuStudio EXEC → 不识别，确认问题在 EXECUTABLE_BLOCK
**解决方案**：
1. `patchGcodeLayout()` 在 Bridge 上传 gcode 时自动重组文件结构（CONFIG_BLOCK 移到末尾）→ 修复 WebUI 耗材信息解析 ✅
2. 通过 WebUI 打印确认框使用 OrcaSlicer 分步方式（SET_PRINT_EXTRUDER_MAP → SET_PRINT_USED_EXTRUDERS → SET_PRINT_PREFERENCES → printer.print.start）→ 耗材映射正确 ✅
3. 设备面板直接打印 BambuStudio gcode 仍不识别——闭源触摸屏固件检查 EXECUTABLE_BLOCK，无法从外部修复 ❌
4. **结论**：BambuStudio gcode 只能通过 WebUI 打印，不支持设备面板直接打印。此为设备固件限制，非兼容包 bug

---

#104 ✅
**现象**：耗材颜色匹配不准确，同类型多个物理槽位时颜色相近的匹配效果差。例如橙色和红色在 RGB 空间距离较近但视觉差异明显
**根因**：`colorDist()` 使用 RGB 欧几里得距离计算颜色差异，RGB 空间不是感知均匀的——人眼对绿色变化更敏感，对蓝色变化较不敏感。OrcaSlicer 使用 CIEDE2000 算法（Lab 色彩空间），这是工业标准的感知均匀颜色差异计算方法（逆向分析 `main.dart.js` L144042-L144098 确认）
**解决方案**：将 `colorDist()` 从 RGB 欧几里得距离升级为 CIEDE2000 算法（v5.18.0）：
1. `rgbToLab(r,g,b)`：sRGB → 线性 RGB → XYZ → CIELAB 转换
2. `ciede2000(lab1,lab2)`：CIEDE2000 ΔE 计算（含 C'、h'、SL、SC、SH、RT 旋转项）
3. `colorDist(a,b)` 改为调用 `ciede2000(rgbToLab(...), rgbToLab(...))`

---

#105 ✅
**现象**：WebUI 打印进度只显示百分比（如 "45%"），不能显示当前是哪一层（如 "56/125 layers"）。`jobLayer` 始终显示 "0/0"
**根因**：BambuStudio 兼容包的机器配置 `fdm_machine_common.json` 中 `layer_change_gcode` 为空字符串 `""`，导致生成的 gcode 中缺少逐层 `SET_PRINT_STATS_INFO` 命令。Klipper `print_stats.info.current_layer` 始终为 0。对比 OrcaSlicer gcode：每层变化时插入 `SET_PRINT_STATS_INFO TOTAL_LAYER=125 CURRENT_LAYER=N`。WebUI 代码（L1209）已正确读取 `ps.info.current_layer` 和 `ps.info.total_layer`，只是 Klipper 端没有数据
**解决方案**：`layer_change_gcode` 从 `""` 改为 `"SET_PRINT_STATS_INFO TOTAL_LAYER={total_layer_count} CURRENT_LAYER={layer_num}"`（v5.18.1）。注意：此修改只影响新生成的 gcode，已上传的旧 gcode 需要重新切片

---

#106 ✅
**现象**：通过 WebUI 打印确认框映射耗材后，设备面板上的耗材颜色/类型信息被覆盖为 gcode 中声明的值（如设备上蓝色 PLA 变成 gcode 预设的红色 PLA）
**根因**：打印流程中发送 `SET_PRINT_FILAMENT_CONFIG CONFIG_EXTRUDER='i' FILAMENT_TYPE='PLA' ... SAVE='1' VENDOR='Generic'`，用 gcode 元数据中的耗材信息（来自 BambuStudio 预设）覆盖了设备上物理耗材的实际信息。`SAVE='1'` 使覆盖持久化。OrcaSlicer 的打印确认流程不使用 `SET_PRINT_FILAMENT_CONFIG`（仅在耗材编辑页面单独调用），也不使用 `SET_PRINT_TASK_PARAMETERS FILAMENT_TYPE=[...]`
**解决方案**：从打印确认流程中移除 `SET_PRINT_FILAMENT_CONFIG` 和 `SET_PRINT_TASK_PARAMETERS FILAMENT_TYPE=[...]`（v5.19.0）。设备已通过 `print_task.json` 知道自己的物理耗材信息，`SET_PRINT_EXTRUDER_MAP` 已建立映射关系，无需用 gcode 的耗材信息覆盖设备配置

---

#107 ✅
**现象**：AI Lab 页面一片空白，问答助手浮动按钮也不显示
**根因**：webui.html 清理旧 AI Lab HTML 时（Node.js 脚本删除 L230-288、L538-706、L1543-1967），误删了 `<div id="ailab-content">` 空容器（原来在 L538-706 范围内）。ailab.js 的 `initAILab()` IIFE 中 `document.getElementById('ailab-content')` 返回 null → 直接 return，所有 HTML 注入和 QA Fab/Popup 创建都被跳过
**解决方案**：在 `about-content` 和 `<script>` 之间补回 `<div id="ailab-content" style="display:none;width:100%;height:100%;overflow:hidden;"></div>`（v5.27.0）

---

#108 ✅
**现象**：reinstall 后 AI Lab 仍一片空白，问答助手浮标不显示。浏览器控制台 ailab.js 和 ailab.css 加载 404
**根因**：server.js 没有 `express.static(WEB_DIR)`，仅对 `/`、`/snapmaker.png`、`/fluidd/*` 做了显式路由。`/ailab.css` 和 `/ailab.js` 请求落到 `app.all("/{*path}")` catch-all 代理，被转发到 Moonraker 打印机返回无用响应
**解决方案**：在 `/snapmaker.png` 路由后添加 `ailab.css` 和 `ailab.js` 的显式路由（参照 voxelflow 模式用 `app.get("/ailab.css", ...)`，不用 `express.static(WEB_DIR)` 避免干扰 API 路由）（v5.27.0）

---

#109 ✅
**现象**：G-code 优化三大问题 — ①本地文件下拉框为空；②上传文件后没反应，点击优化提示"请选择gcode文件"；③打印机选文件后点击优化同样提示"请选择gcode文件"
**根因**：
1. `aiOptSwitchTab('local')` 只切换面板可见性，未调用 `aiListGcodeFiles()` 加载文件列表
2. 上传 FormData 字段名不匹配：前端 `formData.append('gcode', file)` vs server `files.file?.[0]`，server 收不到文件返回 `{error: "no_file"}`
3. `optimize_gcode` 响应嵌套：server `{ok: true, result}` → 前端读 `r.optimized_gcode_name` 为 undefined（应在 `r.result.optimized_gcode_name`）；`applied_ops` 字段名应为 `applied_operations`
4. 打印机 fetch 异步下载未完成时用户过早点击优化按钮
**解决方案**：
1. `aiOptSwitchTab` 中 `source==='local'` 时调用 `aiListGcodeFiles()`
2. server `files.file?.[0]` → `files.gcode?.[0]`；前端加 loading 状态和 file input reset
3. server `{ok: true, result}` → `{ok: true, ...result}` flatten；前端 `applied_ops` → `applied_operations`
4. `aiOptFetchAndPreview` 下载期间 disable 优化按钮显示"下载中..."，完成后恢复（v5.27.0）

---

#110 ✅
**现象**：G-code 优化对 U1 真实多色打印文件破坏性严重 — `PRINT_START`、`SM_PRINT_AUTO_FEED`、`SM_PRINT_FLOW_CALIBRATE`、`DEFECT_DETECTION_START` 等 U1 专有命令被 `replace_start_gcode` 暴力替换为通用 `G28/M82/M109`，导致耗材自动进料、流量校准、缺陷检测功能丢失
**根因**：`optimizeGcode` 中 `replace_start_gcode` 操作找到 `;LAYER:0` 或首个含 E 值的 G1 行后，将之前所有内容替换为硬编码的 U1_START_GCODE 模板。但 U1 切片器（VoxelFlow）生成的 start gcode 包含大量专有命令（PRINT_START/SM_PRINT_*/DEFECT_*），这些命令是 U1 打印流程必需的
**解决方案**：在 `optimizeGcode` 中检测 gcode 是否包含 U1 专有命令（`PRINT_START`/`SM_PRINT_AUTO_FEED`/`SM_PRINT_FLOW_CALIBRATE`/`DEFECT_DETECTION`），若包含则跳过 `replace_start_gcode` 和 `replace_end_gcode`，只保留安全的优化操作（温度/速度/风扇/回抽/腔体风扇等）（v5.27.0）

---

#111 ✅
**现象**：G-code 优化对比预览中，只要有一行被插入，插入行之后的所有行都被标记为"差异"（红色/绿色），即使内容完全相同。例如优化只在第 100 行插入了一行，第 100-2000 行全部显示为差异
**根因**：`aiOptLoadOptimized` 使用朴素逐行对比（`origLines[i] !== optLines[i]`），按索引逐行比较。当有一行插入时，优化后文件的所有后续行索引偏移 1，导致从插入点开始所有行都被判定为"不同"
**解决方案**：替换为 LCS（最长公共子序列）diff 算法（v5.28.0）：
1. `aiOptComputeDiff`：标准 DP 构建 LCS 表 + 回溯生成 diff 条目（equal/delete/insert/change）
2. 连续 delete+insert 合并为 change（语义更准确）
3. >3000 行降级到 `aiOptHashDiff`（前瞻匹配块级 diff，避免 O(n²) 内存）
4. diff 信息栏从"差异: N 处"改为"差异: N 处 (X 新增, Y 删除, Z 修改)"

---

#112 ✅
**现象**：G-code 优化声称执行了 `replace_speed`（F30000→F25000）和 `modify_temperature`（统一至 210°C/60°C），但实际 gcode 中 F30000 出现次数完全未变，温度值（178°C、138°C、228°C、80°C）也原样保留。5 项优化操作中仅 1 项（add_retract）实际生效
**根因**：
1. `replace_speed`：AI 返回的 `original_speed` 可能缺少 `F` 前缀（如 `"30000"` 而非 `"F30000"`），直接用 `new RegExp(original_speed)` 构建正则匹配不到 `F30000`
2. `modify_temperature`：正则 `/M104 S(\d+)/` 只匹配 `M104 S228` 格式，但 Orca gcode 中参数顺序不固定（如 `M104 T0 S140`、`M109 T0 S138`），正则匹配不到；层计数用 `lines[i].includes('Layer')` 匹配 `Layer` 关键词，但 Orca 层标记是 `;LAYER:N` 格式，大小写不匹配
3. `add_layer_markers`/`add_e_reset`：Orca gcode 已通过 `before_layer_change_gcode` 包含 SET_PRINT_STATS_INFO 和 G92 E0，但操作不检查是否已存在就重复插入
**解决方案**（v5.28.0）：
1. `replace_speed`：自动补全 F 前缀（`original_speed.startsWith('F') ? original_speed : 'F' + original_speed`）；添加负向前瞻 `(?!\\d)` 避免部分匹配；空值检查
2. `modify_temperature`：改用 `\bS\d+\b` 匹配任意位置的 S 参数（兼容 `M104 T0 S140` 和 `M104 S228`）；层计数改用 `/^;LAYER:\d+/` 正则；新增 `new_bed_temp` 支持热床温度替换
3. `add_layer_markers`：插入前检查下一行是否已包含 `SET_PRINT_STATS_INFO`，已存在则跳过
4. `add_e_reset`：统计已有 G92 E0 的层数占比，≥80% 则跳过整个操作

---

#113 ✅
**现象**：G-code 优化失败，报错 `log is not defined`。AI Lab 前端显示"优化失败: log is not defined"
**根因**：slice_agent.js 中 `optimizeGcode` 函数的 `add_layer_markers`/`add_e_reset` 操作调用了 `log("INFO", ...)` 和 `log("WARN", ...)`，但 slice_agent.js 中没有定义 `log` 函数。`log` 只在 server.js 中定义，slice_agent.js 作为独立模块无法访问
**解决方案**：在 slice_agent.js 中新增 `log()` 函数和 `setLogFn(fn)` 注入机制（v5.28.1）：
1. 默认使用 `console.log/warn/error` 输出日志
2. server.js 启动时调用 `sliceAgent.setLogFn(log)` 注入统一日志函数
3. 导出 `setLogFn` 供 server.js 调用

---

#114 ✅
**现象**：打印机 gcode 下载失败，API 返回 `{"ok":false,"error":"resp.body.getReader is not a function"}`
**根因**：v5.28.1 中 `fetch_printer_gcode` 使用了 `resp.body.getReader()` 流式读取下载进度，但 Node.js 内置 `fetch` 的 `resp.body` 是 Node.js Web Stream，不支持浏览器风格的 `getReader()` 方法。在 Node.js 18/20 中 `getReader()` 不可用
**解决方案**（v5.28.2）：改用 `resp.arrayBuffer()` 一次性下载整个文件，下载完成后更新 `fetchProgress` 状态。虽然无法实时追踪下载进度（进度条只会在下载完成时从 0% 跳到 100%），但兼容所有 Node.js 版本。进度条仍保留，用于显示"下载中..."状态

---

#115 ✅
**现象**：G-code 优化 `replace_speed` 操作始终未生效。Dragon_Textured_PLA 优化中 AI 计划将 F30000 替换为 F27000，但 gcode 中 F30000 出现 12258 次全部未变。6 项操作中仅 1 项（add_retract）实际生效
**根因**：AI 返回的速度值使用 mm/s 单位（如 `"500"` 或 `"450"`），代码自动补全 F 前缀后变成 `F500`/`F450`，而 gcode 中实际速度是 `F30000`（mm/min 单位，= 500 mm/s × 60）。正则 `F500` 无法匹配 `F30000`。G-code 的 F 参数始终是 mm/min 单位，但 AI（特别是通用 LLM）倾向于使用 mm/s 这个更直观的单位
**解决方案**（v5.28.3）：
1. `replace_speed` 中添加 mm/s → mm/min 自动转换：如果 F 值 < 1000（典型打印速度 16-500 mm/s 对应 960-30000 mm/min，< 1000 几乎不可能是 mm/min），视为 mm/s 并乘以 60
2. 改善 AI prompt：在 `optimize_gcode.md` 和 `optimizeGcode` 的 `taskInstructions` 中明确标注"G-code 速度单位为 mm/min（不是 mm/s）"，给出换算示例（F30000 = 500 mm/s）
3. 添加匹配结果日志：成功时记录匹配次数，失败时记录 WARN

---

#116 ✅
**现象**：G-code 转换格式检测错误——OrcaSlicer 生成的 gcode 被标记为 `[Bambu]` 格式，转换时报"Already OrcaSlicer format (contains PRINT_START)"
**根因**：格式检测使用 BambuStudio 专有命令标记（`MOVE_TO_DISCARD_FILAMENT_POSITION`、`ROUGHLY_CLEAN_NOZZLE`、`SM_PRINT_EXTRUDER_PREHEAT` 等），但 OrcaSlicer U1 gcode 也包含这些命令（因为 U1 的 Start G-code 模板中定义了它们）。对比两个 gcode 发现真正的区分标志是层标记格式：BambuStudio 用 `; FEATURE:`（13193 处），OrcaSlicer 用 `;TYPE:`（9958 处），两者互斥
**解决方案**（v5.29.1）：格式检测改用 `; FEATURE:` vs `;TYPE:` 判断——BambuStudio gcode 只含 `; FEATURE:` 不含 `;TYPE:`，OrcaSlicer gcode 只含 `;TYPE:` 不含 `; FEATURE:`。这是最可靠的区分方法

---

#118 ✅
**现象**：LMStudio 模型从 `google/gemma-4-e2b` 升级为 `google/gemma-4-e4b` 后，AI Lab 提示无法连接
**根因**：`slice_agent.js:34` 硬编码 `defaultModel: "google/gemma-4-e2b"`，`aiConfig.model` 为空时 fallback 到此默认值。用户升级模型后 LMStudio 不再加载旧模型，请求的模型名不匹配导致 404。`testAiConnection` 虽然会自动发现可用模型列表（第 1325-1336 行），但只更新了 `provider.availableModels` 和 `provider.defaultModel`，没有更新 `aiConfig.model`
**解决方案**（v5.31.3）：`testAiConnection` 发现模型后，若当前 `aiConfig.model` 不在可用列表中，自动切换到第一个可用模型并返回 `currentModel` 字段；前端测试连接成功后，若后端返回了 `currentModel` 且与输入框不同，自动更新输入框并提示"模型已自动更新"

---

#119 ✅
**现象**：使用本地模型（LMStudio）时，已保存配置且测试连接成功，但点击 G-code 优化或打印问答仍提示"请先配置 LLM 连接：点击 AI Lab 设置图标，填写 API Key 后保存。"
**根因**：ailab.js 第 436 行和第 744 行的 LLM 配置检查 `!aiCfg._hasKey && !aiCfg.apiKey` 对所有 provider 生效。但本地模型不需要 API Key，`hasKey`（来自 `!!aiConfig.apiKey`）永远为 `false`，`aiCfg.apiKey` 前端也没有值，导致已配置的本地模型被误拦截
**解决方案**（v5.31.4）：检查时先判断当前 provider 是否为本地模型（`aiProviders[aiCfg.provider].isLocal`），本地 provider 跳过 API Key 检查

---

#117 ✅
**现象**：安装后 Bridge 无法自启动，`start-hidden.vbs` 报错 `800A03EA`（VBScript 语法错误）
**根因**：install.ps1/reinstall.ps1 生成 VBS 时，PowerShell here-string 展开 `$nodePath` 变量到 `WshShell.Run` 参数中。当 Node.js 安装在 `C:\Program Files (x86)\nodejs\` 时，展开后的 VBS 代码为 `WshShell.Run """C:\Program Files (x86)\nodejs\node.exe"" ..."`，VBScript 把 `(x86)` 中的括号解析为函数调用语法，导致 800A03EA 语法错误
**解决方案**（v5.31.2）：VBS 中先用变量赋值路径再拼接，避免括号直接出现在 `Run` 参数中：`nodePath = "C:\Program Files (x86)\nodejs\node.exe"` → `WshShell.Run """" & nodePath & """ ..."`

---

#120
**现象**：Node.js v26.4.0 安装后，`install.bat`/`reinstall.bat` 中 npm install 失败，日志显示 `SyntaxError: 意外的字符串`，Bridge 无法启动
**根因**：install.ps1 第 352-354 行用 `Get-Command npm` 获取 npm 命令。Node.js v26 的安装包中新增了 `npm.ps1`，PowerShell 的 `Get-Command` 按优先级返回了 `npm.ps1`，而不是 `npm.cmd`。实际执行变成了 `node.exe "C:\Program Files\nodejs\npm.ps1" install --production`，Node.js 把 PowerShell 脚本当 JavaScript 解析，第一行 `Set-StrictMode -Version 'Latest'` 直接报错
**解决方案**（v5.32.1）：去掉 `Get-Command` 间接层，从已知的 `$nodePath` 直接推导 `npm.cmd` 路径：`$npmCmd = Join-Path (Split-Path $nodePath) 'npm.cmd'`。`node.exe` 和 `npm.cmd` 永远在同一个目录，可靠兼容所有 Node.js 版本

---

#121 ✅
**现象**：Linux 上点击 BambuStudio 打印按钮，Bridge 弹原生对话框时崩溃，日志显示 `ReferenceError: execFileSync is not defined`
**根因**：dialog.js:1 只导入了 `execFile`：`const { execFile } = require("child_process")`，但 showLinuxDialog（L275）用 `execFileSync("which", ["zenity"], ...)` 检测 zenity 是否安装。同步函数从未被导入，运行时直接抛 ReferenceError
**解决方案**（v5.34.0）：dialog.js:1 改为 `const { execFile, execFileSync } = require("child_process")`

---

#122 ✅
**现象**：所有 JSONP 端点（35 处 `req.query.cb || "callback"`）允许任意字符串作为回调函数名，攻击者可构造 `?cb=alert(document.cookie)//` 注入 JS，通过 `<script>` 标签执行任意代码（XSS）
**根因**：server.js 35 处 JSONP 端点直接把 `req.query.cb` 拼入响应 `${cb}(...)`，无任何校验。虽然 BambuStudio WebView 是本地工具，但 cb 注入可被恶意网页利用（如钓鱼链接指向 bridge）
**解决方案**（v5.34.0）：server.js:187-194 加全局中间件 `sanitizeCb`，对 `req.query.cb` 用正则 `/^[A-Za-z_$][\w$]*$/` 校验，非合法 JS 标识符的重置为 `callback`。一处中间件覆盖所有 35 个端点

---

#123 ✅
**现象**：`/api/bridge/open_external.js?url=...` 端点用 `exec(\`start "" "${url}"\`)` 拼接命令，URL 中含 `&` `|` `;` 等 shell 元字符时可执行任意命令（RCE）。例如 `url=https://evil.com&calc.exe` 会启动计算器
**根因**：server.js 三个端点（open_external L550、open_folder L574、open_gcode_folder L1481）都用 `exec(cmd)` 拼接 shell 命令，url/dir 直接插入命令字符串。open_external 虽有 `^https?://` 校验但仍允许 `&` 等 query 字符
**解决方案**（v5.34.0）：新增 `openPathExternally(target)` helper（server.js:544-577），用 `spawn` + 参数数组调用 `explorer`/`open`/`xdg-open`，参数不经 shell 解析。三个端点改用此 helper，删除所有内联 `require("child_process").exec`

---

#124 ✅
**现象**：每次通过 BambuStudio 上传 gcode 打印后，`%TEMP%` 目录残留 `formidable_xxxxx` 临时文件，长期使用累积数百个文件
**根因**：server.js handleUploadWithConfirm 的 finally 块引用 `req.files?.file`，但 formidable 解析的 files 是局部变量 `const [fields, files] = ...`，从未写入 `req.files`。`req.files` 永远是 undefined，清理代码永不执行
**解决方案**（v5.34.0）：try 之前声明 `let uploadedFiles = null`，formidable 解析后 `uploadedFiles = files`。finally 块遍历 `uploadedFiles` 所有字段（file/gcode/等）清理临时文件

---

#125 ✅
**现象**：AI Lab G-code 文件列表加载缓慢，大文件（>50MB）加载时内存占用飙升
**根因**：slice_agent.js listGcodeFiles L1466 用 `fs.readFileSync(filePath, "utf-8", { start: 0, end: 32768 })` 只想读前 32KB 做格式检测，但 `readFileSync` 不支持 `start/end` 选项（这是 `createReadStream` 的选项），整个文件被读入内存
**解决方案**（v5.34.0）：改用 `fs.openSync` + `fs.readSync(fd, buf, 0, 32768, 0)` 只读前 32KB，finally 块 `fs.closeSync(fd)`

---

#126 ✅
**现象**：AI 优化返回 `add_retract` 补丁后，回抽未生效；即使指定 `min_travel_length: 5.0`，所有 travel 都被加回抽；OrcaSlicer gcode（用 G1 travel）完全不匹配
**根因**：slice_agent.js add_retract L1568-1586 三处 bug：1) 回抽行 `G1 E-...` 插在 travel 行**之后**（应在之前，否则拉丝已发生）；2) `min_travel_length` 被解构但从未使用，所有 travel 都加回抽；3) 正则 `/G0\s+X.../` 只匹配 G0，OrcaSlicer 用 G1 travel 不匹配
**解决方案**（v5.34.0）：重写 add_retract：1) 回抽插在 travel 之前；2) 跟踪 curX/curY 计算实际 travel 距离，用 `min_travel_length`（默认 5.0）过滤短距离 travel；3) 正则改为 `/G[01]\s+X.../` 同时匹配 G0/G1

---

#127 ✅
**现象**：AI 诊断 G-code 时 `stats.retracts` 数值虚高，简单模型也报告"回抽次数过多"
**根因**：slice_agent.js extractGcodeStats L1122-1130 检测回抽逻辑 `if (e < lastE) stats.retracts++`。但每层插入的 `G92 E0`（重置 E 起点）会使 e=0 < lastE（如 100），被误计为回抽。每层一个 G92 E0 就误计一个回抽，N 层模型虚增 N 次回抽
**解决方案**（v5.34.0）：在 E 检测前加 `G92 E<value>` 检测分支，匹配到 G92 E 时只更新 `lastE` 不计 retract/extrusion。正则 `/^G92\s+.*?\bE(-?[\d.]+)/i` 兼容 `G92 E0` 和 `G92 X0 Y0 E0`

---

#128 ✅
**现象**：AI 打印助手流式问答使用后，`qaStreams` Map 持续增长，长时间运行 Bridge 内存占用递增
**根因**：slice_agent.js printQAStream 后台 IIFE 完成后设置 `streamState.done=true`，但仅依赖 `cleanupQAStream(streamId)` 主动调用清理。客户端关闭浏览器或网络中断后不再轮询，streamState 永远留在 Map 中
**解决方案**（v5.34.0）：IIFE 加 finally 块，`setTimeout(() => qaStreams.delete(streamId), 30000)` 兜底清理，给客户端 30 秒窗口拉取最终状态后自动驱逐

---

#129 ✅
**现象**：WebUI 长时间运行后 `<head>` 累积大量 `<script>` 标签，DOM 节点数持续增长
**根因**：webui.html loadJS L585 每次 JSONP 调用 `document.head.appendChild(s)` 添加新 script 标签，但从不 remove。每次状态轮询、每次 bridgeGET 都会添加一个死 script 标签
**解决方案**（v5.34.0）：loadJS 提取 `cleanup` 函数，在 JSONP 回调（`window[cbName]`）和 `s.onerror` 中同时 `delete window[cbName]` 和 `s.parentNode.removeChild(s)`

---

#130 ✅
**现象**：Bridge WebSocket 偶发异常时 WebUI 状态机卡死，温度/进度不再更新，需刷新页面
**根因**：webui.html ws.onmessage L1177 直接 `var m=JSON.parse(e.data)` 无 try/catch。若服务端推送非 JSON 数据或结构异常（如 Klipper 推送 notify_status_update 缺 params），JSON.parse 抛异常后 onmessage 后续代码不执行，状态机失同步
**解决方案**（v5.34.0）：ws.onmessage 整体包裹 try/catch，异常时 `console.error('[Bridge] WS message parse error:', err)` 不抛出，状态机继续运行

---

#131 ✅
**现象**：运行 `reinstall.bat` 重装 Bridge 时，[4/10] 复制 bridge 目录报错 `拒绝访问`，文件被 node.exe 锁定
**根因**：reinstall.ps1 [2/10] 只停了 bridge 进程，没停 watchdog 计划任务。watchdog 每 2 分钟检测 bridge 是否存活，reinstall 中途（bridge 已停但未完成复制）watchdog 触发，拉起新 bridge 进程锁定文件，导致后续复制失败
**解决方案**（v5.34.0）：reinstall.ps1 [2/10] 开头先 `Stop-ScheduledTask` + `Unregister-ScheduledTask` 停 watchdog；[10/10] 启动 bridge 后重新 `Register-ScheduledTask` 恢复 watchdog

---

#132 ✅
**现象**：slice_agent.js 文件 3066 行，但其中约 1448 行（47.2%）是死代码，维护成本高且影响代码可读性
**根因**：v5.25.0 移除 AI 切片模式后，整个 AI 切片流水线函数链（analyzeModel→sliceModel→suggestParameters→generateGcodeFromAnalysis→advancedSlice 等）变为死代码，但函数本身未被清理。非流式 printQA 被流式版本取代后也成死代码。saveStlFile/listStlFiles 是别名从未被调用
**解决方案**（v5.35.0）：删除 22 个死函数/常量（updateMemory/analyzeModel/sliceModel/parseSliceOutput/computeSliceAnalysis/suggestParameters/generateGcodeFromAnalysis/aiComputeOverrides/validateGcode/reviewGcode/generateRecommendationReason/saveModelFile/saveStlFile/getStlInfo/listModelFiles/listStlFiles/regenerateFromRawPath/advancedSlice/printQA/SLICE_FILAMENT_RULES/sliceJobs/createJobId）。同步清理 buildSystemPrompt 死任务类型分支和 module.exports。最终 1618 行

---

#133 ✅
**现象**：server.js 有 10 个死端点，前端 ailab.js/gcvt.js/webui.html 均不调用，占用代码空间且增加攻击面
**根因**：v5.25.0 移除 AI 切片模式后，8 个 AI 流水线端点（upload_model/analyze/suggest_params/ai_slice/review_gcode/patch_gcode/print_qa/advanced_slice）无前端入口。bridge/status 和 bridge/disconnect 无 .js 版本，bridgeGET/bridgePOST 机制无法触达
**解决方案**（v5.35.0）：删除全部 10 个死端点。保留 patchGcode 函数（被 optimizeGcode 调用）和 extractGcodeStats 函数（被 optimizeGcode 调用）

---

#134 ✅
**现象**：webui.html 文件列表和打印模态框中，文件名和耗材类型直接拼接进 innerHTML 未转义。恶意文件名（如 `<script>alert(1)</script>.gcode`）或篡改的耗材类型可注入 HTML/JS
**根因**：webui.html L861-865 文件列表 name/f.path、L945 打印模态框 name、L977 gType、L985 mFilTypes/mFilSub、L998 mT/mS 均直接字符串拼接进 innerHTML，无 HTML 转义
**解决方案**（v5.35.0）：新增 `escHtml(s)` 辅助函数（转义 &<>"'）；6 处 innerHTML 拼接点均用 escHtml 包裹数据

---

#135 ✅
**现象**：ailab.js 和 gcvt.js 多处 innerHTML 拼接未转义，可被注入恶意内容
**根因**：1) ailab.js aiRenderInline/aiRenderChatMessage 代码块（```code```）在第一次 HTML 转义后又反向解码 `&lt;/&gt;` 还原为 `</>`，AI 返回 `<script>` 标签可直接执行；2) ailab.js L397 下载失败 errMsg 未转义；3) gcvt.js L147 加载失败错误信息、L199 温度/工具值未转义
**解决方案**（v5.35.0）：1) 删除 aiRenderInline/aiRenderChatMessage 代码块反向解码（保持转义状态）；2) 新增 aiEscapeHtml/gcvtEsc 辅助函数；3) 所有错误信息和动态值用转义函数包裹

---

#136 ✅
**现象**：slice_agent.js 中 testAiConnection / optimizeGcode / printQAStream 三个函数有约 50 行重复的 AI 调用样板代码（provider 解析、headers 构造、/chat/completions POST、错误处理），且错误处理风格不一致——testAiConnection 用 `return {ok:false, error:e.message}`、printQAStream 用简化版 `e.message||String(e)` 丢失 cause 链（node-fetch 网络错误的真正原因在 `e.cause` 中），导致本地 LLM 连接失败时只显示 "request to ... failed, reason:" 无具体原因
**根因**：v5.20.0 引入 AI Lab 时三个函数分别实现，未抽象公共调用层；extractErrorMessage 仅在 testAiConnection 中定义，其他函数各自简化处理
**解决方案**（v5.36.0）：提取 `bridge-node/aiClient.js` 公共模块（150 行），导出 `AiClient` 类 + `AI_PROVIDERS` + `extractErrorMessage`。AiClient 封装 provider 解析/凭证校验/headers 构造/chat/models 请求，extractErrorMessage 统一为 `e.message || e.cause?.message || e.cause?.code || String(e)`。三函数改造：testAiConnection 45→15 行、optimizeGcode AI 调用段 40→6 行、printQAStream AI 调用段 25→3 行

---

#137 ✅
**现象**：ailab.js optimize_gcode 调用前端拼接了 4 个多余 query 参数（provider/customBaseUrl/model/api_key），后端 server.js optimize_gcode 端点完全不读取这些参数（直接用全局 aiConfig），其中 api_key 通过 GET URL 明文传递有泄露风险（浏览器历史、服务器 access log、Referer header 均可能记录）
**根因**：v5.20.0 初版 AI Lab 前端按"全配置透传"思路实现，未确认后端实际只读 gcode_name 一个参数；v5.27.0 改为服务端存储 aiConfig 后未清理前端多余参数
**解决方案**（v5.36.0）：ailab.js L456-460 删除 4 行参数拼接，optimize_gcode 调用只传 `?gcode_name=`。aiConfig 已在服务端全局持有，无需前端透传

---

#138 ✅
**现象**：AI 打印助手问答始终显示"AI 返回了空响应，请重试"，LMStudio 后台正常收到请求并返回流式响应但前端无内容。日志显示每次 qa_stream_start 后只 poll 1 次就停止（正常应每 200ms 持续轮询直到 done）
**根因**：
1. **后端流式读取失败**：`slice_agent.js printQAStream` 用 `resp.body.getReader()` 读取 node-fetch v2 的流式响应，但 node-fetch v2 的 `resp.body` 是 Node.js Readable stream（继承 `stream.Readable`），不是 Web ReadableStream，`getReader()` 方法不存在，调用时抛 `TypeError: resp.body.getReader is not a function`（与 traps.md #114 同类问题，v5.28.1 修了 gcode 下载场景但 printQAStream 漏修）。IIFE catch 捕获异常设置 `streamState.error` + `streamState.done=true`，导致第一次 poll（300ms 后）就收到 `done=true`
2. **前端吞掉错误**：`ailab.js` done 分支只检查 `answerText` 是否为空，不检查 `pd.error`，即使后端返回了错误信息也显示"AI 返回了空响应"而非实际错误
**解决方案**（v5.36.1）：
1. **后端**：流式读取从 `resp.body.getReader()` + `while(true) reader.read()` 改为 `for await (const chunk of resp.body)` async iterator。Node.js Readable stream 从 v10 起支持 `Symbol.asyncIterator`，Web ReadableStream 从 ES2018 起支持，两者双兼容。IIFE catch 加 `log("ERROR", ...)` 便于排查
2. **前端**：done 分支检查 `pd.error`，有错误时显示 `[错误: ...]` 而非"空响应"；`qa_stream_start` 调用删除多余的 provider/customBaseUrl/model query 参数（和 optimize_gcode 一致，后端不读取）

---

#148 ✅
**现象**：网友反馈 G-code 上传失败，BambuStudio 报 `HTTP 500: {"error":"Upload failed: The user aborted a request."}`
**根因**：v5.37.2 代码审查修复 M2（traps.md #144）时，给上传操作加了 `fetchWithTimeout(..., 120000)`（120 秒固定超时）。大 G-code 文件（50-100MB）在慢 WiFi 下上传可能超过 120 秒，超时触发 `controller.abort()`，node-fetch 抛出 AbortError（message: "The user aborted a request"），catch 后返回 HTTP 500。同样问题影响 AI Lab 上传端点（L1151）和 G-code 下载端点（L1337，60s 超时）
**解决方案**（v5.37.3）：上传和下载操作改回裸 `fetch`（无超时）。文件大小 × 网速不可控，固定超时不合理；Moonraker 离线时 TCP 会快速失败（RST/FIN），无需超时保护。列表操作（list_printer_gcode）保留 10s 超时（轻量操作）

---

#149 ✅
**现象**：AI Lab（G-code 优化 + 打印助手）和 G-code 转换面板的所有用户可见文本为硬编码中文，切换 WebUI 语言到英文时这两个面板不跟随切换
**根因**：`ailab.js` / `gcvt.js` 使用 IIFE `(function initAILab(){...})()` 在加载时一次性注入 innerHTML，文本硬编码中文；`webui.html` 的 `setLang()` 只更新 `[data-i18n]` 元素，不重新渲染这两个面板；IIFE 无法重复调用
**解决方案**（v5.38.0）：
1. **翻译函数**：新增 `aiT(zh, en)` / `gcvtT(zh, en)`，读取 `window.curLang`（'zh'/'en'）返回对应语言文本
2. **IIFE 改为可重调用函数**：`(function initAILab(){...})()` → `function initAILab(){...}` + `initAILab();`，gcvt 同理。重新渲染前清除旧 modals（`['aiConfigModal','aiErrorModal','qaFab','qaPopup'].forEach` remove）避免重复注入
3. **语言应用函数**：新增 `aiApplyLang()` / `gcvtApplyLang()`，重新调用 init 函数渲染面板；state 变量（`aiOptState` / `gcvtState` 等）在外层声明，重新渲染时保留
4. **setLang 集成**：`webui.html setLang()` 末尾调用 `if(typeof aiApplyLang==='function')aiApplyLang(); if(typeof gcvtApplyLang==='function')gcvtApplyLang();`
5. **文本替换**：ailab.js ~60 个文本点、gcvt.js ~30 个文本点，innerHTML 中用 `'+aiT('中文','English')+'` 拼接，动态 JS 中用 `aiT('中文','English')` 直接调用

---

#150 ✅
**现象**：用户在打印确认弹窗中无法得知 G-code 是 BambuStudio 还是 OrcaSlicer 格式，可能误传 BambuStudio 格式文件到设备触摸面板导致"未识别的gcode类型"错误（traps.md #103）
**根因**：`webui.html showPrintDialog` 只显示文件名/耗材映射，不检测 G-code 格式；虽有 G-code 转换功能（gcvt 面板）但用户不知何时需要使用
**解决方案**（v5.38.0）：
1. **后端端点**：`server.js` 新增 `/api/ai/check_gcode_format.js` JSONP 端点，用 HTTP Range 请求（`Range: bytes=0-32767`）从 Moonraker 下载 G-code 前 32KB，复用 #116 验证的检测逻辑（`; FEATURE:` = bambu，`;TYPE:` = orca），返回 `{ok:true, format:"bambu"|"orca"|"unknown"}`
2. **弹窗格式标识**：`showPrintDialog` 在 gcode_info 区域添加 `#gcodeFormatInfo` 占位（"检测格式中.../Detecting format..."），末尾异步调用端点：OrcaSlicer 格式显示绿色 ✓ 兼容；BambuStudio 格式显示橙色 ⚠ 警告 + "前往转换 →" 链接（`onclick="closePrintModal(true);switchTab('gcvt')"`）；未知格式显示灰色提示
3. **Range 请求优势**：只下载前 32KB 而非完整文件（可能 50-100MB），格式标记在文件头部，检测快速且省带宽

---

#142 ✅
**现象**：server.js `renderSetupPage()` 的 mDNS 扫描结果页面中，`p.name` 和 `p.ip` 未转义直接拼入 `innerHTML`（L1430）。同一局域网的攻击者只需广播一个恶意的 mDNS 服务名（如 `<img src=x onerror="...">`），当用户在 setup 页面点击 "Scan Network" 时，恶意 JS 在 bridge 的 origin（localhost）下执行，可窃取配置或重定向打印机连接
**根因**：setup 页面的内联 `<script>` 中直接用 `+p.name+` 和 `+p.ip+` 拼接 HTML，未调用任何转义函数。mDNS `service.name` 由 LAN 上的设备广播，完全可控
**解决方案**（v5.37.2）：在 setup 页面 `<script>` 开头添加 `escHtml(s)` 函数（转义 `& < > " '`），将所有 innerHTML 中的 `p.name`/`p.ip` 替换为 `escHtml(p.name)`/`escHtml(p.ip)`（包括 `data-ip` 属性中的 `p.ip`）

---

#143 ✅
**现象**：dialog.js `fetchPrintTask` 仍使用 node-fetch v2 非标准的 `timeout: 5000` 选项（L18），v5.37.0 标准化了 server.js 中 8 处但遗漏了此处。node-fetch v3 和 Node.js 内置 fetch 会静默忽略此选项，导致 Moonraker 不可达时 `fetchPrintTask` 无限挂起，阻塞打印确认对话框
**根因**：v5.37.0 fetchWithTimeout 标准化时只检查了 server.js，未检查 dialog.js
**解决方案**（v5.37.2）：在 `fetchPrintTask` 中改用 `AbortController` + `signal`（与 `fetchWithTimeout` 相同模式），5 秒超时

---

#144 ✅
**现象**：server.js 三处 AI Lab 端点使用裸 `fetch` 无超时保护：1) `upload_to_printer`（L1139）；2) `list_printer_gcode`（L1288）；3) `fetch_printer_gcode`（L1324）。Moonraker 响应缓慢或网络中断时请求无限挂起，JSONP 响应永不返回，前端 `<script>` 标签永久 pending
**根因**：v5.37.0 标准化了 Moonraker 相关的 fetch 调用，但这三处 AI Lab 端点的 fetch 被遗漏
**解决方案**（v5.37.2）：三处 `fetch` 替换为 `fetchWithTimeout`：上传 120s（大文件）、列表默认超时（10s）、下载 60s

---

#145 ✅
**现象**：webui.html 文件列表 L866 `escHtml(f.path).replace(/'/g,"\\'")` 双重转义失效导致 XSS。`escHtml` 先将 `'` 转为 `&#39;`，后续 `.replace(/'/g,"\\'")` 找不到字面 `'` 是空操作。但浏览器解析 HTML 属性 `onclick="printFile('...')"` 时将 `&#39;` 解码回 `'`，可闭合 JS 字符串。攻击向量：打印机上存在文件名含 `'` 的 G-code（如 `test');alert(1);//.gcode`），用户打开文件列表时触发任意 JS 执行
**根因**：转义顺序错误——应先 JS 转义再 HTML 转义，或完全避免内联 JS 字符串拼接
**解决方案**（v5.37.2）：改用 `data-path="'+escHtml(f.path)+'"` 属性 + `onclick="printFile(this.dataset.path)"`。浏览器自动解码 HTML 实体后通过 `dataset.path` 获取原始值，无注入风险

---

#146 ✅
**现象**：ailab.js `aiEscapeHtml`（L879）和 gcvt.js `gcvtEsc`（L11）只转义 4 个字符（`& < > "`），缺少 `'` → `&#39;`，与 webui.html `escHtml` 的 5 个字符不一致。当前用途下（内容进入 innerHTML 文本节点）风险较低，但是一个不一致的"地雷"——未来如果开发者将输出放入单引号属性上下文就会触发 XSS
**根因**：v5.35.0 XSS 修复时未统一所有转义函数
**解决方案**（v5.37.2）：两个函数都补齐 `.replace(/'/g,'&#39;')`，与 `escHtml` 保持一致

---

#147 ✅
**现象**：server.js `confirm_print.js` 和 `start_print.js` 端点从 GET URL query 参数 `extruder_map_table` 直接 `JSON.parse`，无长度限制和类型校验（L447-448、L485-486）。攻击者可发送超长 query 参数导致 `JSON.parse` 消耗大量 CPU/内存（DoS），或传入非数组类型导致后续 `.map()` 崩溃
**根因**：Express 默认不对 query string 设长度上限，解析后未校验类型
**解决方案**（v5.37.2）：添加 `length > 4096` 检查（抛出 "too large"）+ `Array.isArray` 校验（抛出 "not an array"），catch 分支将 mapTable 重置为 `[]`

---

#141 ✅
**现象**：G-code 转换工具转换后的文件 `EXECUTABLE_BLOCK` 只包含启动代码（~80 行），`PRINT_END` 和整个打印过程在 `EXECUTABLE_BLOCK` 之外。对比 OrcaSlicer 原生文件，其 `EXECUTABLE_BLOCK` 包含了从 `PRINT_START` 到 `PRINT_END` 的整个打印过程。这可能导致 U1 设备面板无法正确识别打印范围。
**根因**：`slice_agent.js convertGcodeContent` 函数在 `newExecBlock` 末尾添加了 `EXECUTABLE_BLOCK_END`（L1356），然后删除了 printBody 中的原始 `EXECUTABLE_BLOCK_END`（L1417），导致 EXEC 块只包含 OrcaSlicer 启动代码，body 在 EXEC 外。
**解决方案**（v5.37.1）：1) `newExecBlock` 不再添加 `EXECUTABLE_BLOCK_END`；2) 在 `convertedBody` 末尾（PRINT_END 之后）添加 `EXECUTABLE_BLOCK_END`，包裹整个打印过程（EXEC_START → 启动代码 → body → PRINT_END → EXEC_END），与 OrcaSlicer 原生格式一致。新增单元测试验证 EXEC_END 在 PRINT_END 之后。

---

#139 ✅
**现象**：server.js 中 8 处 fetch 调用使用 node-fetch v2 非标准的 `timeout` 选项（`fetch(url, { timeout: 10000 })`），这是 v2 专有 API，node-fetch v3 和 Node.js 内置 fetch 均不支持。未来升级 node-fetch 或切换内置 fetch 时所有超时将失效
**根因**：node-fetch v2 在 options 中提供了非标准的 `timeout` 字段，但这不是 Fetch 规范的一部分。标准做法是使用 `AbortController` + `signal`
**解决方案**（v5.37.0）：新增 `fetchWithTimeout(url, options, timeoutMs)` helper 函数，内部用 `AbortController` + `setTimeout` 实现超时，返回标准 fetch Promise。8 处 fetch 调用全部替换：moonrakerFetch / proxy.js / init-data.js / check_update / cam_snapshot / upload / proxyToMoonraker / webcam proxy。未升级 node-fetch 版本（v3 是纯 ESM，不兼容 CommonJS 项目），但专有 API 依赖已消除

---

#140 ✅
**现象**：patchGcode 和 convertGcode 函数将文件 I/O（读文件 + 写文件）和核心逻辑混在一起，无法直接单元测试。测试需要创建临时文件、设置目录路径，脆弱且慢
**根因**：v5.20.0 初版实现时函数直接操作文件系统，未分离 I/O 和逻辑
**解决方案**（v5.37.0）：提取纯函数 `patchGcodeContent(content, patchPlan)` 和 `convertGcodeContent(content)`，只接受字符串内容、返回结果字符串，无文件 I/O 副作用。原 patchGcode/convertGcode 改为读文件 + 调用纯函数 + 写文件的薄包装。纯函数导出到 module.exports 供测试直接调用，28 个单元测试覆盖 5 种 patch 操作 + 格式检测 + 转换逻辑