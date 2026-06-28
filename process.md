# Snapmaker U1 BambuStudio 兼容包

## 项目目标
将 Snapmaker U1 3D 打印机配置集成到 BambuStudio 中，实现切片功能 + 原生级设备控制体验

## 当前版本: v5.37.2 (2026-06-29)

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
- AI 实验室（G-code 优化 + 打印助手，流式输出 + Thinking 模式，Workspace Markdown 系统）
- G-code 转换（独立侧栏标签页，BambuStudio→OrcaSlicer 兼容格式转换）
- 单元测试覆盖（node:test 框架，29 个测试覆盖 patchGcodeContent + convertGcodeContent 纯函数）

### ✅ 打印流程（对齐 OrcaSlicer）
1. `SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=x MAP_EXTRUDER=y` — 设置映射
2. `SET_PRINT_USED_EXTRUDERS EXTRUDERS=0,1` — 标记使用的物理挤出头
3. `SET_PRINT_PREFERENCES BED_LEVEL=1 FLOW_CALIBRATE=1 TIME_LAPSE_CAMERA=1` — 设置打印选项
4. `printer.print.start` — 开始打印

> 注：不使用 `SET_PRINT_FILAMENT_CONFIG`（会覆盖设备物理耗材信息）和 `SET_PRINT_TASK_PARAMETERS`（MAP_TABLE 不更新 reprint_info）。见 traps.md #101、#106

### ✅ 耗材匹配
- 类型优先匹配（extractFilType 提取核心关键词）
- 同类型中 CIEDE2000 颜色相近优先（Lab 色彩空间，对齐 OrcaSlicer）
- 用户可手动选择映射

### ❌ 已知限制
1. **设备面板直接打印 BambuStudio gcode**：闭源触摸屏固件检查 `;TYPE:` 层标记（BambuStudio 用 `; FEATURE:`），提示"未识别的gcode类型"。可通过 AI Lab G-code 转换功能解决，或通过 WebUI 打印。见 traps.md #103
2. **旧 gcode 无层进度**：`layer_change_gcode` 修复只影响新切片的 gcode，旧文件需重新切片。见 traps.md #105

### 📝 下一步
1. 对齐 OrcaSlicer 挤出头取出/放回功能（server.js 中无相关代码，未开始）
2. 优化 knowledge.md 按技能按需注入（当前全量 1254 行，每次 AI 调用消耗约 4000-6000 tokens）
3. 扩充单元测试覆盖面（当前覆盖 patchGcode/convertGcode 纯函数，可扩展至 CIEDE2000 颜色匹配、extractGcodeStats 等）

### 🔍 代码审查待改进项（v5.37.2 审查后剩余）
| # | 问题 | 重要性 | 必要性 | 说明 |
|---|------|--------|--------|------|
| 3 | knowledge.md 全量注入 system prompt | 中 | 中 | 1254 行全量注入，每次 AI 调用消耗约 4000-6000 tokens。可优化为按技能按需注入相关段落 |
| 4 | JSONP 错误处理薄弱 | 中 | 低 | `<script>` 标签加载时服务端 500 或超时只能靠 timeout 回调，用户看到"未知错误"。受限于 BambuStudio WebView 限制，改造成本高 |
| 6 | slice_agent.js 单文件 ~1618 行 | 低 | 低 | v5.35.0 已从 2880 行减至 1618 行（-47%）。代码组织偏好，非 bug。拆分引入大量 diff 增加回归风险 |
| 7 | API Key 明文存储 | 低 | 低 | 配置在 `%APPDATA%\BambuStudio-Bridge\bridge_config.json`，本地单用户工具，攻击者能读此文件已能做更多事 |

> 已解决项：#1 node-fetch timeout（v5.37.0 fetchWithTimeout）、#2 无自动化测试（v5.37.0 29 个单元测试）、#5 API Key GET URL 泄露（v5.36.0）、#8 PS1 重复代码（v5.36.0 install-common.psm1）、#9 patchGcodeLayout 嵌套（v5.37.0 顶层函数）

---

## 版本历史

### v5.37.2 (2026-06-29) — 全量代码审查安全修复
全量代码审查发现 1 个 High + 5 个 Medium + 1 个 Low 安全/正确性问题，全部修复（traps.md #142-#147）。

**High（1 项）**：
- setup 页面 mDNS 扫描结果 XSS（#142）：`p.name`/`p.ip` 未转义直接拼入 innerHTML，同一局域网攻击者可广播恶意 mDNS 服务名执行任意 JS。添加 `escHtml` 函数转义所有插入点

**Medium（5 项）**：
- dialog.js `fetchPrintTask` 遗漏 timeout 标准化（#143）：仍用 node-fetch v2 非标准 `timeout` 选项，改用 AbortController
- server.js 三处 AI Lab 端点裸 `fetch` 无超时（#144）：upload_to_printer / list_printer_gcode / fetch_printer_gcode，替换为 `fetchWithTimeout`（120s/默认/60s）
- webui.html 文件列表双重转义失效导致 XSS（#145）：`escHtml(f.path).replace(/'/g,"\\'")` 中 replace 是空操作（`'` 已被 escHtml 转为 `&#39;`），浏览器解码 `&#39;` 后闭合 JS 字符串。改用 `data-path` 属性 + `onclick="printFile(this.dataset.path)"`
- ailab.js/gcvt.js 转义函数缺单引号转义（#146）：`aiEscapeHtml`/`gcvtEsc` 只转义 4 个字符（`& < > "`），与 `escHtml` 的 5 个不一致，补齐 `'` → `&#39;`
- server.js `extruder_map_table` GET query 无大小限制（#147）：添加 4096 字节长度限制 + Array 类型校验，防止 DoS 和类型错误崩溃

