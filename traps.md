# BambuStudio 第三方打印机适配踩坑记录

> 编号递增，三段式：现象→根因→解决方案。用 `---` 分隔。
> 状态标记：✅ 已解决 / ⚠️ 部分解决 / ❌ 未解决

---

## 索引（按类别）

### BambuStudio 配置系统
#1 跨厂商继承不支持 | #2 filament_list 加载顺序 | #3 PowerShell JSON 格式错误 | #4 AppConfig filaments 缓存 | #5 compatible_printers_condition | #6 厂商匹配检查 | #7 删除 models 段 | #8 Copy-Item 嵌套 | #9 user/default 残留 | #10 conf 写入时机 | #11 filament_vendor 缺失 | #20 只看 @U1 不够 | #21 Orca GitHub 过时

### G-code 与打印流程
#12 换色温度不够停机 | #13 auxiliary_fan=0 | #14 enable_pre_heating=0 | #15 preheat delta 符号 | #16 ooze_prevention 与擦料塔互斥 | #22 retract_length_toolchange | #23 Support PLA-PETG 继承错误 | #24 required_nozzle_HRC | #55 G-code 布尔参数格式 | #103 设备面板不识别 BambuStudio gcode | #105 打印层进度不显示

### 耗材参数
#17 跨材料基类参数缺失 | #18 Snapmaker 基础耗材缺覆盖 | #19 filament_type 缺失

### 热床与 3D 显示
#26 bed_model/bed_texture 为空 | #27 SVG 不渲染 | #41 STL 不居中 | #50 热床模型高度

### Bridge 代理与通信
#28 WebView 不注入 API Key | #29 网络插件签名验证 | #30 /moonraker/ 前缀不工作 | #31 /ws 路径错误 | #62 Express 5 {*path} 数组 | #63 /access/token 拦截 | #64 热床温度不显示 | #70 中间件顺序 | #71 只转发 content-type | #72 Fluidd SPA 404 | #73 WS 缺错误处理 | #94 温度不自动更新

### 打印确认流程
#47 print_stats 初始查询缺失 | #48 切片不触发确认 | #49 confirm_print 参数解析 | #51 start_local_print 不支持 HTTP | #52 WebUI 未加载通知丢失 | #53 gcode/script HTTP 不可用 | #54 无安全检测 | #56 print_host 被覆盖 | #57 gcode() 用不存在的 HTTP | #58 用户预设覆盖 print_host | #59 python-multipart 缺失 | #61 弹窗体验 | #89 布尔值回归 | #91 JSON-RPC 方法名错误 | #92 热床调平参数名（BED_LEVEL） | #96 耗材匹配缺失 | #97 bridgePOST 数组参数 | #101 MAP_TABLE 不更新 reprint_info | #102 SET_PRINT_USED_EXTRUDERS 参数格式

### 摄像头（重点）
#37 webcams/list 返回空 | #39 MJPEG 流代理不工作 | #46 U1 用 snapshot 轮询 | #65 代理破坏二进制 JPEG | #67 Express ETag 缓存 | #85 camera.start_monitor 必须走 WS | #90 摄像头监控需服务端触发 | #93 摄像头参数缺失（domain）

### WebUI 前端
#34 Flutter Web DOM 不可读 | #38 SET_LED 缺 WHITE | #40 filament_feed 无类型 | #66 WS 竞态条件 | #78 Fluidd SW 拦截 fetch | #79 WebView 阻止 fetch/XHR | #82 event.stopPropagation | #83 gcode() 不返回值 | #84 EXTRUDER vs INDEX | #95 风扇控制参数范围 | #99 耗材类型品牌前缀 | #100 WebView 外部链接拦截 | #101 MAP_TABLE 不更新 reprint_info | #102 SET_PRINT_USED_EXTRUDERS 参数格式 | #104 颜色匹配精度不足

### 安装与部署
#32 系统无 Python | #33 Fluidd hosted 模式 | #35 CWD 指向已删目录 | #36 curl 下载失败 | #42 Bridge 依赖原目录 | #43 Program Files 权限 | #44 需手动启动 | #45 VBS 权限 | #60 Python 嵌入式限制 | #68 formidable 构造函数 | #69 bridge/web 未复制 | #74 undici 未声明 | #75 node-fetch 不兼容 undici | #76 undici 不导出 Blob | #77 旧进程未重启 | #80 mDNS 端口错误 | #81 VBS 裸 node 命令

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
**解决方案**：install/uninstall 脚本扫描 `user\default` 删除含 "Snapmaker" 或 "@U1" 的 JSON

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

#25 ⚠️ BambuStudio 源码限制（同 #16 合并）

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