**Low（1 项）**：
- webui.html 打印机设置弹窗 `curHost`/`curPort` 未转义拼入 input value 属性，用 `escHtml` 转义

**验证**：29 个单元测试全部通过；所有 JS 文件 `node --check` 通过；14 处版本号统一到 v5.37.2

### v5.37.1 (2026-06-29) — 修复 G-code 转换 EXECUTABLE_BLOCK 范围错误
**问题**（traps.md #141）：对比 BambuStudio 原始 / 转换后 / OrcaSlicer 原生三个 G-code 文件发现，转换后文件的 `EXECUTABLE_BLOCK_END` 在启动代码后（L119），而 `PRINT_END` 在 L561333（在 EXEC 块外）。OrcaSlicer 原生和 BambuStudio 原始的 `EXECUTABLE_BLOCK` 都包含整个打印过程（EXEC_START → 启动代码 → 打印过程 → PRINT_END → EXEC_END）。

**根因**：`convertGcodeContent` 在 `newExecBlock` 末尾添加了 `EXECUTABLE_BLOCK_END`（L1356），然后删除了 printBody 中的原始 `EXECUTABLE_BLOCK_END`（L1417），导致 EXEC 块只包含启动代码。

**修复**：
1. `newExecBlock` 不再添加 `EXECUTABLE_BLOCK_END`（移到 body 末尾）
2. 在 `convertedBody` 末尾（PRINT_END 之后）添加 `EXECUTABLE_BLOCK_END`，包裹整个打印过程
3. 新增单元测试验证 `EXECUTABLE_BLOCK_END` 在 `PRINT_END` 之后

**验证**：29 个单元测试全部通过；14 处版本号统一到 v5.37.1

### v5.37.0 (2026-06-29) — 阶段 4：单元测试 + fetch 超时标准化 + 代码组织
全量代码审查后系统性优化的第四阶段，添加单元测试回归保护网 + 消除 node-fetch v2 专有 API + 提取嵌套函数（traps.md #139）。

**单元测试**（待改进项 #2 解决）
- 新建 `bridge-node/test/` 目录，使用 Node.js 18+ 内置 `node:test` 框架（零依赖）
- 新增 `test/patch_gcode.test.js`（17 个测试）：覆盖 patchGcodeContent 5 种操作（replace_speed / add_retract / replace_fan / modify_temperature / insert_line）+ 边界情况（空 patchPlan / null / 缺失参数）+ mm/s 自动转换 + overhang 区域定向替换 + 短行程过滤 + 自定义 min_travel_length + 多层温度替换
- 新增 `test/convert_gcode.test.js`（11 个测试）：覆盖 convertGcodeContent 格式检测（无效格式 / 已是 OrcaSlicer / 无层标记）+ 成功转换（; FEATURE: → ;TYPE: 替换 / EXEC 块重建 / 布局重排 / 温度提取 / 层数统计 / 工具检测 / 缺失 THUMB/CONFIG 块 / End G-code 生成）
- package.json 新增 `"test": "node --test test/"` 脚本
- **重构**：提取 `patchGcodeContent(content, patchPlan)` 和 `convertGcodeContent(content)` 纯函数（无文件 I/O），原 patchGcode/convertGcode 改为读文件 + 调用纯函数 + 写文件。纯函数导出供测试直接调用

**node-fetch timeout → AbortController**（待改进项 #1 解决）
- 新增 `fetchWithTimeout(url, options, timeoutMs)` helper：用标准 AbortController + signal 替代 node-fetch v2 非标准的 `timeout` 选项，兼容 node-fetch v2/v3 + Node.js 内置 fetch
- 替换 server.js 中 8 处 `fetch(..., { timeout: X })` 调用：moonrakerFetch / proxy.js / init-data.js / check_update / cam_snapshot / upload / proxyToMoonraker / webcam proxy
- 不升级 node-fetch 版本（v3 是纯 ESM，当前项目是 CommonJS，升级需大规模重构动态 import，风险高无性能收益）

**patchGcodeLayout 提取**（待改进项 #9 解决）
- 从 server.js `handleUploadWithConfirm` 请求处理函数内提取 `patchGcodeLayout` 为顶层函数，添加 JSDoc 注释
- 删除原嵌套定义中未使用的 `betweenBlocks` 变量

**验证**：28 个单元测试全部通过；`node --check` 通过；14 处版本号统一到 v5.37.0

### v5.36.1 (2026-06-29) — 修复 AI 问答流式空响应
**问题**（traps.md #138）：AI 问答始终返回"AI 返回了空响应，请重试"，LMStudio 后台正常但前端无内容。

**根因**：
1. **后端**：`printQAStream` 用 `resp.body.getReader()` 读取流式响应，但 node-fetch v2 的 `resp.body` 是 Node.js Readable stream（非 Web ReadableStream），`getReader()` 可能不存在导致 TypeError，IIFE catch 设置 `done=true` + `error`
2. **前端**：`ailab.js` done 分支只检查 `answerText` 是否为空，不检查 `pd.error`，错误信息被吞掉显示"空响应"

**修复**：
- **slice_agent.js**：流式读取从 `resp.body.getReader()` + `while(true) reader.read()` 改为 `for await (const chunk of resp.body)` async iterator（Node stream + Web ReadableStream 双兼容）；IIFE catch 加 `log("ERROR", ...)` 便于排查
- **ailab.js**：done 分支检查 `pd.error`，有错误时显示 `[错误: ...]` 而非"空响应"；`qa_stream_start` 调用删除多余的 provider/customBaseUrl/model query 参数（后端不读取，直接用全局 aiConfig）

**验证**：`node --check` 通过；14 处版本号统一到 v5.36.1

### v5.36.0 (2026-06-29) — 阶段 3：AI 调用公共模块提取 + PowerShell 脚本重构
全量代码审查后系统性优化的第三阶段，提取两个公共模块消除重复代码 + 修复 1 处 API Key 泄露风险（traps.md #136/#137）。

**AI 调用公共模块提取**（traps.md #136）
- **新增 `bridge-node/aiClient.js`**（150 行）：导出 `AiClient` 类 + `AI_PROVIDERS` + `extractErrorMessage`
  - `AiClient` 构造函数封装 provider 解析 + 凭证校验 + baseUrl 推导；本地 provider（LMStudio）跳过 API Key 检查
  - `_headers()` 统一构造 Authorization Bearer
  - `listModels()` 封装 GET /models（保留 testAiConnection 副作用：回写 provider.availableModels/defaultModel/aiConfig.model）
  - `chat({systemPrompt, userPrompt, temperature, maxTokens, stream})` 封装 POST /chat/completions，返回原始 Response（供 printQAStream IIFE 消费 reader 实现流式）
  - `static parseJsonContent(aiContent)` 剥离 ```json 围栏 + JSON.parse
  - `extractErrorMessage(e)` 统一错误提取：`e.message || e.cause?.message || e.cause?.code || String(e)`（修复原 printQAStream 丢失 cause 链问题）
- **slice_agent.js 三函数改造**：testAiConnection 45→15 行、optimizeGcode AI 调用段 40→6 行、printQAStream AI 调用段 25→3 行，错误处理全部统一用 extractErrorMessage
- **ailab.js apiKey GET 传递修复**（traps.md #137）：optimize_gcode 调用删除 4 个多余 query 参数（provider/customBaseUrl/model/api_key），后端直接用全局 aiConfig，消除 apiKey 通过 GET URL 明文传递的泄露风险

**PowerShell 脚本重构**
三个安装脚本（install.ps1 / reinstall.ps1 / uninstall.ps1）有约 500 行重复代码，提取到 `install-common.psm1` 模块（14 个公共函数，558 行），三个脚本改为 `Import-Module` 导入。

**新增模块**
- **install-common.psm1**（558 行，14 个公共函数）：Set-ConsoleUtf8 / Assert-BambuStudioNotRunning / Find-BambuStudioDir / Clear-BambuSystemCache / Clean-SnapmakerEntriesFromConf / Stop-BridgeProcess / Register-BridgeWatchdog / Unregister-BridgeWatchdog / Resolve-NodePath / Install-NpmDependencies / New-BridgeVbsLauncher / New-BridgeStartupShortcut / Remove-BridgeStartupShortcut / Start-BridgeAndWait / Copy-ProfilesToBambuDir / Patch-UserMachineConfigs
- 参数化设计：`Find-BambuStudioDir -DetectionMode Install/Uninstall`、`Stop-BridgeProcess -IncludeNodeProcess`、`Clean-SnapmakerEntriesFromConf -ShowRemovedCount`、`Register-BridgeWatchdog -ReRegister`、`New-BridgeStartupShortcut -Updated`、`Start-BridgeAndWait -StopExistingFirst`
- 异常改造：函数内 `exit 1` → `throw`（先打印消息 + Read-Host pause），调用方 `try { ... } catch { exit 1 }` 转 clean exit
- 统一启用 regex fallback：`Clean-SnapmakerEntriesFromConf` 在 JSON 解析失败时统一走 regex 清理（原 reinstall/uninstall 无此兜底）

**脚本改造**
- **install.ps1**：508 → 199 行（-60.8%），保留 [1/9]-[9/9] 编号、BBL 耗材验证、legacy config 迁移、成功横幅
- **reinstall.ps1**：524 → 228 行（-56.5%），保留 [1/10]-[10/10] 编号、-AutoConfirm 参数、[2/10] 先停 watchdog 再停 bridge（traps.md #131）、[10/10] 重注册 watchdog、两个 [4/10] 编号、-Updated 消息
- **uninstall.ps1**：236 → 157 行（-33.5%），保留 [1/7]-[7/7] 编号、兼容包存在性检查、-DetectionMode Uninstall、-IncludeNodeProcess node 进程兜底、旧 vbs 清理

**验证**：`node --check` 校验 aiClient.js/slice_agent.js/server.js/build.js 全部无语法错误；PowerShell AST 解析器校验四个 PS1/PSM1 文件全部无语法错误；14 处版本号统一到 v5.36.0

### v5.35.0 (2026-06-29) — 阶段 2：死代码清理 + 前端 XSS 修复
全量代码审查后系统性优化的第二阶段，删除 ~1500 行死代码 + 修复 10 处 XSS 漏洞。

**死代码清理**
- **slice_agent.js**：删除 22 个死函数/常量，从 3066 行减至 1618 行（-47.2%）。包括整个 AI 切片流水线（analyzeModel/sliceModel/suggestParameters/generateGcodeFromAnalysis/advancedSlice 等）、非流式 printQA（被流式取代）、saveModelFile/getStlInfo/listModelFiles 等未调用函数、SLICE_FILAMENT_RULES/sliceJobs/createJobId 等仅被死代码引用的常量。同步清理 buildSystemPrompt 中的死任务类型分支和 module.exports
- **server.js**：删除 10 个死端点（8 个 AI 流水线端点：upload_model/analyze/suggest_params/ai_slice/review_gcode/patch_gcode/print_qa/advanced_slice + 2 个 bridge 端点：status/disconnect）。前端 ailab.js/gcvt.js/webui.html 均不调用这些端点

**前端 XSS 修复**
- **ailab.js**：N9a 下载失败 errMsg 用 aiEscapeHtml 转义；N9b aiRenderInline/aiRenderChatMessage 代码块反向解码删除（原代码把 &lt;/&gt; 还原为 </> 后插入 innerHTML，AI 返回 `<script>` 标签可 XSS）；新增 aiEscapeHtml 辅助函数
- **webui.html**：新增 escHtml 函数；修复 6 处 XSS（文件列表 name/f.path、打印模态框 name/gType/mFilTypes/mFilSub/mT/mS）。所有从 Moonraker 返回的文件名/耗材类型均经 HTML 转义
- **gcvt.js**：新增 gcvtEsc 函数；修复 2 处 XSS（加载失败错误信息、转换结果温度/工具值）

**版本号统一**：14 处版本号统一到 v5.35.0

### v5.34.0 (2026-06-29) — 阶段 1：安全加固 + 资源泄漏修复
全量代码审查后系统性优化的第一阶段，修复 11 个安全/资源/正确性问题（traps.md #121-#131）：

**安全加固**
- **JSONP cb 注入修复**（#122）：server.js 加全局 `sanitizeCb` 中间件，35 处 JSONP 端点的 `cb` 参数用正则校验，非合法 JS 标识符的重置为 `callback`
- **命令注入修复**（#123）：open_external/open_folder/open_gcode_folder 三个端点从 `exec(cmd)` 改为 `spawn` + 参数数组（新增 `openPathExternally` helper），消除 shell 元字符 RCE 风险
- **dialog.js Linux 崩溃修复**（#121）：补全 `execFileSync` 导入

**资源泄漏修复**
- **上传临时文件泄漏**（#124）：handleUploadWithConfirm finally 块原引用 `req.files?.file`（永远 undefined），改用局部变量 `uploadedFiles` 遍历清理所有字段
- **listGcodeFiles 全量读文件**（#125）：`readFileSync({start,end})` 选项无效，改用 `openSync`+`readSync` 只读前 32KB
- **printQAStream qaStreams 泄漏**（#128）：后台 IIFE 加 finally 块，30 秒兜底清理
- **loadJS script 标签泄漏**（#129）：JSONP 回调与 onerror 中同时 remove script 标签
- **reinstall watchdog 文件锁冲突**（#131）：[2/10] 先停 watchdog 再停 bridge；[10/10] 启动 bridge 后重新注册 watchdog

**正确性修复**
- **add_retract 时机错误**（#126）：回抽插在 travel 之前（原在之后）；启用 `min_travel_length` 过滤短距离 travel（原解构未用）；正则匹配 G0+G1 travel（原仅 G0，OrcaSlicer 不匹配）
- **extractGcodeStats G92 E0 误计**（#127）：G92 E0 重置 E 起点被误计为回抽，导致 AI 诊断 stats.retracts 虚高。加 G92 E 检测分支只更新 lastE 不计 retract
- **ws.onmessage 异常保护**（#130）：JSON.parse 裸调用无 try/catch，异常时状态机卡死。整体包裹 try/catch

**版本号统一**：14 处版本号统一到 v5.34.0（package.json/server.js BRIDGE_VERSION/build.js/install.ps1/reinstall.ps1/uninstall.ps1/webui.html CSS+JS 缓存+fallback）

### v5.33.0 (2026-06-27) — WebUI 顶栏添加打印机设置弹窗
- **新增打印机设置弹窗**：WebUI 顶栏 IP 地址旁新增齿轮图标，点击弹窗可修改打印机 IP/Port/API Key。解决系统更新后打印机 IP 变化导致 Bridge 连接失败的问题
- **后端新增端点**：`/api/bridge/save_config.js` 支持 JSONP 方式更新打印机配置
- **保留旧的 API Key**：只传空值时不覆盖已有的 API Key

### v5.32.1 (2026-06-27) — 修复 Node.js v26 npm.ps1 兼容性
- **修复 npm install 失败**：Node.js v26 中 `Get-Command npm` 返回 `npm.ps1`，脚本用 `node.exe npm.ps1` 执行导致 PowerShell 语法错误。改为从 `$nodePath` 推导 `npm.cmd` 路径直接调用，不依赖 `Get-Command` 解析（traps.md #120）

### v5.32.0 (2026-06-27) — AI 打印助手流式输出
- **新增流式输出**：AI 打印助手改为流式响应，回答逐步显示，无需等待完整生成。后端 `printQAStream` 调用 AI API 的 `stream: true` 模式，前端每 200ms 轮询新 chunk 逐步渲染
- **架构**：由于 BambuStudio WebView 阻止 fetch/XHR，采用 JSONP 轮询模式——`qa_stream_start` 返回 streamId，`qa_stream_poll` 返回新 chunk 列表
- **流式光标**：生成中显示闪烁光标，完成后移除
- **保留非流式端点**：`/api/ai/print_qa.js` 仍可用，供其他场景调用

### v5.31.4 (2026-06-21) — 修复本地模型 API Key 检查误拦截
- **修复本地模型（LMStudio）始终提示"请先配置 LLM 连接"**：API Key 检查逻辑 `!aiCfg._hasKey && !aiCfg.apiKey` 对本地 provider 也生效，但本地模型不需要 API Key，`hasKey` 永远为 `false`，导致已配置的本地模型被误拦截。改为本地 provider 跳过 API Key 检查（traps.md #119）

### v5.31.3 (2026-06-21) — 修复本地模型升级后连接失败
- **修复 LMStudio 模型升级后连接失败**：`AI_PROVIDERS` 硬编码 `google/gemma-4-e2b` 作为默认模型，用户升级模型后请求的模型名不匹配导致失败。`testAiConnection` 现在自动检测可用模型列表，若当前配置的模型不在列表中则自动切换到第一个可用模型，前端同步更新模型输入框（traps.md #118）

### v5.31.2 (2026-06-18) — 修复 start-hidden.vbs 括号路径语法错误
- **修复 VBS 800A03EA 语法错误**：Node.js 安装在 `C:\Program Files (x86)\` 时，路径中的括号被 VBScript 解析为函数调用语法导致报错。改用 VBS 变量赋值路径再拼接，避免括号直接出现在 `Run` 参数中（traps.md #117）
- **影响范围**：install.ps1 和 reinstall.ps1 的 start-hidden.vbs 生成逻辑

### v5.31.1 (2026-06-17) — 代码审查修复：版本号一致性 + skills 文档命名
- **版本号一致性修复**：uninstall.ps1（v5.18.1/v5.16.1）、reinstall.ps1（v5.18.1/v5.16.1）、build.js（v5.0.0）、webui.html 回退值（v5.19.0）、memory.md（0.1.0）全部统一到 v5.31.1
- **skills 文档命名统一**：patch_gcode.md 中 add_retraction→add_retract、modify_fan→replace_fan、insert_command→insert_line，与 slice_agent.js 代码实际使用的操作名对齐

### v5.31.0 (2026-06-15) — G-code 转换独立为侧栏标签页
- **G-code 转换从 AI Lab 拆分**：转换功能不需要 LLM，从 AI Lab 独立为左侧栏"转换"标签页（gcvt.js）
- **AI Lab 简化**：移除主标签切换器，工具栏直接显示优化控件，添加"G-code 优化"功能说明
- **新增 gcvt.js**：完全自包含的转换模块，拥有独立工具栏、diff 面板、结果栏、功能说明条
- **新增侧栏导航项**：AI Lab 和 About 之间添加"转换"图标入口
- **LLM 配置检查**：未配置 API Key 时优化/问答提示"请先配置 LLM 连接"
- **功能说明条**：AI Lab 和转换页面各添加蓝色信息条说明功能用途

### v5.30.0 (2026-06-10) — Bridge 看门狗 + 崩溃防护
- **新增看门狗**：`watchdog.ps1` 每 2 分钟检查 bridge 是否存活，崩溃自动重启（注册为 Windows 计划任务）
- **崩溃防护**：`uncaughtException` / `unhandledRejection` 处理，防止未捕获错误导致进程崩溃
- **重启按钮改进**：bridge 崩溃时 WebUI 无法调 API，改为显示手动重启命令提示
- **卸载脚本**：清理看门狗计划任务

### v5.29.3 (2026-06-10) — 完善转换 EXEC 块，匹配 OrcaSlicer 原生流程
- **修复 M109 温度**：EXEC 块中画起始线前 `M109 T0 S140`（预热温度），应为 `M109 S220`（实际打印温度）。根因：温度从 EXEC 块提取只有 S140 预热值，实际打印温度 S220 在打印体中。改为从整个文件提取最高温度
- **补全完整清洗流程**：对比 OrcaSlicer 原生 EXEC 块，补充了 `DEFECT_DETECT_NOODLE_FIRST`、粗回零+粗清洗、检测钢板、深度清洁喷嘴、精回零等步骤
- **补全画起始线后设置**：`G90 / M106 S0 / G21 / M83` 基本设置命令
- **补全清洗前关闭挤出机**：`M104 S0 T0-T3 A0` + `M104 T0 S130` 清洗预热

### v5.29.2 (2026-06-10) — 修复 G-code 转换输出质量问题
- **修复 EXEC 块缺少画起始线**：OrcaSlicer 在 BED_MESH_CALIBRATE 后有 M109 等温 + G1 X185 E15 F360 画起始线，转换后缺失
- **修复打印体残留 EXECUTABLE_BLOCK_END**：原始 BambuStudio 的 EXECUTABLE_BLOCK_END 在打印体末尾，转换后未清理导致出现两个 END 标记
- **修复 M109 温度**：新 EXEC 块中 M109 T0 S140 只是预热温度，应在画起始线前用 M109 T0 S220 等待实际打印温度
- **格式检测修复**：改用 `; FEATURE:` vs `;TYPE:` 层标记判断（traps.md #116）

### v5.29.1 (2026-06-10) — 修复 G-code 格式检测误判
- **修复格式检测逻辑**：OrcaSlicer U1 gcode 也包含 `MOVE_TO_DISCARD_FILAMENT_POSITION` 等命令，导致被误判为 BambuStudio 格式。改用 `; FEATURE:` vs `;TYPE:` 层标记格式判断——BambuStudio 只含 `; FEATURE:`，OrcaSlicer 只含 `;TYPE:`，两者互斥（traps.md #116）
- **影响范围**：`listGcodeFiles` 文件列表格式标注 + `convertGcode` 转换前格式校验

### v5.29.0 (2026-06-10) — 新增 G-code 转换功能（BambuStudio → OrcaSlicer 兼容）
- **新增 G-code 转换功能**：AI Lab 新增"G-code 转换"标签页，将 BambuStudio 生成的 gcode 转换为 OrcaSlicer 兼容格式，使 U1 设备面板能识别和打印
- **转换逻辑**：重组文件结构（HEADER→THUMB→EXEC→body→CONFIG）+ 替换 EXECUTABLE_BLOCK 为 PRINT_START 序列 + 替换 Start/End G-code + 过滤 BambuStudio 专有命令 + 保留打印体不变
- **新增 API**：`/api/ai/convert_gcode.js`、`/api/ai/download_gcode`
- **前端**：主标签切换（G-code 优化 | G-code 转换），转换面板支持本地文件选择和上传，左右对比预览，下载和上传到打印机

### v5.28.3 (2026-06-10) — 修复 replace_speed 速度单位转换
- **修复 replace_speed 未生效**：AI 返回 mm/s 单位速度值（如 `"500"`），代码补全 F 前缀后变成 `F500`，在 gcode 中找不到 `F30000`。添加 mm/s → mm/min 自动转换逻辑（值 < 1000 视为 mm/s，乘以 60）（traps.md #115）
- **改善 AI prompt 速度单位说明**：在 optimize_gcode.md 和 optimizeGcode taskInstructions 中明确标注 G-code 速度单位为 mm/min，避免 AI 返回 mm/s 值
- **清理临时文件**：删除 diff_check.js/diff_check2.js 调试脚本，移除 ailab.js 中 3 处 console.log

### v5.28.2 (2026-06-10) — 修复打印机下载 + explorer 报错
- **修复打印机 gcode 下载失败**：`resp.body.getReader()` 在 Node.js 中不可用，改用 `resp.arrayBuffer()` 兼容方案（traps.md #114）
- **修复 explorer 命令报错**：Windows `explorer` 即使成功也返回 exit code 1，改为 Windows 平台忽略 exec 错误
- **修复 `log is not defined`**：slice_agent.js 新增 `log()` 函数 + `setLogFn()` 注入机制（traps.md #113）

### v5.28.1 (2026-06-10) — 紧急修复 + 下载进度条
- **修复 `log is not defined` 错误**：slice_agent.js 中新增 `log()` 函数和 `setLogFn()` 注入机制，server.js 启动时注入统一日志函数（traps.md #113）
- **修复 explorer 命令报错**：Windows `explorer` 命令即使成功也返回 exit code 1，改为 Windows 平台忽略 exec 错误
- **打印机 gcode 下载进度条**：server 端改用流式下载 + 全局 `fetchProgress` 进度追踪，新增 `/api/ai/fetch_printer_gcode_progress.js` 轮询端点；前端每 500ms 轮询进度，显示进度条和已下载/总大小
- **改进下载错误提示**：显示具体错误信息（如"No printer configured"）

### v5.28.0 (2026-06-10) — LCS Diff + 优化报告 MD + patchGcode 修复
- **替换朴素逐行对比为 LCS（最长公共子序列）diff 算法**：解决插入行导致后续所有行被标记为"差异"的问题（traps.md #111）
- **新增 `aiOptComputeDiff` 函数**：标准 LCS DP + 回溯，生成 equal/delete/insert/change 四种 diff 条目
- **新增 `aiOptHashDiff` 函数**：>3000 行大文件降级方案，基于前瞻匹配的块级 diff
- **连续 delete+insert 合并为 change**：同一位置的删除+插入合并为"修改"类型，语义更准确
- **diff 信息栏增强**：从"差异: N 处"改为"差异: N 处 (X 新增, Y 删除, Z 修改)"分类统计
- **渲染逻辑**：equal→diff-ctx(灰)、delete→diff-del(红)+右空位、insert→左空位+diff-add(绿)、change→左diff-del+右diff-add
- **优化报告 MD 文件**：优化完成后自动在 gcode 同目录生成 `{name}_optimization_report.md`，包含诊断、补丁计划、已应用操作、原始统计、U1 专有指令检测
- **修复 replace_speed 正则匹配 bug**：AI 返回的速度值可能缺少 F 前缀，自动补全；添加负向前瞻避免部分匹配（traps.md #112）
- **修复 modify_temperature 正则匹配 bug**：Orca gcode 中 M104/M109 参数顺序不固定（如 `M104 T0 S140`），原正则 `/M104 S(\d+)/` 无法匹配；改用 `\bS\d+\b` 匹配任意位置的 S 参数；支持 `new_bed_temp` 热床温度替换；层计数用 `;LAYER:\d+` 替代 `Layer`（traps.md #112）
- **修复 add_layer_markers/add_e_reset 冗余操作**：检测 gcode 是否已包含 SET_PRINT_STATS_INFO/G92 E0，若已存在则跳过而非重复插入
- **新增"打开文件夹"按钮**：顶栏添加文件夹图标按钮，调用 `/api/ai/open_gcode_folder` 在系统文件管理器中打开 gcode 目录
- **新增 `/api/ai/open_gcode_folder.js` 端点**：调用 `explorer`/`open`/`xdg-open` 打开 gcode 文件夹
- **修复 list_printer_gcode 无效 timeout 选项**：移除 `fetch` 的非标准 `timeout` 参数
- **改进打印机下载错误提示**：显示具体错误信息而非仅"下载失败"
- **Orca gcode 优化分析**：8480 行 orca-50% 填充文件，5 项操作中仅 1 项实际生效（add_retract），其余因正则 bug 未生效（已修复）

### v5.27.0 (2026-06-08) — G-code 对比预览增强
- **选文件后立即预览**：选择/上传/下载 G-code 后左侧立即显示完整代码
- **优化后右侧对比**：点击优化后右侧显示优化后代码，差异行高亮标注
- **Word 式对比模式**：左侧删除行红色+删除线，右侧新增行绿色，相同行灰色
- **左右同步滚动**：按比例同步滚动，方便对照差异
- **行号显示**：每行前显示行号，便于定位
- **diff 信息栏**：显示差异处数、原始/优化后行数
- **新增 aiOptFetchAndPreview**：打印机文件选后先下载再预览
- **WebUI 拆分**：AI Lab 拆为 ailab.css（60行）+ ailab.js（564行），webui.html 减至 1292 行
- **修复 ailab-content 容器被误删**：清理脚本误删 `<div id="ailab-content">` 导致 AI Lab 空白 + 问答按钮消失，补回容器（traps.md #107）
- **修复 ailab.css/js 无法加载**：server.js 添加显式路由 `/ailab.css`、`/ailab.js`（参照 voxelflow 模式，不用 express.static 避免干扰 API）
- **AI 配置与 voxelflow 对齐**：provider 改为从 server `AI_PROVIDERS` 动态加载（local/deepseek/zhipu/kimi/sensenova/custom），默认 local (LM Studio)；`aiCfg.endpoint` → `aiCfg.customBaseUrl` 统一命名
- **AI Lab 顶栏统一**：改为 `.panel` 容器+工具栏布局，与设备/调试等 tab 风格一致
- **修复 G-code 优化三大交互问题**：本地文件空（切换 tab 未调用 aiListGcodeFiles）、上传无反应（FormData 字段名 files.file→files.gcode）、打印机过早点击优化（下载中 disable 按钮）
- **修复 optimize_gcode 响应嵌套**：server `{ok:true,result}` → `{ok:true,...result}` flatten，frontend `applied_ops` → `applied_operations` 对齐
- **代码审查修复 12 项**：
  - P0: API Key 改 POST 传输（save_config/test_connection）；上传/下载失败按钮恢复；r.issues→r.issues_found
  - P1: chat code block XSS 修复；避免重复请求文件列表；删除废弃 aiSwitchMode；下载按钮重复 style 合并；上传到打印机错误流程修复；apiKey hasKey 占位符显示
  - P2: 同步滚动 try/finally 防锁死
- **优化安全性修复**：`replace_start_gcode`/`replace_end_gcode` 对含 U1 专有命令（PRINT_START/SM_PRINT_AUTO_FEED/DEFECT_DETECTION）的 gcode 跳过，避免破坏耗材进料/流量校准/缺陷检测等关键功能

### v5.26.0 (2026-06-08) — 打印助手全局化 + G-code 对比预览
- **打印问答从 AI Lab 移出**：改为全局浮动按钮（左下角），点击弹出聊天窗口，任何页面都可使用
- **AI Lab 精简为纯 G-code 优化**：移除模式选择器，直接显示优化界面
- **G-code 优化结果添加左右分栏 diff 预览**：点击"展开对比"可并排查看原始/优化后 G-code 差异
- **新增 /api/ai/read_gcode.js 端点**：读取 G-code 文件内容（前 500 行），用于 diff 预览
- **diff 高亮样式**：新增行绿色、删除行红色、相同行灰色
- **aiOptState 扩展**：新增 originalGcodeName 追踪原始文件

### v5.25.0 (2026-06-08) — AI Lab 聚焦 G-code 优化
- **移除 AI切片模式**：LLM 从零生成 G-code 质量不足，不再提供
- **移除高级切片模式**：变层高方案融入 G-code 优化（作为 variable_layer_height 操作）
- **AI Lab 精简为 2 个模式**：G-code优化 + 打印问答
- **Agent 定位调整**：从"AI切片引擎"重新定位为"G-code 优化引擎"
- **soul.md 重写**：核心方向改为诊断+优化，不做 LLM 不擅长的事
- **optimize_gcode.md 增强**：新增诊断维度表、变层高优化、Snapmaker U1 专用知识
- **print_qa.md 增强**：新增 Snapmaker 官方知识库引用（wiki.snapmaker.cn）、U1 专用知识
- **打印问答对话框缩短**：max-height:520px，避免页面过长
- **删除废弃技能文件**：generate_gcode.md、advanced_slice.md
- **skillMap 精简**：只保留 optimize_gcode / print_qa / review_gcode

### v5.24.0 (2026-06-08) — AI Lab 功能完善
- **G-code 优化结果添加"上传到打印机"按钮**：优化完成后可一键上传到打印机（复用 upload_to_printer 端点）
- **打印问答 Markdown 渲染增强**：支持标题(h1-h3)、有序/无序列表、斜体、代码块样式、段落间距
- **打印问答添加"清空记录"按钮**：一键重置聊天历史
- **打印机 G-code 列表加载失败时支持重试**：点击下拉框可重新加载
- 新增 `aiOptUploadToPrinter()` 函数和 `aiOptState` 状态管理

### v5.23.0 (2026-06-08) — AI Lab 三大功能方向
- **G-code 局部优化**：新增 optimize_gcode 技能 + optimizeGcode() 函数 + /api/ai/optimize_gcode 端点
  - AI 诊断 G-code 问题，生成 patch_plan（含 6 种新操作：replace_start/end_gcode、add_layer_markers、add_m73_progress、add_e_reset、add_aux_fans）
  - 确定性代码执行补丁，输出 _optimized 后缀文件
  - UI：G-code 文件选择 + AI 诊断 + 结果报告
- **打印难题问答**：新增 print_qa 技能 + printQA() 函数 + /api/ai/print_qa 端点
  - 聊天式问答界面，支持 10 大打印领域
  - AI 返回结构化回答（诊断→方案→参数→G-code建议）
  - UI：聊天历史 + 输入框 + Markdown 渲染
- **高级非平面切片**：新增 advanced_slice 技能 + advancedSlice() 函数 + /api/ai/advanced_slice 端点
  - AI 分析模型几何 → 输出变层高方案 → 逐段 CLI 切片 → G-code 拼接 → 后处理
  - UI：模型上传 + 变层高分析 + 方案可视化 + 结果下载
- AI Lab 界面新增模式选择器（4 个 Tab：AI切片 / G-code优化 / 打印问答 / 高级切片）
- 新增 /api/ai/list_gcode 端点（列出 gcode 目录文件）
- buildSystemPrompt skillMap 新增 optimize_gcode / print_qa / advanced_slice 映射

### v5.22.0 (2026-06-08) — G-code 质量对齐 OrcaSlicer
- 后处理新增 `SET_PRINT_STATS_INFO TOTAL_LAYER=XX CURRENT_LAYER=N`（触摸屏层进度显示）
- 后处理新增 `M73 Pxx Rxx` 进度报告（触摸屏打印进度百分比）
- 后处理新增每层 `G92 E0` 重置（E 值从 0 重新累加，减少文件体积膨胀 4x→1x）
- 修复 `;LAYER:0` 缺失问题（从 LAYER:1 开始改为从 LAYER:0 开始）
- End G-code 新增 `M106 P2 S0` 腔体风扇关闭
- 默认回抽量从 0.8mm 提升到 1.2mm（对齐 U1 官方推荐 1.0-1.5mm）
- Workspace MD 文档全面更新：三风扇控制策略、每层标记格式、回抽策略

### v5.21.0 (2026-06-08) — Workspace Markdown 系统
- Soul/Knowledge/Skills/Memory 从 JS 硬编码迁移到 Markdown 文件系统（workspace/ 目录）
- Skills 拆分为独立文件（skills/ 子目录），Tools 拆分为独立文件（tools/ 子目录）
- loadWorkspace() 动态加载 Markdown，buildSystemPrompt() 按任务类型组装 systemPrompt
- updateMemory() 切片完成后自动追加经验到 memory.md
- 首次运行自动从 bundle 复制默认 Workspace 到 APPDATA
- WebUI Agent 面板适配新数据结构

### v5.20.0 (2026-06-08) — AI 实验室模块
- 新增 AI Lab tab，AI 直接生成 G-code（不依赖 CLI 切片）
- 4 步向导：上传模型 → AI切片(直接生成G-code) → AI审查G-code → 上传到打印机
- AI 配置：6 个 Provider（本地/DeepSeek/智谱/Kimi/SenseNova/自定义），API Key 服务端存储
- Agent Soul 系统：身份/知识/技能写死在 system prompt（STL理解/切片原理/G-code规范/挤出量计算/温度参数）
- CLI 仅用于模型分析（voxelflow --analyze-only），不参与切片
- G-code 专用文件夹存储（ai-lab/gcode/）
- 仅上传不打印，用户可在 Device tab 手动触发

### v5.19.0 (2026-06-03) — 修复耗材信息被覆盖
- 移除打印流程中的 `SET_PRINT_FILAMENT_CONFIG` 和 `SET_PRINT_TASK_PARAMETERS FILAMENT_TYPE=[...]`，不再用 gcode 耗材信息覆盖设备物理耗材信息（traps.md #106）
- 打印流程完全对齐 OrcaSlicer：SET_PRINT_EXTRUDER_MAP → SET_PRINT_USED_EXTRUDERS → SET_PRINT_PREFERENCES → printer.print.start

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
