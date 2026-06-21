/**
 * BambuStudio Bridge AI Lab — Slice Agent 核心模块
 * 功能：G-code 优化引擎 + G-code 转换引擎（BambuStudio→OrcaSlicer 兼容）+ Workspace 系统
 * 从 VoxelFlow web/slice_agent.js 提取，移除了 AGENT_TOOLS/AGENT_RESOURCES/executeAgentPlan 等
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Logging — uses server.js log if injected via setLogFn, otherwise console
let _logFn = null;
function setLogFn(fn) { _logFn = fn; }
function log(level, msg) {
  if (_logFn) return _logFn(level, msg);
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  const line = `${ts} [${level}] slice_agent: ${msg}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

// RawPath cache shared with server.js (set via setRawPathCache)
let rawPathCache = new Map();
function setRawPathCache(cache) { rawPathCache = cache; }

// ─── AI Provider 配置（移植自 ai_router_module） ───

const AI_PROVIDERS = {
  local: {
    name: "本地模型 (LM Studio)",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "google/gemma-4-e2b",
    availableModels: ["google/gemma-4-e2b", "qwen/qwen3.6-35b-a3b"],
    isLocal: true,
  },
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  zhipu: {
    name: "智谱AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    availableModels: ["glm-4-flash", "glm-4-plus", "glm-4"],
  },
  kimi: {
    name: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    availableModels: ["moonshot-v1-8k", "moonshot-v1-32k"],
  },
  sensenova: {
    name: "SenseNova",
    baseUrl: "https://token.sensenova.cn/v1",
    defaultModel: "sensenova-6.7-flash-lite",
    availableModels: ["sensenova-6.7-flash-lite", "deepseek-v4-flash"],
  },
  custom: {
    name: "自定义接口",
    baseUrl: "http://localhost:8080/v1",
    defaultModel: "",
    availableModels: [],
    isCustom: true,
  },
};

// ─── 切片分析耗材推荐规则 ───

const SLICE_FILAMENT_RULES = {
  overhang: {
    threshold: 0.3,  // 30% overhang area
    recommend: 'petg_basic',
    reason: '大量悬垂区域 → PETG（层间结合力强，减少悬垂缺陷）'
  },
  thin_wall: {
    threshold: 0.2,  // 20% thin wall ratio
    recommend: 'pla_basic',
    reason: '大量薄壁结构 → PLA（细节表现好，薄壁成型稳定）'
  },
  high_curvature: {
    threshold: 0.5,  // high curvature ratio
    recommend: 'pla_basic',
    reason: '高曲率表面 → PLA（冷却响应快，非平面微调效果最佳）'
  },
  large_volume: {
    threshold: 100,  // 100cm³
    recommend: 'pla_matte',
    reason: '大体积模型 → PLA Matte（减少翘曲，表面均匀）'
  },
  flexible: {
    keywords: ['柔性', '软', 'flexible', 'rubber', 'TPU'],
    recommend: 'tpu_basic',
    reason: '需要柔性 → TPU（弹性材料，适合柔性部件）'
  },
  heat_resistant: {
    keywords: ['耐热', '高温', 'heat', 'ABS', 'PC'],
    recommend: 'abs_basic',
    reason: '需要耐热 → ABS（耐高温，适合结构件）'
  }
};

// ─── 目录配置 ───

let STL_DIR;
let GCODE_DIR;
let WORKSPACE_DIR; // Agent Workspace 目录（Soul/Knowledge/Skills/Memory）

function setAppDataDir(dir) {
  STL_DIR = path.join(dir, "stl");
  GCODE_DIR = path.join(dir, "gcode");
  WORKSPACE_DIR = path.join(dir, "workspace");
  fs.mkdirSync(STL_DIR, { recursive: true });
  fs.mkdirSync(GCODE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  // 从 bundle 同步 Workspace 文件到 APPDATA（bundle 是默认模板，始终覆盖）
  const bundleWorkspaceDir = path.join(__dirname, "workspace");
  if (fs.existsSync(bundleWorkspaceDir)) {
    // 复制根目录文件
    for (const f of ["soul.md", "knowledge.md", "memory.md"]) {
      const src = path.join(bundleWorkspaceDir, f);
      const dst = path.join(WORKSPACE_DIR, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    }
    // 复制子目录（skills/, tools/）
    for (const sub of ["skills", "tools"]) {
      const srcDir = path.join(bundleWorkspaceDir, sub);
      const dstDir = path.join(WORKSPACE_DIR, sub);
      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
        for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith(".md"))) {
          const src = path.join(srcDir, f);
          const dst = path.join(dstDir, f);
          fs.copyFileSync(src, dst);
        }
      }
    }
  }
}

// 默认使用 APPDATA/BambuStudio-Bridge/ai-lab
setAppDataDir(path.join(process.env.APPDATA || os.homedir(), "BambuStudio-Bridge", "ai-lab"));

// ─── Workspace 系统：从 Markdown 文件加载 Agent 上下文 ───

const WORKSPACE_FILES = ["soul.md", "knowledge.md", "memory.md"];
const WORKSPACE_DIRS = ["skills", "tools"];

function loadWorkspace() {
  const ws = {};
  // 加载根目录 Markdown 文件
  for (const f of WORKSPACE_FILES) {
    const filePath = path.join(WORKSPACE_DIR, f);
    if (fs.existsSync(filePath)) {
      ws[f] = fs.readFileSync(filePath, "utf-8");
    } else {
      const bundlePath = path.join(__dirname, "workspace", f);
      ws[f] = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, "utf-8") : "";
    }
  }
  // 加载子目录（skills/, tools/）中的 Markdown 文件
  for (const sub of WORKSPACE_DIRS) {
    const subDir = path.join(WORKSPACE_DIR, sub);
    const bundleSubDir = path.join(__dirname, "workspace", sub);
    const dir = fs.existsSync(subDir) ? subDir : (fs.existsSync(bundleSubDir) ? bundleSubDir : null);
    if (!dir) continue;
    ws[sub] = {};
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".md"))) {
      ws[sub][f] = fs.readFileSync(path.join(dir, f), "utf-8");
    }
  }
  return ws;
}

/** 根据任务类型组装 systemPrompt */
function buildSystemPrompt(taskType, extraContext = {}) {
  const ws = loadWorkspace();
  const sections = [];

  // 1. Soul（身份 + 原则 + 约束）— 所有任务都包含
  if (ws["soul.md"]) sections.push(ws["soul.md"]);

  // 2. Knowledge — 所有任务都包含
  if (ws["knowledge.md"]) sections.push(ws["knowledge.md"]);

  // 3. Skills — 按任务类型选择相关技能
  const skillMap = {
    optimize_gcode: ["optimize_gcode.md", "patch_gcode.md"],
    print_qa: ["print_qa.md"],
    review_gcode: ["review_gcode.md", "patch_gcode.md"],
  };
  const selectedSkills = skillMap[taskType];
  if (selectedSkills && ws.skills) {
    const skillSections = selectedSkills
      .filter(f => ws.skills[f])
      .map(f => ws.skills[f]);
    if (skillSections.length > 0) {
      sections.push("## 当前任务相关技能\n\n" + skillSections.join("\n\n"));
    }
  } else if (ws.skills) {
    // 全部技能
    sections.push(Object.values(ws.skills).join("\n\n---\n\n"));
  }

  // 4. Tools — 按任务类型选择相关工具
  const toolMap = {
    suggest_params: ["voxelflow_analyze.md"],
    generate_gcode: ["voxelflow_analyze.md", "voxelflow_slice.md"],
    review_gcode: [],
    compute_overrides: ["voxelflow_analyze.md", "voxelflow_slice.md"],
  };
  const selectedTools = toolMap[taskType];
  if (selectedTools && ws.tools && selectedTools.length > 0) {
    const toolSections = selectedTools
      .filter(f => ws.tools[f])
      .map(f => ws.tools[f]);
    if (toolSections.length > 0) {
      sections.push("## 可用工具\n\n" + toolSections.join("\n\n---\n\n"));
    }
  }

  // 5. Memory — 所有任务都包含
  if (ws["memory.md"]) sections.push(ws["memory.md"]);

  // 6. 额外上下文（模型分析数据、切片结果等）
  if (extraContext.taskInstructions) {
    sections.push(extraContext.taskInstructions);
  }

  return sections.filter(Boolean).join("\n\n---\n\n");
}

/** 更新 memory.md — 追加切片经验 */
function updateMemory(entry) {
  const memoryPath = path.join(WORKSPACE_DIR, "memory.md");
  let content = "";
  if (fs.existsSync(memoryPath)) {
    content = fs.readFileSync(memoryPath, "utf-8");
  }

  // 在"切片经验"区域的"（暂无记录）"或最后一个条目后追加
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const newEntry = `\n### [${timestamp}] ${entry.modelName || "unknown"} — ${entry.filament || "PLA"}\n` +
    `- 层高: ${entry.layerHeight || "?"}mm, 填充: ${entry.infill || "?"}%, 温度: ${entry.hotendTemp || "?"}/${entry.bedTemp || "?"}°C\n` +
    `- 结果: ${entry.success ? "✅ 成功" : "❌ 失败"}\n` +
    `- 关键发现: ${entry.finding || "无"}\n` +
    `- 参数调整: ${entry.adjustment || "无"}\n`;

  // 替换"（暂无记录）"或追加到切片经验区域末尾
  if (content.includes("（暂无记录）")) {
    content = content.replace("（暂无记录）", newEntry.trim());
  } else {
    // 在"用户偏好"之前插入
    const userPrefIdx = content.indexOf("## 用户偏好");
    if (userPrefIdx > 0) {
      content = content.slice(0, userPrefIdx) + newEntry + "\n" + content.slice(userPrefIdx);
    } else {
      content += newEntry;
    }
  }

  fs.writeFileSync(memoryPath, content, "utf-8");
}

// ─── VoxelFlow 二进制查找 ───

function findVoxelFlowBinary() {
  const projectDir = path.resolve(__dirname, "..");

  // 1. 环境变量指定
  if (process.env.VOXELFLOW_BIN) {
    if (fs.existsSync(process.env.VOXELFLOW_BIN)) return process.env.VOXELFLOW_BIN;
  }

  // 2. 当前目录（bridge-node）下
  const candidates = [
    path.join(__dirname, "voxelflow.exe"),
    path.join(__dirname, "voxelflow"),
    path.join(projectDir, "target", "release", "voxelflow-gcode-slicer.exe"),
    path.join(projectDir, "target", "release", "voxelflow-gcode-slicer"),
    path.join(projectDir, "target", "debug", "voxelflow-gcode-slicer.exe"),
    path.join(projectDir, "target", "debug", "voxelflow-gcode-slicer"),
    path.join(projectDir, "target", "release", "voxelflow.exe"),
    path.join(projectDir, "target", "release", "voxelflow"),
    path.join(projectDir, "target", "debug", "voxelflow.exe"),
    path.join(projectDir, "target", "debug", "voxelflow"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // 3. PATH 中查找
  return "voxelflow"; // 依赖系统PATH
}

const VOXELFLOW_BIN = findVoxelFlowBinary();

// ─── 切片任务管理 ───

const sliceJobs = new Map(); // id → { status, progress, result, error, startTime }

function createJobId() {
  return `slice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 模型分析 ───

function analyzeModel(modelPath) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(modelPath).toLowerCase();
    const args = ["-i", modelPath, "--analyze-only"];
    // 3MF文件使用 --analyze-only 自动输出JSON格式分析结果（CLI已支持）
    const proc = spawn(VOXELFLOW_BIN, args, { cwd: path.dirname(modelPath) });

    let stdout = "";
    let stderr = "";

    // 超时保护：3 分钟
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("voxelflow slice 超时（3分钟），进程已终止。模型可能过于复杂。"));
    }, 180000);

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`voxelflow --analyze-only exited with code ${code}: ${stderr}`));
      }
      try {
        const analysis = JSON.parse(stdout.trim());
        // 标记3MF多色信息
        if (ext === '.3mf') {
          analysis.is3mf = true;
        }
        resolve(analysis);
      } catch (e) {
        reject(new Error(`Failed to parse analyze output: ${e.message}\nstdout: ${stdout.slice(0, 500)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn voxelflow: ${err.message}. Binary: ${VOXELFLOW_BIN}`));
    });
  });
}

// ─── 切片执行 ───

function sliceModel(modelPath, params, jobId, notifyFn) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(modelPath).toLowerCase();
    const outputName = path.basename(modelPath, ext) + "_" + jobId + ".gcode";
    const outputPath = path.join(GCODE_DIR, outputName);

    const args = [
      "-i", modelPath,
      "-o", outputPath,
      "--layer-height", String(params.layer_height || 0.2),
      "--walls", String(params.walls || 2),
      "--infill", String(params.infill || 0.15),
      "--speed", String(params.speed || 60),
      "--printer", params.printer || "voron",
      "--solid-top-layers", String(params.solid_top_layers || 3),
      "--solid-bottom-layers", String(params.solid_bottom_layers || 3),
      "--bed-size-x", String(params.bed_size_x || 270),
      "--bed-size-y", String(params.bed_size_y || 270),
    ];

    if (params.printer_profile) {
      args.push("--printer-profile", params.printer_profile);
    }

    // 耗材参数
    if (params.filament) {
      args.push("--filament", String(params.filament));
    }
    if (params.filaments && Array.isArray(params.filaments)) {
      args.push("--filaments", params.filaments.join(","));
    }

    // 3MF多色切片
    if (ext === '.3mf' && params.multicolor) {
      args.push("--multicolor");
      if (params.extruder_count) {
        args.push("--extruder-count", String(params.extruder_count));
      }
    }

    // AI切片策略参数
    if (params.slice_strategy) {
      const strategy = params.slice_strategy;
      if (strategy.support_strategy) args.push("--support-strategy", strategy.support_strategy);
      if (strategy.support_threshold_angle) args.push("--support-threshold", String(strategy.support_threshold_angle));
      if (strategy.brim_width && strategy.brim_width > 0) args.push("--brim-width", String(strategy.brim_width));
      if (strategy.z_seam) args.push("--z-seam", strategy.z_seam);
      if (strategy.infill_pattern) args.push("--infill-pattern", strategy.infill_pattern);
    }

    // 温度参数
    if (params.hotend_temp) args.push("--hotend-temp", String(params.hotend_temp));
    if (params.bed_temp) args.push("--bed-temp", String(params.bed_temp));

    // AI 参数覆盖（通过 --overrides 传递 JSON）
    if (params._overrides) {
      const overrideJson = {};
      const o = params._overrides;
      if (o.first_layer_speed) overrideJson.speed = { ...overrideJson.speed, First: o.first_layer_speed / 60 };
      if (o.outer_wall_speed) overrideJson.speed = { ...overrideJson.speed, Perimeter: o.outer_wall_speed / 60 };
      if (o.infill_speed) overrideJson.speed = { ...overrideJson.speed, Infill: o.infill_speed / 60 };
      if (o.travel_speed) overrideJson.speed = { ...overrideJson.speed, Travel: o.travel_speed / 60 };
      if (o.fan_first_layers !== undefined) overrideJson.fan = { ...overrideJson.fan, first_layers: o.fan_first_layers };
      if (o.fan_normal !== undefined) overrideJson.fan = { ...overrideJson.fan, normal: o.fan_normal };
      if (o.retract_length) overrideJson.retract = { ...overrideJson.retract, length: o.retract_length };
      if (o.retract_speed) overrideJson.retract = { ...overrideJson.retract, speed: o.retract_speed };
      if (Object.keys(overrideJson).length > 0) {
        args.push("--overrides", JSON.stringify(overrideJson));
      }
    }

    // Save RawPath for regeneration support
    if (params._saveRawPath) {
      args.push("--save-rawpath", params._saveRawPath);
    }

    const proc = spawn(VOXELFLOW_BIN, args, { cwd: path.dirname(modelPath) });

    let stdout = "";
    let stderr = "";

    // 超时保护：5 分钟
    const sliceTimeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("voxelflow slice 超时（5分钟），进程已终止。模型可能过于复杂。"));
    }, 300000);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      // 解析进度
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.includes("Layers:") || line.includes("Slicing")) {
          if (notifyFn) notifyFn(jobId, "progress", { log: line.trim() });
        }
      }
    });

    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      clearTimeout(sliceTimeout);
      if (code !== 0) {
        return reject(new Error(`voxelflow slice exited with code ${code}: ${stderr}`));
      }

      // 解析输出统计
      const stats = parseSliceOutput(stdout);

      resolve({
        gcodePath: outputPath,
        gcodeName: outputName,
        stats,
      });
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn voxelflow: ${err.message}. Binary: ${VOXELFLOW_BIN}`));
    });
  });
}

function parseSliceOutput(stdout) {
  const stats = {};
  const lines = stdout.split("\n");

  for (const line of lines) {
    // "Mesh: 410 triangles, 16.1x29.0x4.4mm"
    const meshMatch = line.match(/Mesh:\s+(\d+)\s+triangles,\s+([\d.]+)x([\d.]+)x([\d.]+)mm/);
    if (meshMatch) {
      stats.triangle_count = parseInt(meshMatch[1]);
      stats.size_x = parseFloat(meshMatch[2]);
      stats.size_y = parseFloat(meshMatch[3]);
      stats.size_z = parseFloat(meshMatch[4]);
    }
    // "Layers: 22 | Walls: 2 | Infill: 15%"
    const layerMatch = line.match(/Layers:\s+(\d+)\s+\|\s+Walls:\s+(\d+)\s+\|\s+Infill:\s+(\d+)%/);
    if (layerMatch) {
      stats.layers = parseInt(layerMatch[1]);
      stats.walls = parseInt(layerMatch[2]);
      stats.infill_pct = parseInt(layerMatch[3]);
    }
    // "Time: ~2min | Filament: ~0.7m (0.9g)"
    const timeMatch = line.match(/Time:\s+~?([\d.]+)min\s+\|\s+Filament:\s+~?([\d.]+)m\s+\(([\d.]+)g\)/);
    if (timeMatch) {
      stats.estimated_time_min = parseFloat(timeMatch[1]);
      stats.filament_m = parseFloat(timeMatch[2]);
      stats.filament_g = parseFloat(timeMatch[3]);
    }
  }

  return stats;
}

// ─── 切片分析计算 ───

function computeSliceAnalysis(rawPath) {
  if (!rawPath || !rawPath.layers) return null;

  let totalSegments = 0;
  let wallSegments = 0;
  let fillSegments = 0;
  let supportSegments = 0;
  let totalExtrusion = 0;

  for (const layer of rawPath.layers) {
    for (const seg of layer.segments) {
      totalSegments++;
      totalExtrusion += Math.abs(seg.extrusion || 0);
      switch (seg.path_type) {
        case 'wall': case 'inner_wall': wallSegments++; break;
        case 'fill': case 'solid_fill': case 'gap_fill': fillSegments++; break;
        case 'support': case 'support_interface': supportSegments++; break;
      }
    }
  }

  const overhangRatio = supportSegments / Math.max(totalSegments, 1);
  const thinWallRatio = wallSegments / Math.max(totalSegments, 1);

  return {
    overhang_ratio: Math.round(overhangRatio * 100) / 100,
    thin_wall_ratio: Math.round(thinWallRatio * 100) / 100,
    curvature_score: 0,  // Will be computed from nonplanar data if available
    model_volume_cm3: Math.round(totalExtrusion / 1000 * 100) / 100,  // mm³ → cm³
    total_segments: totalSegments,
    support_segments: supportSegments,
  };
}

// ─── AI 参数推荐 ───

async function suggestParameters(analysisResult, aiConfig, rawPath) {
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error(`Unknown AI provider: ${aiConfig.provider}`);

  const model = aiConfig.model || provider.defaultModel;
  const apiKey = aiConfig.apiKey || (provider.isLocal ? "no-key" : "");
  if (!apiKey && !provider.isLocal) throw new Error(`API key not configured for ${provider.name}`);

  const baseUrl = aiConfig.customBaseUrl || provider.baseUrl;

  // 计算切片分析指标
  const sliceAnalysis = computeSliceAnalysis(rawPath);

  const systemPrompt = buildSystemPrompt("suggest_params", {
    taskInstructions: `你必须返回JSON格式的切片策略，包含以下字段：
{
  "layer_height": 0.2,
  "walls": 2,
  "infill": 0.15,
  "speed": 60,
  "bed_temp": 60,
  "hotend_temp": 210,
  "printer": "voron",
  "multicolor": false,
  "extruder_count": 1,
  "filament": "snapmaker_pla_basic",
  "recommendation_reason": "推荐理由",
  "reasoning": "整体策略说明",
  "slice_strategy": {
    "support_strategy": "auto",
    "support_threshold_angle": 45,
    "support_type": "tree",
    "brim_width": 0,
    "brim_type": "none",
    "cooling_overrides": [{"layers": "1-3", "fan_speed": 0, "speed_factor": 0.5, "reason": "首层粘附"}],
    "speed_overrides": [{"feature": "overhang", "speed_factor": 0.5, "threshold_angle": 45, "reason": "悬垂减速"}],
    "retraction_overrides": [{"material": "TPU", "retract_length": 0, "reason": "TPU不回抽"}],
    "z_seam": "aligned",
    "infill_pattern": "grid",
    "wall_sequence": "inner-outer",
    "small_area_flow_compensation": true
  }
}

只返回JSON，不要其他文字。`,
  });

  let userPrompt = `请分析以下STL模型特征并推荐切片参数：

${JSON.stringify(analysisResult, null, 2)}`;

  // 如果有切片分析数据，注入到prompt中
  if (sliceAnalysis) {
    userPrompt += `\n\n切片分析结果:\n`;
    userPrompt += `- 悬垂比例: ${(sliceAnalysis.overhang_ratio * 100).toFixed(0)}%\n`;
    userPrompt += `- 薄壁比例: ${(sliceAnalysis.thin_wall_ratio * 100).toFixed(0)}%\n`;
    userPrompt += `- 模型体积: ${sliceAnalysis.model_volume_cm3}cm³\n`;
    userPrompt += `- 支撑段数: ${sliceAnalysis.support_segments}\n`;
    userPrompt += `\n基于切片分析的耗材推荐规则:\n`;
    if (sliceAnalysis.overhang_ratio > SLICE_FILAMENT_RULES.overhang.threshold) {
      userPrompt += `- 悬垂>${(SLICE_FILAMENT_RULES.overhang.threshold * 100).toFixed(0)}% → 推荐PETG（层间结合力强）\n`;
    }
    if (sliceAnalysis.thin_wall_ratio > SLICE_FILAMENT_RULES.thin_wall.threshold) {
      userPrompt += `- 薄壁>${(SLICE_FILAMENT_RULES.thin_wall.threshold * 100).toFixed(0)}% → 推荐PLA（细节好）\n`;
    }
    if (sliceAnalysis.model_volume_cm3 > SLICE_FILAMENT_RULES.large_volume.threshold) {
      userPrompt += `- 大体积>${SLICE_FILAMENT_RULES.large_volume.threshold}cm³ → 考虑PLA Matte（减少翘曲）\n`;
    }
  }

  const url = `${baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey && apiKey !== "no-key") headers["Authorization"] = `Bearer ${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI API error: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  // 兼容不同模型的响应格式：优先取content，如果为空则取reasoning_content
  const content = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || "";

  // 提取JSON（可能被markdown代码块包裹）
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  try {
    const params = JSON.parse(jsonStr.trim());
    // 附加切片分析数据到返回结果
    if (sliceAnalysis) {
      params.slice_analysis = sliceAnalysis;
    }
    // 如果AI未返回recommendation_reason，基于规则生成
    if (!params.recommendation_reason && sliceAnalysis) {
      params.recommendation_reason = generateRecommendationReason(sliceAnalysis, params.filament);
    }
    return params;
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${e.message}\nAI response: ${content.slice(0, 300)}`);
  }
}

// ─── AI 切片引擎（CLI 几何计算 + AI 策略决策） ───

async function generateGcodeFromAnalysis(analysisResult, params, aiConfig, modelPath) {
  const jobId = createJobId();

  // Step 1: AI 决定参数覆盖（速度/温度/风扇/回抽策略）
  const filament = params.filament || "PLA";
  const tempMap = { PLA: { hotend: 210, bed: 60 }, PETG: { hotend: 240, bed: 80 }, ABS: { hotend: 250, bed: 100 }, TPU: { hotend: 220, bed: 50 } };
  const temps = tempMap[filament] || tempMap.PLA;
  const speed = params.speed || 60;

  let overrides = {};
  if (aiConfig.provider) {
    try {
      overrides = await aiComputeOverrides(analysisResult, params, aiConfig, null);
    } catch (e) {
      console.warn(`[VoxelFlow AI] AI override failed, using defaults: ${e.message}`);
      overrides = {
        first_layer_speed: 20,
        outer_wall_speed: Math.round(speed * 0.7),
        inner_wall_speed: speed,
        infill_speed: speed,
        travel_speed: 150,
        hotend_temp: temps.hotend,
        bed_temp: temps.bed,
        fan_first_layers: 0,
        fan_normal: filament === "ABS" ? 0 : filament === "PETG" ? 80 : 255,
        retract_length: 1.2,
        retract_speed: 40,
      };
    }
  } else {
    overrides = {
      first_layer_speed: 20,
      outer_wall_speed: Math.round(speed * 0.7),
      inner_wall_speed: speed,
      infill_speed: speed,
      travel_speed: 150,
      hotend_temp: temps.hotend,
      bed_temp: temps.bed,
      fan_first_layers: 0,
      fan_normal: filament === "ABS" ? 0 : filament === "PETG" ? 80 : 255,
      retract_length: 1.2,
      retract_speed: 40,
    };
  }

  // Step 2: CLI 切片，直接用 AI 参数覆盖生成 G-code
  const sliceParams = {
    ...params,
    hotend_temp: overrides.hotend_temp || temps.hotend,
    bed_temp: overrides.bed_temp || temps.bed,
    _overrides: overrides,
  };
  const sliceResult = await sliceModel(modelPath, sliceParams, jobId);

  // Step 3: G-code 后处理（添加标记 + 修复格式）
  const gcodePath = sliceResult?.gcodePath || getGcodePath(sliceResult?.gcodeName);
  if (gcodePath && fs.existsSync(gcodePath)) {
    let content = fs.readFileSync(gcodePath, "utf-8");

    // 3a: 添加 AI 生成标记
    if (!content.startsWith(";Generated by VoxelFlow AI")) {
      content = ";Generated by VoxelFlow AI\n;AI Provider: " + (aiConfig.provider || "default") + "\n;AI Model: " + (aiConfig.model || "default") + "\n" + content;
    }

    // 3b: 插入 ;LAYER:N + SET_PRINT_STATS_INFO + M73 + 每层 G92 E0 重置
    const layerHeight = params.layer_height || 0.2;
    let layerIdx = 0;
    let totalLayers = 0;
    const lines = content.split("\n");

    // 第一遍：计算总层数
    {
      const seenZCount = new Set();
      for (const line of lines) {
        if (line.includes("; --- end ---") || line.match(/^M400\b/)) break;
        const zMatch = line.match(/Z([\d.]+)/);
        if (zMatch) {
          const z = parseFloat(zMatch[1]);
          const zKey = (Math.round(z / layerHeight) * layerHeight).toFixed(2);
          if (z > 0 && !seenZCount.has(zKey)) {
            seenZCount.add(zKey);
            totalLayers++;
          }
        }
      }
    }

    // 第二遍：插入层标记和辅助指令
    let layerIdx2 = 0;
    const result = [];
    const seenZ = new Set();
    let hasStartedPrinting = false; // 标记是否已开始打印移动（用于 LAYER:0 判断）
    let lastEValue = 0; // 追踪当前 E 值用于 G92 E0 重置

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];

      // 跳过 End G-code 区域
      if (line.includes("; --- end ---") || line.match(/^M400\b/)) {
        result.push(line);
        for (let i = li + 1; i < lines.length; i++) result.push(lines[i]);
        break;
      }

      // 检测打印移动开始（G1 带 E 值的行）
      if (!hasStartedPrinting && line.match(/^G1\s/) && line.match(/E[\d.]+/)) {
        hasStartedPrinting = true;
      }

      // 检测 Z 高度变化来识别新层
      const zMatch = line.match(/Z([\d.]+)/);
      if (zMatch) {
        const z = parseFloat(zMatch[1]);
        const zKey = (Math.round(z / layerHeight) * layerHeight).toFixed(2);
        if (z > 0 && !seenZ.has(zKey)) {
          seenZ.add(zKey);

          // 插入层标记（包括 LAYER:0）
          const layerNum = layerIdx2;
          result.push(";LAYER:" + layerNum);
          result.push("SET_PRINT_STATS_INFO TOTAL_LAYER=" + totalLayers + " CURRENT_LAYER=" + (layerNum + 1));

          // 每层插入 G92 E0 重置（减少 E 值膨胀）
          // 找到当前行之前最后一个 E 值，在 ;LAYER 行后插入 G92 E0
          // 后续所有 E 值需要减去 lastEValue（在第三遍处理）
          result.push("G92 E0");

          // M73 进度报告
          if (totalLayers > 0) {
            const pct = Math.round((layerNum / totalLayers) * 100);
            const remaining = totalLayers - layerNum;
            result.push("M73 P" + pct + " R" + remaining);
          }

          layerIdx2++;
        }
      }

      result.push(line);
    }
    content = result.join("\n");

    // 第三遍：E 值重置——每层 G92 E0 后，该层所有 E 值减去该层起始 E 值
    // 这样每层 E 值从 0 重新开始累加，大幅减少数字长度
    {
      const finalLines = content.split("\n");
      const output = [];
      let eOffset = 0; // 当前层需要减去的 E 偏移量
      let layerStartE = -1; // 当前层的起始 E 值（G92 E0 前的最后一个 E 值）

      for (let i = 0; i < finalLines.length; i++) {
        const ln = finalLines[i];

        // 检测 G92 E0（我们插入的层重置标记）
        if (ln === "G92 E0") {
          // 找到前一个有 E 值的行，获取当前 E 累计值作为偏移
          let prevE = 0;
          for (let j = output.length - 1; j >= 0; j--) {
            const eMatch = output[j].match(/E([\d.]+)/);
            if (eMatch) { prevE = parseFloat(eMatch[1]); break; }
          }
          eOffset = prevE;
          output.push(ln);
          continue;
        }

        // 检测 End G-code 区域，停止 E 值重置
        if (ln.includes("; --- end ---") || ln.match(/^M400\b/)) {
          // End G-code 中也需要重置 E 偏移
          // 先把 End 区域所有 E 值也减去偏移
        }

        // 替换 E 值
        const eMatch = ln.match(/^(G1\s.*E)([\d.]+)(.*)$/);
        if (eMatch) {
          const oldE = parseFloat(eMatch[2]);
          const newE = Math.max(0, oldE - eOffset);
          // 保留合理精度（3位小数）
          output.push(eMatch[1] + newE.toFixed(3) + eMatch[3]);
        } else {
          output.push(ln);
        }
      }
      content = output.join("\n");
    }

    // 3c: End G-code 前插入 M106 S0（关闭所有风扇）
    if (!content.includes("M106 S0\n; --- end ---") && !content.includes("M106 S0\nM400")) {
      content = content.replace(/(; --- end ---)/, "M106 S0 ; Fan off\nM106 P2 S0 ; Cavity fan off\n$1");
    }

    fs.writeFileSync(gcodePath, content, "utf-8");
  }

  // Step 4: 质量验证
  const gcodeContent = gcodePath && fs.existsSync(gcodePath) ? fs.readFileSync(gcodePath, "utf-8") : "";
  const validation = validateGcode(gcodeContent, analysisResult, params);
  const stats = extractGcodeStats(gcodeContent);

  // Step 5: 记录切片经验到 Memory
  try {
    updateMemory({
      modelName: analysisResult?.bounding_box ? "model" : "unknown",
      filament: filament,
      layerHeight: params.layer_height || 0.2,
      infill: Math.round((params.infill || 0.15) * 100),
      hotendTemp: overrides.hotend_temp || temps.hotend,
      bedTemp: overrides.bed_temp || temps.bed,
      success: validation.quality !== "poor",
      finding: validation.errors.length > 0 ? validation.errors[0] : (validation.warnings.length > 0 ? validation.warnings[0] : "质量良好"),
      adjustment: aiConfig.provider ? "AI参数覆盖" : "默认参数",
    });
  } catch (e) {
    console.warn(`[VoxelFlow AI] Failed to update memory: ${e.message}`);
  }

  return {
    gcodeName: sliceResult?.gcodeName,
    stats,
    lines: gcodeContent.split('\n').length,
    validation,
    sliceId: jobId,
    overrides,
    method: "cli_slice_ai_override",
  };
}

// ─── AI 参数覆盖计算 ───

async function aiComputeOverrides(analysisResult, params, aiConfig, sliceResult) {
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error(`Unknown AI provider: ${aiConfig.provider}`);

  const model = aiConfig.model || provider.defaultModel;
  const apiKey = aiConfig.apiKey || (provider.isLocal ? "no-key" : "");
  if (!apiKey && !provider.isLocal) throw new Error(`API key not configured for ${provider.name}`);

  const baseUrl = aiConfig.customBaseUrl || provider.baseUrl;

  const systemPrompt = buildSystemPrompt("compute_overrides", {
    taskInstructions: `## 当前任务：参数覆盖

你不需要生成 G-code 路径——几何路径已由 CLI 工具精确计算。你只需要决定打印策略参数。

输出格式：纯 JSON，不要 markdown 代码块，不要注释。
{
  "first_layer_speed": 20,
  "outer_wall_speed": 42,
  "inner_wall_speed": 60,
  "infill_speed": 80,
  "travel_speed": 150,
  "hotend_temp": 210,
  "bed_temp": 60,
  "fan_first_layers": 0,
  "fan_normal": 255,
  "retract_length": 0.8,
  "retract_speed": 40,
  "reasoning": "简要说明参数选择理由"
}`,
  });

  const userPrompt = `## 模型分析
${JSON.stringify(analysisResult, null, 2)}

## 切片结果
${JSON.stringify(sliceResult?.stats || {}, null, 2)}

## 用户参数
- 层高: ${params.layer_height || 0.2}mm
- 壁数: ${params.walls || 3}
- 填充: ${Math.round((params.infill || 0.15) * 100)}%
- 速度: ${params.speed || 60}mm/s
- 耗材: ${params.filament || "PLA"}
- 支撑: ${params.slice_strategy?.support_strategy || "auto"}

请输出参数覆盖 JSON：`;

  const url = `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "no-key") headers["Authorization"] = `Bearer ${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI API error: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  let content = data.choices?.[0]?.message?.content || "";
  content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  const overrides = JSON.parse(content);
  // 移除非参数字段
  delete overrides.reasoning;
  return overrides;
}

// ─── G-code 质量验证 ───

function validateGcode(gcodeContent, analysis, params) {
  const warnings = [];
  const errors = [];
  const lines = gcodeContent.split('\n');

  // 1. 检查是否有重复坐标（AI 常见问题：所有层走线一样）
  const moveLines = lines.filter(l => /^G[01]\s/.test(l.trim()));
  const uniqueCoords = new Set();
  let duplicateCount = 0;
  for (const line of moveLines) {
    const xMatch = line.match(/X([\d.]+)/);
    const yMatch = line.match(/Y([\d.]+)/);
    if (xMatch && yMatch) {
      const key = `${xMatch[1]}_${yMatch[1]}`;
      if (uniqueCoords.has(key)) duplicateCount++;
      uniqueCoords.add(key);
    }
  }
  if (duplicateCount > moveLines.length * 0.5) {
    errors.push("重复坐标过多: 超过50%的走线指令使用相同的X/Y坐标，AI可能未根据模型实际尺寸生成路径");
  }

  // 2. 检查 E 值是否递增（绝对模式下应单调递增）
  let lastE = 0;
  let eNotIncreasing = 0;
  for (const line of moveLines) {
    const eMatch = line.match(/E([\d.]+)/);
    if (eMatch) {
      const e = parseFloat(eMatch[1]);
      if (e < lastE) eNotIncreasing++;
      lastE = e;
    }
  }
  if (eNotIncreasing > 0) {
    warnings.push(`E值非单调递增: ${eNotIncreasing}处E值回退（绝对模式下应递增，回抽除外）`);
  }

  // 3. 检查是否有 G0 快速移动（空走）
  const g0Count = lines.filter(l => /^G0\s/.test(l.trim())).length;
  if (g0Count === 0) {
    warnings.push("无G0快速移动: 所有移动都在挤出，缺少空走移动会导致拉丝");
  }

  // 4. 检查是否有回抽
  const retractCount = lines.filter(l => /G1\s+E-/.test(l.trim()) || /^G10/.test(l.trim())).length;
  if (retractCount === 0) {
    warnings.push("无回抽: 层间/空走前没有回抽，会导致拉丝");
  }

  // 5. 检查层数是否与模型高度匹配
  const layerCount = (gcodeContent.match(/;LAYER:\d+/gi) || []).length;
  const modelHeight = analysis?.bounding_box?.max?.[2] || analysis?.height;
  const layerHeight = params?.layer_height || 0.2;
  if (modelHeight && layerCount > 0) {
    const expectedLayers = Math.ceil(modelHeight / layerHeight);
    if (Math.abs(layerCount - expectedLayers) > expectedLayers * 0.3) {
      warnings.push(`层数不匹配: 生成${layerCount}层，模型高度${modelHeight}mm预期约${expectedLayers}层`);
    }
  }

  // 6. 检查是否有无效命令
  const invalidCmds = lines.filter(l => {
    const t = l.trim();
    return t && !t.startsWith(';') && !t.startsWith('G') && !t.startsWith('M') && !t.startsWith('T') && !t.startsWith(';');
  }).filter(l => !/^[A-Z]\d+/.test(l.trim()));
  if (invalidCmds.length > 0) {
    errors.push(`无效命令: ${invalidCmds.length}行非标准G-code指令`);
  }

  // 7. 检查模型尺寸范围
  if (analysis?.bounding_box) {
    const { min: bmin, max: bmax } = analysis.bounding_box;
    if (bmin && bmax) {
      const modelW = bmax[0] - bmin[0];
      const modelD = bmax[1] - bmin[1];
      // 检查G-code中是否有坐标超出模型范围
      let outOfRange = 0;
      for (const line of moveLines) {
        const xMatch = line.match(/X([\d.]+)/);
        const yMatch = line.match(/Y([\d.]+)/);
        if (xMatch && yMatch) {
          const x = parseFloat(xMatch[1]);
          const y = parseFloat(yMatch[1]);
          if (x > bmax[0] + 10 || y > bmax[1] + 10) outOfRange++;
        }
      }
      if (outOfRange > 0) {
        warnings.push(`坐标超出模型范围: ${outOfRange}处坐标超出模型尺寸(${modelW.toFixed(1)}×${modelD.toFixed(1)}mm)`);
      }
    }
  }

  const quality = errors.length === 0 && warnings.length <= 1 ? "good" : errors.length > 0 ? "poor" : "fair";

  return { quality, errors, warnings, layerCount, uniqueCoords: uniqueCoords.size, totalMoves: moveLines.length };
}

// ─── G-code 统计提取 ───

function extractGcodeStats(gcodeContent) {
  const lines = gcodeContent.split('\n');
  const stats = {
    total_lines: lines.length,
    layers: 0,
    tool_changes: 0,
    retracts: 0,
    max_speed: 0,
    min_speed: Infinity,
    total_extrusion_e: 0,
    max_e_value: 0,
    temperatures: { hotend: new Set(), bed: new Set() },
    fan_speeds: new Set(),
    travel_moves: 0,
    print_moves: 0,
    warnings: [],
  };

  let lastE = 0;
  let currentZ = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    // Layer count (G1 Z moves)
    const zMatch = trimmed.match(/G1\s+Z([\d.]+)/);
    if (zMatch) {
      const z = parseFloat(zMatch[1]);
      if (z > currentZ + 0.01) {
        currentZ = z;
        stats.layers++;
      }
    }

    // Tool changes (T0, T1, etc.)
    if (/^T[0-3]/.test(trimmed)) stats.tool_changes++;

    // Retract (negative E or G10)
    const eMatch = trimmed.match(/E(-?[\d.]+)/);
    if (eMatch) {
      const e = parseFloat(eMatch[1]);
      if (e < lastE) stats.retracts++;
      else stats.total_extrusion_e += (e - lastE);
      if (e > stats.max_e_value) stats.max_e_value = e;
      lastE = e;
    }
    if (trimmed.startsWith('G10')) stats.retracts++;

    // Speed
    const fMatch = trimmed.match(/F([\d.]+)/);
    if (fMatch) {
      const f = parseFloat(fMatch[1]);
      if (f > stats.max_speed) stats.max_speed = f;
      if (f < stats.min_speed && f > 0) stats.min_speed = f;
    }

    // Temperatures
    const hotendTemp = trimmed.match(/M104 S(\d+)|M109 S(\d+)/);
    if (hotendTemp) stats.temperatures.hotend.add(parseInt(hotendTemp[1] || hotendTemp[2]));
    const bedTemp = trimmed.match(/M140 S(\d+)|M190 S(\d+)/);
    if (bedTemp) stats.temperatures.bed.add(parseInt(bedTemp[1] || bedTemp[2]));

    // Fan
    const fanMatch = trimmed.match(/M106 S?(\d*)/);
    if (fanMatch && trimmed.startsWith('M106')) {
      const s = fanMatch[1] ? parseInt(fanMatch[1]) : 255;
      stats.fan_speeds.add(s);
    }

    // Travel vs print moves
    if (trimmed.startsWith('G1') && fMatch) {
      if (eMatch) stats.print_moves++;
      else stats.travel_moves++;
    }
  }

  // Convert sets to arrays for JSON serialization
  stats.temperatures.hotend = [...stats.temperatures.hotend];
  stats.temperatures.bed = [...stats.temperatures.bed];
  stats.fan_speeds = [...stats.fan_speeds];
  if (stats.min_speed === Infinity) stats.min_speed = 0;

  // Heuristic warnings
  if (stats.retracts > stats.print_moves * 0.5) {
    stats.warnings.push({ type: 'excessive_retract', severity: 'warn', message: `回抽次数(${stats.retracts})占打印移动的${(stats.retracts / stats.print_moves * 100).toFixed(0)}%，可能导致拉丝` });
  }
  if (stats.travel_moves > stats.print_moves * 2) {
    stats.warnings.push({ type: 'excessive_travel', severity: 'warn', message: `空走移动(${stats.travel_moves})远超打印移动(${stats.print_moves})，可能增加拉丝风险` });
  }
  if (stats.temperatures.hotend.length > 1) {
    stats.warnings.push({ type: 'multi_temp', severity: 'info', message: `多温度设置: ${stats.temperatures.hotend.join('°C, ')}°C，确认多材料打印` });
  }
  if (stats.max_speed > 5000) {
    stats.warnings.push({ type: 'high_speed', severity: 'warn', message: `最大速度${stats.max_speed}mm/min (${(stats.max_speed/60).toFixed(0)}mm/s)，可能导致振纹` });
  }

  return stats;
}

// ─── AI 审查 G-code ───

async function reviewGcode(gcodeStats, aiConfig, sliceAnalysis, filamentProfile) {
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error(`Unknown AI provider: ${aiConfig.provider}`);

  const model = aiConfig.model || provider.defaultModel;
  const apiKey = aiConfig.apiKey || (provider.isLocal ? "no-key" : "");
  if (!apiKey && !provider.isLocal) throw new Error(`API key not configured for ${provider.name}`);

  const baseUrl = aiConfig.customBaseUrl || provider.baseUrl;

  const systemPrompt = buildSystemPrompt("review_gcode", {
    taskInstructions: `## 当前任务：G-code 审查

你必须返回JSON格式的审查报告：
{
  "overall_score": 85,
  "risk_level": "low",
  "issues": [{"type": "stringing_risk", "severity": "warn", "location": "全局", "message": "描述", "suggestion": "建议"}],
  "quality_checks": {
    "thermal": {"status": "pass", "detail": "温度设置合理"},
    "adhesion": {"status": "pass", "detail": "首层粘附参数正常"},
    "stringing": {"status": "warn", "detail": "回抽频率较高"},
    "dimensional": {"status": "pass", "detail": "速度设置在合理范围"},
    "structural": {"status": "pass", "detail": "填充和壁数合理"}
  },
  "summary": "总体评价",
  "recommendations": ["建议1", "建议2"]
}

如果审查发现问题，在返回的JSON中包含 patch_plan 字段：
[
  {"operation": "replace_speed", "target": "overhang_regions", "original_speed": "F3000", "new_speed": "F1500", "reason": "悬垂区域减速"},
  {"operation": "add_retract", "target": "long_travels", "min_travel_length": 5.0, "retract_length": 1.2, "reason": "长距离空走增加回抽防拉丝"},
  {"operation": "replace_fan", "target": "overhang_layers", "new_fan_speed": 255, "reason": "悬垂层增加冷却"},
  {"operation": "modify_temperature", "target": "first_3_layers", "new_hotend_temp": 225, "reason": "首层温度微调改善粘附"},
  {"operation": "insert_line", "after_pattern": "; Layer 1", "insert_text": "M106 S0", "reason": "强制首层风扇关闭"}
]

支持的operation: replace_speed / add_retract / replace_fan / modify_temperature / insert_line
只在发现问题时才生成patch_plan。质量良好时patch_plan为空数组[]。

只返回JSON，不要其他文字。`,
  });

  const userPrompt = `请审查以下G-code统计数据：

## G-code 统计
${JSON.stringify(gcodeStats, null, 2)}

## 切片分析
${sliceAnalysis ? JSON.stringify(sliceAnalysis, null, 2) : '无切片分析数据'}

## 使用的耗材
${filamentProfile ? JSON.stringify(filamentProfile, null, 2) : '未指定耗材'}

请给出完整的审查报告。`;

  const url = `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "no-key") headers["Authorization"] = `Bearer ${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 3000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI API error: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || "";

  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    throw new Error(`Failed to parse AI review response: ${e.message}\nAI response: ${content.slice(0, 300)}`);
  }
}

// ─── 基于切片分析生成推荐理由 ───

function generateRecommendationReason(sliceAnalysis, filament) {
  const reasons = [];

  if (sliceAnalysis.overhang_ratio > SLICE_FILAMENT_RULES.overhang.threshold) {
    reasons.push(SLICE_FILAMENT_RULES.overhang.reason);
  }
  if (sliceAnalysis.thin_wall_ratio > SLICE_FILAMENT_RULES.thin_wall.threshold) {
    reasons.push(SLICE_FILAMENT_RULES.thin_wall.reason);
  }
  if (sliceAnalysis.curvature_score > SLICE_FILAMENT_RULES.high_curvature.threshold) {
    reasons.push(SLICE_FILAMENT_RULES.high_curvature.reason);
  }
  if (sliceAnalysis.model_volume_cm3 > SLICE_FILAMENT_RULES.large_volume.threshold) {
    reasons.push(SLICE_FILAMENT_RULES.large_volume.reason);
  }

  if (reasons.length === 0) {
    return '通用场景 → ' + (filament || 'pla_basic');
  }

  return reasons.join('；');
}

// ─── AI 连接测试 ───

async function testAiConnection(aiConfig) {
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) return { ok: false, error: `Unknown provider: ${aiConfig.provider}` };

  // Local providers don't require API key
  const apiKey = aiConfig.apiKey || (provider.isLocal ? "no-key" : "");
  if (!apiKey && !provider.isLocal) return { ok: false, error: "API key not set" };

  try {
    const baseUrl = aiConfig.customBaseUrl || provider.baseUrl;
    const url = `${baseUrl}/models`;
    const headers = {};
    if (apiKey && apiKey !== "no-key") headers["Authorization"] = `Bearer ${apiKey}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };

    // 自动发现本地模型列表
    const data = await resp.json();
    const discoveredModels = (data.data || [])
      .map((m) => m.id)
      .filter((id) => !id.includes("embed")); // 排除embedding模型

    if (discoveredModels.length > 0) {
      provider.availableModels = discoveredModels;
      if (!discoveredModels.includes(provider.defaultModel)) {
        provider.defaultModel = discoveredModels[0];
      }
      // 如果当前配置的模型不在可用列表中，自动切换到第一个可用模型
      if (aiConfig.model && !discoveredModels.includes(aiConfig.model)) {
        aiConfig.model = discoveredModels[0];
      }
    }

    return {
      ok: true,
      provider: provider.name,
      models: discoveredModels,
      defaultModel: provider.defaultModel,
      currentModel: aiConfig.model || provider.defaultModel,
    };
  } catch (e) {
    const errMsg = e.message || (e.cause && (e.cause.message || e.cause.code || String(e.cause))) || String(e);
    return { ok: false, error: errMsg };
  }
}

// ─── 模型文件管理（STL / 3MF） ───

function saveModelFile(filename, buffer) {
  const id = `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = path.extname(filename).toLowerCase();
  const safeName = id + ext;
  const filePath = path.join(STL_DIR, safeName);

  fs.writeFileSync(filePath, buffer);

  return {
    id,
    originalName: filename,
    path: filePath,
    size: buffer.length,
    is3mf: ext === '.3mf',
  };
}

// 向后兼容别名
const saveStlFile = saveModelFile;

function getStlInfo(stlId) {
  const files = fs.readdirSync(STL_DIR);
  const match = files.find((f) => f.startsWith(stlId));
  if (!match) return null;
  const filePath = path.join(STL_DIR, match);
  const stat = fs.statSync(filePath);
  return {
    id: stlId,
    path: filePath,
    filename: match,
    size: stat.size,
  };
}

function listModelFiles() {
  const files = fs.readdirSync(STL_DIR);
  return files
    .filter((f) => {
      const ext = f.toLowerCase();
      return ext.endsWith(".stl") || ext.endsWith(".3mf");
    })
    .map((f) => {
      const filePath = path.join(STL_DIR, f);
      const stat = fs.statSync(filePath);
      const ext = path.extname(f).toLowerCase();
      return {
        id: f.replace(/\.[^.]+$/, ""),
        filename: f,
        size: stat.size,
        modified: stat.mtime,
        is3mf: ext === '.3mf',
      };
    });
}

// 向后兼容别名
const listStlFiles = listModelFiles;

// ─── G-code 文件管理 ───

function getGcodePath(gcodeName) {
  // First check AI Lab gcode dir
  const filePath = path.join(GCODE_DIR, gcodeName);
  if (fs.existsSync(filePath)) return filePath;
  // Then search BambuStudio output dirs
  const bambuDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "BambuStudio");
  if (fs.existsSync(bambuDir)) {
    for (const sub of fs.readdirSync(bambuDir)) {
      const subPath = path.join(bambuDir, sub, gcodeName);
      try { if (fs.statSync(subPath).isFile()) return subPath; } catch (_) {}
    }
  }
  return null;
}

function listGcodeFiles() {
  const results = [];
  const seenNames = new Set();
  // Scan AI Lab gcode dir
  const dirs = [GCODE_DIR];
  // Also scan BambuStudio default output dirs
  const bambuDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "BambuStudio");
  if (fs.existsSync(bambuDir)) {
    // BambuStudio stores gcode in subdirs like "default/"
    for (const sub of fs.readdirSync(bambuDir).filter(s => {
      try { return fs.statSync(path.join(bambuDir, s)).isDirectory(); } catch (_) { return false; }
    })) {
      const subDir = path.join(bambuDir, sub);
      // Look for gcode files directly in subdirectories
      try {
        for (const f of fs.readdirSync(subDir)) {
          if (f.toLowerCase().endsWith(".gcode")) dirs.push(subDir);
        }
      } catch (_) {}
    }
  }
  for (const dir of dirs) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.toLowerCase().endsWith(".gcode")) continue;
        if (seenNames.has(f)) continue;
        seenNames.add(f);
        const filePath = path.join(dir, f);
        try {
          const stat = fs.statSync(filePath);
          // Detect format by layer marker style: BambuStudio uses "; FEATURE:", OrcaSlicer uses ";TYPE:"
          // This is the most reliable differentiator — both may contain PRINT_START and U1 proprietary commands
          let format = "unknown";
          try {
            const head = fs.readFileSync(filePath, "utf-8", { start: 0, end: 32768 });
            if (head.includes("; FEATURE:")) format = "bambu";
            else if (head.includes(";TYPE:")) format = "orca";
          } catch (_) {}
          results.push({ filename: f, size: stat.size, modified: stat.mtime, dir, format });
        } catch (_) {}
      }
    } catch (_) {}
  }
  return results;
}

function saveGcodeFile(filename, buffer) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueName = `uploaded_${Date.now()}_${safeName}`;
  const filePath = path.join(GCODE_DIR, uniqueName);
  fs.writeFileSync(filePath, buffer);
  return uniqueName;
}

// ─── 从 RawPath 重新生成 G-code ───

async function regenerateFromRawPath(sliceId, extruderFilaments, overrides) {
  // This calls the server's regenerate endpoint internally
  // Must use absolute URL since this runs in Node.js (not browser)
  const port = parseInt(process.env.VOXELFLOW_PORT) || 13628;
  const resp = await fetch(`http://127.0.0.1:${port}/api/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slice_id: sliceId, extruder_filaments: extruderFilaments, overrides }),
  });
  return resp.json();
}

// ─── G-code Patcher ───

function patchGcode(gcodeName, patchPlan) {
  const gcodePath = getGcodePath(gcodeName);
  if (!gcodePath) throw new Error(`G-code not found: ${gcodeName}`);
  if (!patchPlan || patchPlan.length === 0) return { patched: false, patches_applied: 0 };

  let content = fs.readFileSync(gcodePath, 'utf-8');
  let patchesApplied = 0;

  for (const patch of patchPlan) {
    switch (patch.operation) {
      case 'replace_speed': {
        const { original_speed, new_speed, target } = patch;
        if (!original_speed || !new_speed) { log("WARN", `AI optimize: replace_speed missing original_speed or new_speed, patch=${JSON.stringify(patch)}`); break; }
        // Normalize: ensure F prefix for matching
        let origF = original_speed.startsWith('F') ? original_speed : `F${original_speed}`;
        let newF = new_speed.startsWith('F') ? new_speed : `F${new_speed}`;
        // Auto-convert mm/s → mm/min: if origF value < 1000, it's likely mm/s (e.g. F500 → F30000)
        // G-code F values are always mm/min; typical print speeds are 1000-30000 mm/min (16-500 mm/s)
        const origVal = parseInt(origF.slice(1));
        const newVal = parseInt(newF.slice(1));
        if (origVal > 0 && origVal < 1000) {
          log("INFO", `AI optimize: replace_speed origF=${origF} looks like mm/s, converting to mm/min: F${origVal * 60}`);
          origF = `F${origVal * 60}`;
        }
        if (newVal > 0 && newVal < 1000) {
          log("INFO", `AI optimize: replace_speed newF=${newF} looks like mm/s, converting to mm/min: F${newVal * 60}`);
          newF = `F${newVal * 60}`;
        }
        log("INFO", `AI optimize: replace_speed origF=${origF} newF=${newF} target=${target}`);
        if (target === 'overhang_regions') {
          // Replace speed in lines after overhang comments
          const lines = content.split('\n');
          let inOverhang = false;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('overhang') || lines[i].includes('OVERHANG')) inOverhang = true;
            if (inOverhang && lines[i].includes(origF)) {
              lines[i] = lines[i].replace(origF, newF);
              inOverhang = false;
              patchesApplied++;
            }
          }
          content = lines.join('\n');
        } else {
          // Global speed replacement — match F value as word boundary to avoid partial matches
          const escOrig = origF.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escOrig + '(?!\\d)', 'g');
          const matches = content.match(regex);
          if (matches) {
            content = content.replace(regex, newF);
            patchesApplied++;
            log("INFO", `AI optimize: replace_speed matched ${matches.length} occurrences, replaced with ${newF}`);
          } else {
            log("WARN", `AI optimize: replace_speed no matches found for ${origF} in gcode`);
          }
        }
        break;
      }

      case 'add_retract': {
        const { retract_length, min_travel_length } = patch;
        const lines = content.split('\n');
        const newLines = [];
        for (let i = 0; i < lines.length; i++) {
          newLines.push(lines[i]);
          // Detect travel moves (G0 with no E)
          if (lines[i].match(/G0\s+X[\d.]+\s+Y[\d.]+/) && !lines[i].includes('E')) {
            // Check if previous line already has retract
            const prevLine = i > 0 ? lines[i - 1] : '';
            if (!prevLine.includes('retract')) {
              newLines.push(`G1 E-${retract_length} F2400 ; agent-added retract`);
              patchesApplied++;
            }
          }
        }
        content = newLines.join('\n');
        break;
      }

      case 'replace_fan': {
        const { new_fan_speed, target } = patch;
        if (target === 'overhang_layers') {
          // Add fan speed command after overhang layer comments
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('overhang') && i + 1 < lines.length) {
              lines.splice(i + 1, 0, `M106 S${new_fan_speed} ; agent: overhang fan boost`);
              patchesApplied++;
              i++; // Skip the inserted line
            }
          }
          content = lines.join('\n');
        } else {
          // Replace all M106 commands
          content = content.replace(/M106 S\d+/g, `M106 S${new_fan_speed}`);
          patchesApplied++;
        }
        break;
      }

      case 'modify_temperature': {
        const { new_hotend_temp, new_bed_temp, target } = patch;
        const lines = content.split('\n');
        if (target === 'first_3_layers') {
          // Find M104/M109 in first 3 layers and replace hotend temp
          let layerCount = 0;
          for (let i = 0; i < lines.length; i++) {
            // Match M104/M109 with S param in any position (e.g. "M104 T0 S140" or "M109 S228")
            if (layerCount < 3) {
              const m104Match = lines[i].match(/^(M104\s+.*)\bS\d+\b/);
              if (m104Match) {
                lines[i] = lines[i].replace(/\bS\d+\b/, `S${new_hotend_temp}`);
                patchesApplied++;
              }
              const m109Match = lines[i].match(/^(M109\s+.*)\bS\d+\b/);
              if (m109Match) {
                lines[i] = lines[i].replace(/\bS\d+\b/, `S${new_hotend_temp}`);
                patchesApplied++;
              }
            }
            if (lines[i].match(/^;LAYER:\d+/)) layerCount++;
          }
          // Also replace bed temp if specified
          if (new_bed_temp) {
            let bedLayerCount = 0;
            for (let i = 0; i < lines.length; i++) {
              if (bedLayerCount < 3) {
                if (lines[i].match(/^M140\s/) || lines[i].match(/^M190\s/)) {
                  lines[i] = lines[i].replace(/\bS\d+\b/, `S${new_bed_temp}`);
                  patchesApplied++;
                }
              }
              if (lines[i].match(/^;LAYER:\d+/)) bedLayerCount++;
            }
          }
        } else {
          // Global: replace first M104/M109 S value
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^M104\s/) || lines[i].match(/^M109\s/)) {
              lines[i] = lines[i].replace(/\bS\d+\b/, `S${new_hotend_temp}`);
              patchesApplied++;
            }
            if (new_bed_temp && (lines[i].match(/^M140\s/) || lines[i].match(/^M190\s/))) {
              lines[i] = lines[i].replace(/\bS\d+\b/, `S${new_bed_temp}`);
              patchesApplied++;
            }
          }
        }
        content = lines.join('\n');
        break;
      }

      case 'insert_line': {
        const { after_pattern, insert_text } = patch;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(after_pattern)) {
            lines.splice(i + 1, 0, insert_text);
            patchesApplied++;
            i++; // Skip inserted line
          }
        }
        content = lines.join('\n');
        break;
      }
    }
  }

  // Write patched file (with _patched suffix)
  const parsed = path.parse(gcodePath);
  const patchedName = `${parsed.name}_patched${parsed.ext}`;
  const patchedPath = path.join(parsed.dir, patchedName);
  fs.writeFileSync(patchedPath, content, 'utf-8');

  return {
    patched: true,
    patches_applied: patchesApplied,
    new_gcode_name: patchedName,
    gcode_path: patchedPath,
  };
}

// ─── 高级非平面切片（变层高） ───

async function advancedSlice(modelPath, analysis, aiConfig) {
  const jobId = createJobId();

  // Step 1: AI 分析模型几何，输出变层高方案
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error(`Unknown AI provider: ${aiConfig.provider}`);

  const model = aiConfig.model || provider.defaultModel;
  const apiKey = aiConfig.apiKey || (provider.isLocal ? "no-key" : "");
  if (!apiKey && !provider.isLocal) throw new Error(`API key not configured for ${provider.name}`);

  const baseUrl = aiConfig.customBaseUrl || provider.baseUrl;

  const systemPrompt = buildSystemPrompt("advanced_slice", {
    taskInstructions: `## 当前任务：变层高切片方案

你需要分析模型的几何特征，输出一个变层高切片方案。核心思路：
- 平坦区域（低曲率）使用较厚层高（0.25~0.3mm）加速打印
- 曲面区域（高曲率）使用较薄层高（0.08~0.16mm）保证精度
- 首层使用标准层高（0.2mm）保证粘附
- 相邻段层高差异不超过 0.1mm，避免突变

输出格式：纯 JSON，不要 markdown 代码块，不要注释。
{
  "strategy": "variable_layer_height",
  "segments": [
    {"z_start": 0, "z_end": 2, "layer_height": 0.2, "reason": "首层标准"},
    {"z_start": 2, "z_end": 10, "layer_height": 0.3, "reason": "平坦区域加速"},
    {"z_start": 10, "z_end": 15, "layer_height": 0.12, "reason": "曲面精细"},
    {"z_start": 15, "z_end": 20, "layer_height": 0.2, "reason": "标准层高"}
  ],
  "total_layers": 85,
  "estimated_savings": "30% faster than uniform 0.12mm"
}`,
  });

  const userPrompt = `## 模型分析数据
${JSON.stringify(analysis, null, 2)}

请输出变层高切片方案 JSON：`;

  const url = `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "no-key") headers["Authorization"] = `Bearer ${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI API error: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  let content = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || "";

  // 提取 JSON
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  let plan;
  try {
    plan = JSON.parse(jsonStr.trim());
  } catch (e) {
    throw new Error(`Failed to parse AI advanced_slice response: ${e.message}\nAI response: ${content.slice(0, 300)}`);
  }

  if (!plan.segments || !Array.isArray(plan.segments) || plan.segments.length === 0) {
    throw new Error("AI returned no segments in variable layer height plan");
  }

  // Step 2: 逐段切片
  const segments = plan.segments;
  const gcodeSegments = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segJobId = `${jobId}_seg${i}`;
    const segParams = {
      layer_height: seg.layer_height || 0.2,
      walls: analysis.walls || 2,
      infill: analysis.infill || 0.15,
      speed: analysis.speed || 60,
      printer: analysis.printer || "voron",
    };

    const sliceResult = await sliceModel(modelPath, segParams, segJobId);
    const gcodePath = sliceResult.gcodePath;

    if (gcodePath && fs.existsSync(gcodePath)) {
      let gcodeContent = fs.readFileSync(gcodePath, "utf-8");

      // 提取 Start G-code 和 End G-code 的边界
      const endMarker = gcodeContent.indexOf("; --- end ---");
      const m400Marker = gcodeContent.match(/^M400\b/m);

      let startGcode = "";
      let bodyGcode = "";
      let endGcode = "";

      if (endMarker >= 0) {
        startGcode = gcodeContent.slice(0, endMarker);
        endGcode = gcodeContent.slice(endMarker);
        bodyGcode = startGcode;
      } else if (m400Marker) {
        const m400Idx = m400Marker.index;
        startGcode = gcodeContent.slice(0, m400Idx);
        endGcode = gcodeContent.slice(m400Idx);
        bodyGcode = startGcode;
      } else {
        bodyGcode = gcodeContent;
      }

      gcodeSegments.push({
        startGcode,
        bodyGcode,
        endGcode,
        layerHeight: seg.layer_height,
        zStart: seg.z_start,
        zEnd: seg.z_end,
        reason: seg.reason,
      });

      // 清理临时文件（非最后一段）
      if (i < segments.length - 1) {
        try { fs.unlinkSync(gcodePath); } catch (_) {}
      }
    }
  }

  // Step 3: 拼接 G-code
  if (gcodeSegments.length === 0) {
    throw new Error("No G-code segments generated");
  }

  let finalGcode = "";

  for (let i = 0; i < gcodeSegments.length; i++) {
    const seg = gcodeSegments[i];

    if (i === 0) {
      // 第一段：保留 Start G-code + body
      finalGcode += seg.bodyGcode;
    } else {
      // 后续段：跳过 Start G-code，只追加 body（从第一个 ;LAYER 或 G1 Z 开始）
      const body = seg.bodyGcode;
      const layerMarkerIdx = body.indexOf(";LAYER:");
      const g1zIdx = body.search(/G1\s+Z[\d.]+/);

      let cutIdx = -1;
      if (layerMarkerIdx >= 0) {
        cutIdx = layerMarkerIdx;
      } else if (g1zIdx >= 0) {
        cutIdx = g1zIdx;
      }

      if (cutIdx >= 0) {
        finalGcode += "\n; --- Variable Layer Height Segment: " + seg.layerHeight + "mm (" + seg.reason + ") ---\n";
        finalGcode += body.slice(cutIdx);
      } else {
        finalGcode += "\n; --- Variable Layer Height Segment: " + seg.layerHeight + "mm (" + seg.reason + ") ---\n";
        finalGcode += body;
      }
    }

    // 最后一段：追加 End G-code
    if (i === gcodeSegments.length - 1 && seg.endGcode) {
      finalGcode += "\n" + seg.endGcode;
    }
  }

  // Step 4: 后处理（层标记 + M73 + G92 E0 + 风扇控制）
  const defaultLayerHeight = segments[0]?.layer_height || 0.2;
  let layerIdx = 0;
  let totalLayers = 0;
  const lines = finalGcode.split("\n");

  // 第一遍：计算总层数
  {
    const seenZCount = new Set();
    for (const line of lines) {
      if (line.includes("; --- end ---") || line.match(/^M400\b/)) break;
      const zMatch = line.match(/Z([\d.]+)/);
      if (zMatch) {
        const z = parseFloat(zMatch[1]);
        const zKey = (Math.round(z / defaultLayerHeight) * defaultLayerHeight).toFixed(2);
        if (z > 0 && !seenZCount.has(zKey)) {
          seenZCount.add(zKey);
          totalLayers++;
        }
      }
    }
  }

  // 第二遍：插入层标记和辅助指令
  let layerIdx2 = 0;
  const result = [];
  const seenZ = new Set();

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    if (line.includes("; --- end ---") || line.match(/^M400\b/)) {
      result.push(line);
      for (let i = li + 1; i < lines.length; i++) result.push(lines[i]);
      break;
    }

    const zMatch = line.match(/Z([\d.]+)/);
    if (zMatch) {
      const z = parseFloat(zMatch[1]);
      const zKey = (Math.round(z / defaultLayerHeight) * defaultLayerHeight).toFixed(2);
      if (z > 0 && !seenZ.has(zKey)) {
        seenZ.add(zKey);
        const layerNum = layerIdx2;
        result.push(";LAYER:" + layerNum);
        result.push("SET_PRINT_STATS_INFO TOTAL_LAYER=" + totalLayers + " CURRENT_LAYER=" + (layerNum + 1));
        result.push("G92 E0");
        if (totalLayers > 0) {
          const pct = Math.round((layerNum / totalLayers) * 100);
          const remaining = totalLayers - layerNum;
          result.push("M73 P" + pct + " R" + remaining);
        }
        layerIdx2++;
      }
    }

    result.push(line);
  }
  finalGcode = result.join("\n");

  // E 值重置
  {
    const finalLines = finalGcode.split("\n");
    const output = [];
    let eOffset = 0;

    for (let i = 0; i < finalLines.length; i++) {
      const ln = finalLines[i];

      if (ln === "G92 E0") {
        let prevE = 0;
        for (let j = output.length - 1; j >= 0; j--) {
          const eMatch = output[j].match(/E([\d.]+)/);
          if (eMatch) { prevE = parseFloat(eMatch[1]); break; }
        }
        eOffset = prevE;
        output.push(ln);
        continue;
      }

      const eMatch = ln.match(/^(G1\s.*E)([\d.]+)(.*)$/);
      if (eMatch) {
        const oldE = parseFloat(eMatch[2]);
        const newE = Math.max(0, oldE - eOffset);
        output.push(eMatch[1] + newE.toFixed(3) + eMatch[3]);
      } else {
        output.push(ln);
      }
    }
    finalGcode = output.join("\n");
  }

  // End G-code 前关闭风扇
  if (!finalGcode.includes("M106 S0\n; --- end ---") && !finalGcode.includes("M106 S0\nM400")) {
    finalGcode = finalGcode.replace(/(; --- end ---)/, "M106 S0 ; Fan off\nM106 P2 S0 ; Cavity fan off\n$1");
  }

  // Step 5: 写入最终 G-code 文件
  const outputName = path.basename(modelPath || "model", path.extname(modelPath || "model.stl")) + "_advanced_" + jobId + ".gcode";
  const outputPath = path.join(GCODE_DIR, outputName);
  fs.writeFileSync(outputPath, finalGcode, "utf-8");

  // Step 6: 统计
  const stats = extractGcodeStats(finalGcode);

  return {
    gcodeName: outputName,
    gcodePath: outputPath,
    stats,
    lines: finalGcode.split('\n').length,
    sliceId: jobId,
    plan,
    method: "advanced_variable_layer_height",
  };
}

// ─── AI 优化 G-code ───

async function optimizeGcode(gcodeName, aiConfig) {
  const gcodePath = getGcodePath(gcodeName);
  if (!gcodePath) throw new Error(`G-code not found: ${gcodeName}`);

  // Step 1: Read and extract stats
  const content = fs.readFileSync(gcodePath, "utf-8");
  const stats = extractGcodeStats(content);

  // Step 2: Call AI for diagnosis and patch plan
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error(`Unknown AI provider: ${aiConfig.provider}`);

  const model = aiConfig.model || provider.defaultModel;
  const apiKey = aiConfig.apiKey || (provider.isLocal ? "no-key" : "");
  if (!apiKey && !provider.isLocal) throw new Error(`API key not configured for ${provider.name}`);

  const baseUrl = aiConfig.customBaseUrl || provider.baseUrl;

  const systemPrompt = buildSystemPrompt("optimize_gcode", {
    taskInstructions: `## 当前任务：G-code 局部优化

**重要：G-code 速度单位为 mm/min（不是 mm/s）！**
- F30000 = 500 mm/s，F1800 = 30 mm/s
- replace_speed 的 original_speed 和 new_speed 必须使用 mm/min 单位（如 "F30000"、"F27000"）
- 不要使用 mm/s 单位（如 "500"、"450"），否则补丁将无法匹配

你必须返回JSON格式的优化报告：
{
  "diagnosis": "诊断描述",
  "issues_found": 3,
  "patch_plan": [
    {"operation": "replace_speed", "target": "overhang_regions", "original_speed": "F3000", "new_speed": "F1500", "reason": "悬垂区域减速"},
    {"operation": "add_retract", "target": "long_travels", "min_travel_length": 5.0, "retract_length": 1.2, "reason": "长距离空走增加回抽防拉丝"},
    {"operation": "replace_fan", "target": "overhang_layers", "new_fan_speed": 255, "reason": "悬垂层增加冷却"},
    {"operation": "modify_temperature", "target": "first_3_layers", "new_hotend_temp": 225, "reason": "首层温度微调改善粘附"},
    {"operation": "insert_line", "after_pattern": "; Layer 1", "insert_text": "M106 S0", "reason": "强制首层风扇关闭"},
    {"operation": "replace_start_gcode", "reason": "替换为完整U1 Start G-code"},
    {"operation": "replace_end_gcode", "reason": "替换为完整U1 End G-code"},
    {"operation": "add_layer_markers", "reason": "补充 SET_PRINT_STATS_INFO 层标记"},
    {"operation": "add_m73_progress", "reason": "补充 M73 进度报告"},
    {"operation": "add_e_reset", "reason": "每层 G92 E0 重置E值"},
    {"operation": "add_aux_fans", "reason": "添加辅助风扇控制"}
  ],
  "summary": "优化总结"
}

支持的operation:
- replace_speed / add_retract / replace_fan / modify_temperature / insert_line (标准补丁)
- replace_start_gcode / replace_end_gcode (替换 Start/End G-code)
- add_layer_markers (补充 SET_PRINT_STATS_INFO 层标记)
- add_m73_progress (补充 M73 进度报告)
- add_e_reset (每层 G92 E0 重置)
- add_aux_fans (添加辅助风扇控制)

根据G-code统计数据判断需要哪些优化。质量良好时patch_plan为空数组[]。
只返回JSON，不要其他文字。`,
  });

  const userPrompt = `请分析以下G-code统计数据并生成优化补丁计划：

## G-code 统计
${JSON.stringify(stats, null, 2)}

## 文件名
${gcodeName}

请给出完整的优化诊断报告。`;

  const url = `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "no-key") headers["Authorization"] = `Bearer ${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 3000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI API error: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const aiContent = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || "";

  let jsonStr = aiContent;
  const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  let aiResult;
  try {
    aiResult = JSON.parse(jsonStr.trim());
  } catch (e) {
    throw new Error(`Failed to parse AI optimize response: ${e.message}\nAI response: ${aiContent.slice(0, 300)}`);
  }

  // Step 3: Apply patches
  const patchPlan = aiResult.patch_plan || [];
  let totalPatchesApplied = 0;
  let optimizedGcodeName = gcodeName;
  let optimizedReportName = "";
  const appliedOps = [];

  // Separate standard ops (handled by patchGcode) from new ops (handled here)
  const standardOps = patchPlan.filter(p =>
    ["replace_speed", "add_retract", "replace_fan", "modify_temperature", "insert_line"].includes(p.operation)
  );
  const newOps = patchPlan.filter(p =>
    !["replace_speed", "add_retract", "replace_fan", "modify_temperature", "insert_line"].includes(p.operation)
  );

  // Apply standard ops via patchGcode
  if (standardOps.length > 0) {
    const patchResult = patchGcode(gcodeName, standardOps);
    totalPatchesApplied += patchResult.patches_applied;
    if (patchResult.new_gcode_name) optimizedGcodeName = patchResult.new_gcode_name;
    appliedOps.push(...standardOps.map(o => o.operation));
  }

  // Apply new ops directly
  if (newOps.length > 0) {
    const currentPath = getGcodePath(optimizedGcodeName);
    if (!currentPath) throw new Error(`G-code not found after standard patches: ${optimizedGcodeName}`);
    let gcodeContent = fs.readFileSync(currentPath, "utf-8");
    const totalLayers = (gcodeContent.match(/;LAYER:\d+/g) || []).length;

    // Detect if gcode already has Snapmaker U1 proprietary commands
    const hasU1Proprietary = gcodeContent.includes("PRINT_START") ||
      gcodeContent.includes("SM_PRINT_AUTO_FEED") ||
      gcodeContent.includes("SM_PRINT_FLOW_CALIBRATE") ||
      gcodeContent.includes("DEFECT_DETECTION");

    for (const patch of newOps) {
      switch (patch.operation) {
        case "replace_start_gcode": {
          // Skip if gcode already has U1 proprietary start sequence
          if (hasU1Proprietary) {
            log("WARN", `AI optimize: skipping replace_start_gcode — U1 proprietary commands detected`);
            break;
          }
          // Replace everything before the first ;LAYER:0 or first G1 move with U1 Start G-code
          const U1_START_GCODE = `; Snapmaker U1 Start G-code (AI Optimized)
M220 S100 ; Reset speed override
M221 S100 ; Reset flow override
G28 ; Home all axes
G90 ; Absolute positioning
M82 ; Absolute extrusion
M104 S200 ; Preheat hotend
M140 S60 ; Preheat bed
M190 S60 ; Wait for bed
M109 S200 ; Wait for hotend
G1 Z5 F3000 ; Lift nozzle
G1 X0 Y0 F6000 ; Move to origin
G1 Z0.3 F300 ; Lower to first layer height
G92 E0 ; Reset extruder
`;
          const lines = gcodeContent.split("\n");
          let splitIdx = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^;LAYER:0/) || (lines[i].match(/^G1\s/) && lines[i].match(/E[\d.]+/) && splitIdx === 0)) {
              splitIdx = i;
              if (lines[i].match(/^;LAYER:0/)) break;
            }
          }
          if (splitIdx > 0) {
            gcodeContent = U1_START_GCODE + "\n" + lines.slice(splitIdx).join("\n");
            totalPatchesApplied++;
            appliedOps.push("replace_start_gcode");
          }
          break;
        }

        case "replace_end_gcode": {
          // Skip if gcode already has U1 proprietary start sequence (implies U1 end too)
          if (hasU1Proprietary) {
            log("WARN", `AI optimize: skipping replace_end_gcode — U1 proprietary commands detected`);
            break;
          }
          const U1_END_GCODE = `; Snapmaker U1 End G-code (AI Optimized)
M400 ; Wait for moves to complete
M106 S0 ; Fan off
M106 P2 S0 ; Cavity fan off
M104 S0 ; Hotend off
M140 S0 ; Bed off
G91 ; Relative positioning
G1 Z10 F3000 ; Lift nozzle
G90 ; Absolute positioning
G1 X0 Y200 F6000 ; Park
M84 ; Motors off
; --- end ---
`;
          const endMarker = gcodeContent.indexOf("; --- end ---");
          if (endMarker >= 0) {
            gcodeContent = gcodeContent.slice(0, endMarker) + U1_END_GCODE;
            totalPatchesApplied++;
            appliedOps.push("replace_end_gcode");
          } else {
            gcodeContent += "\n" + U1_END_GCODE;
            totalPatchesApplied++;
            appliedOps.push("replace_end_gcode");
          }
          break;
        }

        case "add_layer_markers": {
          // Insert SET_PRINT_STATS_INFO after each ;LAYER:N line (skip if already present)
          const lines = gcodeContent.split("\n");
          const result = [];
          let addedCount = 0;
          for (let i = 0; i < lines.length; i++) {
            result.push(lines[i]);
            const layerMatch = lines[i].match(/^;LAYER:(\d+)/);
            if (layerMatch) {
              // Check if next line already has SET_PRINT_STATS_INFO
              const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
              if (!nextLine.includes("SET_PRINT_STATS_INFO")) {
                const layerNum = parseInt(layerMatch[1]);
                result.push(`SET_PRINT_STATS_INFO TOTAL_LAYER=${totalLayers} CURRENT_LAYER=${layerNum + 1}`);
                addedCount++;
              }
            }
          }
          if (addedCount > 0) {
            gcodeContent = result.join("\n");
            totalPatchesApplied++;
            appliedOps.push("add_layer_markers");
          } else {
            log("INFO", `AI optimize: skipping add_layer_markers — already present in gcode`);
          }
          break;
        }

        case "add_m73_progress": {
          // Insert M73 progress report after each ;LAYER:N line
          const lines = gcodeContent.split("\n");
          const result = [];
          for (const line of lines) {
            result.push(line);
            const layerMatch = line.match(/^;LAYER:(\d+)/);
            if (layerMatch && totalLayers > 0) {
              const layerNum = parseInt(layerMatch[1]);
              const pct = Math.round((layerNum / totalLayers) * 100);
              const remaining = totalLayers - layerNum;
              result.push(`M73 P${pct} R${remaining}`);
            }
          }
          gcodeContent = result.join("\n");
          totalPatchesApplied++;
          appliedOps.push("add_m73_progress");
          break;
        }

        case "add_e_reset": {
          // Insert G92 E0 after each ;LAYER:N line and adjust E values (skip if already present)
          const lines = gcodeContent.split("\n");
          // Check if G92 E0 already follows ;LAYER: lines
          let alreadyHasReset = 0;
          let layerCount = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^;LAYER:\d+/)) {
              layerCount++;
              const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
              if (nextLine === "G92 E0") alreadyHasReset++;
            }
          }
          if (alreadyHasReset >= layerCount * 0.8) {
            // Already has E resets for most layers — skip
            log("INFO", `AI optimize: skipping add_e_reset — already present (${alreadyHasReset}/${layerCount} layers)`);
            break;
          }

          const result = [];
          let eOffset = 0;

          for (const line of lines) {
            const layerMatch = line.match(/^;LAYER:(\d+)/);
            if (layerMatch) {
              // Find previous E value for offset
              let prevE = 0;
              for (let j = result.length - 1; j >= 0; j--) {
                const eMatch = result[j].match(/E([\d.]+)/);
                if (eMatch) { prevE = parseFloat(eMatch[1]); break; }
              }
              eOffset = prevE;
              result.push(line);
              result.push("G92 E0");
              continue;
            }

            // Adjust E values
            const eMatch = line.match(/^(G1\s.*E)([\d.]+)(.*)$/);
            if (eMatch && eOffset > 0) {
              const oldE = parseFloat(eMatch[2]);
              const newE = Math.max(0, oldE - eOffset);
              result.push(eMatch[1] + newE.toFixed(3) + eMatch[3]);
            } else {
              result.push(line);
            }
          }
          gcodeContent = result.join("\n");
          totalPatchesApplied++;
          appliedOps.push("add_e_reset");
          break;
        }

        case "add_aux_fans": {
          // Add M106 P2 commands alongside existing M106 S commands
          const lines = gcodeContent.split("\n");
          const result = [];
          for (const line of lines) {
            result.push(line);
            const fanMatch = line.match(/^M106\s+S(\d+)/);
            if (fanMatch) {
              const speed = parseInt(fanMatch[1]);
              const pct = Math.round((speed / 255) * 100);
              result.push(`M106 P2 S${speed} ; Cavity fan ${pct}%`);
            }
          }
          gcodeContent = result.join("\n");
          totalPatchesApplied++;
          appliedOps.push("add_aux_fans");
          break;
        }
      }
    }

    // Write optimized file (with _optimized suffix)
    const parsed = path.parse(currentPath);
    // If already _patched, replace with _optimized; otherwise add _optimized
    let optimizedName;
    if (parsed.name.endsWith("_patched")) {
      optimizedName = `${parsed.name.replace("_patched", "_optimized")}${parsed.ext}`;
    } else {
      optimizedName = `${parsed.name}_optimized${parsed.ext}`;
    }
    const optimizedPath = path.join(parsed.dir, optimizedName);
    fs.writeFileSync(optimizedPath, gcodeContent, "utf-8");
    optimizedGcodeName = optimizedName;
  }

  // Generate optimization report MD file
  {
    const reportBasePath = getGcodePath(optimizedGcodeName) || gcodePath;
    const reportParsed = path.parse(reportBasePath);
    const reportName = `${reportParsed.name}_optimization_report.md`;
    const reportPath = path.join(reportParsed.dir, reportName);

    // Detect U1 proprietary commands from original content
    const u1Detected = content.includes("PRINT_START") ||
      content.includes("SM_PRINT_AUTO_FEED") ||
      content.includes("SM_PRINT_FLOW_CALIBRATE") ||
      content.includes("DEFECT_DETECTION");

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    let reportContent = `# G-code 优化报告\n\n`;
    reportContent += `| 项目 | 值 |\n|---|---|\n`;
    reportContent += `| **源文件** | ${gcodeName} |\n`;
    reportContent += `| **优化时间** | ${timestamp} |\n`;
    reportContent += `| **发现问题数** | ${aiResult.issues_found || 0} |\n`;
    reportContent += `| **U1 专有指令** | ${u1Detected ? "是" : "否"} |\n\n`;

    reportContent += `## AI 诊断\n\n${aiResult.diagnosis || "无"}\n\n`;

    reportContent += `## AI 总结\n\n${aiResult.summary || "无"}\n\n`;

    reportContent += `## 已应用操作\n\n`;
    if (appliedOps.length > 0) {
      reportContent += `| # | 操作 | 原因 |\n|---|---|---|\n`;
      const allPatches = patchPlan.filter(p => appliedOps.includes(p.operation));
      // Build a map: operation -> list of patches (for reason lookup)
      const opReasonMap = {};
      for (const p of allPatches) {
        if (!opReasonMap[p.operation]) opReasonMap[p.operation] = [];
        opReasonMap[p.operation].push(p.reason || "-");
      }
      let opIdx = 1;
      for (const op of appliedOps) {
        const reasons = opReasonMap[op] ? opReasonMap[op].join("; ") : "-";
        reportContent += `| ${opIdx} | ${op} | ${reasons} |\n`;
        opIdx++;
      }
    } else {
      reportContent += `*无操作被应用*\n`;
    }
    reportContent += `\n`;

    reportContent += `## 补丁计划详情\n\n`;
    if (patchPlan.length > 0) {
      reportContent += `| # | 操作 | 目标 | 原因 |\n|---|---|---|---|\n`;
      patchPlan.forEach((p, i) => {
        reportContent += `| ${i + 1} | ${p.operation} | ${p.target || "-"} | ${p.reason || "-"} |\n`;
      });
    } else {
      reportContent += `*AI 未建议任何补丁*\n`;
    }
    reportContent += `\n`;

    reportContent += `## 原始统计\n\n`;
    reportContent += `| 指标 | 值 |\n|---|---|\n`;
    reportContent += `| **总行数** | ${stats.total_lines} |\n`;
    reportContent += `| **层数** | ${stats.layers} |\n`;
    reportContent += `| **回抽次数** | ${stats.retracts} |\n`;
    reportContent += `| **最大速度** | ${stats.max_speed} mm/min |\n`;
    reportContent += `| **最小速度** | ${stats.min_speed} mm/min |\n`;
    reportContent += `| **热端温度** | ${(stats.temperatures.hotend || []).join(", ") || "未检测到"} °C |\n`;
    reportContent += `| **热床温度** | ${(stats.temperatures.bed || []).join(", ") || "未检测到"} °C |\n`;
    reportContent += `| **风扇速度** | ${(stats.fan_speeds || []).join(", ") || "未检测到"} |\n`;
    reportContent += `| **打印移动** | ${stats.print_moves} |\n`;
    reportContent += `| **空走移动** | ${stats.travel_moves} |\n`;
    reportContent += `| **总挤出量** | ${stats.total_extrusion_e.toFixed(2)} mm |\n`;
    if (stats.warnings && stats.warnings.length > 0) {
      reportContent += `\n### 警告\n\n`;
      for (const w of stats.warnings) {
        reportContent += `- **[${w.severity}]** ${w.message}\n`;
      }
    }

    fs.writeFileSync(reportPath, reportContent, "utf-8");
    optimizedReportName = reportName;
  }

  return {
    diagnosis: aiResult.diagnosis || "",
    issues_found: aiResult.issues_found || 0,
    summary: aiResult.summary || "",
    patches_applied: totalPatchesApplied,
    applied_operations: appliedOps,
    optimized_gcode_name: optimizedGcodeName,
    optimization_report_name: optimizedReportName,
    original_stats: stats,
  };
}

// ─── AI 打印难题问答 ───

async function printQA(question, context, aiConfig) {
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error(`Unknown AI provider: ${aiConfig.provider}`);

  const model = aiConfig.model || provider.defaultModel;
  const apiKey = aiConfig.apiKey || (provider.isLocal ? "no-key" : "");
  if (!apiKey && !provider.isLocal) throw new Error(`API key not configured for ${provider.name}`);

  const baseUrl = aiConfig.customBaseUrl || provider.baseUrl;

  const systemPrompt = buildSystemPrompt("print_qa", {
    taskInstructions: `## 当前任务：打印难题问答

你是一位专业的 FDM 3D 打印工程师，专门解答用户的打印问题。

回答要求：
- 简洁直接，先给结论再解释
- 只针对用户问到的部分回答，不要面面俱到
- 如涉及参数调整，给出具体数值（针对 Snapmaker U1，热床 270×270mm）
- 如适用，给出相关 G-code 指令
- 如果信息不足，简短追问关键信息（耗材类型、层高、温度等）

使用中文回答。`,
  });

  let userPrompt = `## 用户问题\n${question}`;
  if (context) {
    userPrompt += `\n\n## 附加上下文\n${context}`;
  }

  const url = `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "no-key") headers["Authorization"] = `Bearer ${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI API error: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || "";

  return content;
}

// ─── G-code 格式转换（BambuStudio → OrcaSlicer 兼容） ───

function convertGcode(gcodeName) {
  const gcodePath = getGcodePath(gcodeName);
  if (!gcodePath) throw new Error(`G-code not found: ${gcodeName}`);

  let content = fs.readFileSync(gcodePath, "utf-8");

  // Parse block structure
  const headerStart = content.indexOf("; HEADER_BLOCK_START");
  const headerEnd = content.indexOf("; HEADER_BLOCK_END");
  const configStart = content.indexOf("; CONFIG_BLOCK_START");
  const configEnd = content.indexOf("; CONFIG_BLOCK_END");
  const thumbStart = content.indexOf("; THUMBNAIL_BLOCK_START");
  const thumbEnd = content.indexOf("; THUMBNAIL_BLOCK_END");
  const execStart = content.indexOf("; EXECUTABLE_BLOCK_START");
  const execEnd = content.indexOf("; EXECUTABLE_BLOCK_END");

  // Check if this looks like a BambuStudio gcode (has blocks)
  if (headerStart === -1 || execStart === -1) {
    throw new Error("Not a valid BambuStudio gcode file (missing HEADER/EXEC blocks)");
  }

  // Check if already OrcaSlicer format by layer marker style
  // BambuStudio uses "; FEATURE:", OrcaSlicer uses ";TYPE:" — this is the most reliable differentiator
  if (content.includes(";TYPE:")) {
    throw new Error("该文件已是 OrcaSlicer 格式（包含 ;TYPE: 层标记），无需转换。请选择 BambuStudio 生成的 G-code 文件进行转换。");
  }
  if (!content.includes("; FEATURE:")) {
    throw new Error("该文件既不包含 BambuStudio 层标记（; FEATURE:）也不包含 OrcaSlicer 层标记（;TYPE:），无法识别格式。");
  }

  const headerBlock = headerStart >= 0 && headerEnd >= 0
    ? content.substring(headerStart, headerEnd + "; HEADER_BLOCK_END".length) : "";
  const configBlock = configStart >= 0 && configEnd >= 0
    ? content.substring(configStart, configEnd + "; CONFIG_BLOCK_END".length) : "";
  const thumbBlock = thumbStart >= 0 && thumbEnd >= 0
    ? content.substring(thumbStart, thumbEnd + "; THUMBNAIL_BLOCK_END".length) : "";
  const execBlock = execStart >= 0 && execEnd >= 0
    ? content.substring(execStart, execEnd + "; EXECUTABLE_BLOCK_END".length) : "";

  // Extract print body from EXECUTABLE_BLOCK
  // BambuStudio puts everything inside EXECUTABLE_BLOCK, so we need to find the print body start
  // The print body starts after ;MACHINE_START_GCODE_END or after the first ;BEFORE_LAYER_CHANGE
  let printBody = "";
  const machineStartEndIdx = content.indexOf("; MACHINE_START_GCODE_END");
  if (machineStartEndIdx >= 0) {
    // Print body starts after MACHINE_START_GCODE_END
    printBody = content.substring(machineStartEndIdx + "; MACHINE_START_GCODE_END".length);
  } else {
    // Fallback: use everything after EXECUTABLE_BLOCK_END
    const bodyStart = execEnd >= 0 ? execEnd + "; EXECUTABLE_BLOCK_END".length : 0;
    printBody = content.substring(bodyStart);
  }

  // Extract info from EXECUTABLE_BLOCK for conversion
  const execContent = execBlock;

  // Find temperatures from entire file (EXEC block only has preheat temps like S140,
  // actual print temps like S220 are in the print body)
  const hotendTemps = [];
  const bedTemps = [];
  const m104Matches = content.matchAll(/M104\s+(?:T(\d+)\s+)?S(\d+)/g);
  for (const m of m104Matches) {
    hotendTemps.push({ tool: m[1] ? parseInt(m[1]) : 0, temp: parseInt(m[2]) });
  }
  const m109Matches = content.matchAll(/M109\s+(?:T(\d+)\s+)?S(\d+)/g);
  for (const m of m109Matches) {
    hotendTemps.push({ tool: m[1] ? parseInt(m[1]) : 0, temp: parseInt(m[2]) });
  }
  const m140Matches = content.matchAll(/M140\s+S(\d+)/g);
  for (const m of m140Matches) {
    bedTemps.push(parseInt(m[1]));
  }
  const m190Matches = content.matchAll(/M190\s+S(\d+)/g);
  for (const m of m190Matches) {
    bedTemps.push(parseInt(m[1]));
  }

  // Find first tool used
  const firstToolMatch = execContent.match(/^T(\d+)/m);
  const firstTool = firstToolMatch ? parseInt(firstToolMatch[1]) : 0;

  // Get primary temperatures: use the highest hotend temp (actual print temp, not preheat)
  // BambuStudio EXEC block has M104 S140 (preheat), actual M109 S220 is in the print body
  const primaryHotendTemp = hotendTemps.length > 0
    ? Math.max(...hotendTemps.map(t => t.temp))
    : 200;
  const primaryBedTemp = bedTemps.length > 0
    ? Math.max(...bedTemps)
    : 60;

  // Find total layers from body
  const layerMatches = content.match(/;BEFORE_LAYER_CHANGE/g) || content.match(/;LAYER:\d+/g);
  const totalLayers = layerMatches ? layerMatches.length : 0;

  // Detect multi-extruder from body
  const toolChanges = new Set();
  const tMatches = printBody.matchAll(/^T(\d+)/gm);
  for (const m of tMatches) toolChanges.add(parseInt(m[1]));
  toolChanges.add(firstTool);
  const usedTools = [...toolChanges].sort();

  log("INFO", `G-code convert: hotend=${primaryHotendTemp}°C bed=${primaryBedTemp}°C firstTool=T${firstTool} layers=${totalLayers} tools=[${usedTools.join(',')}]`);

  // Build OrcaSlicer-compatible EXECUTABLE_BLOCK
  // Strategy: keep existing EXCLUDE_OBJECT_DEFINE, M73, M106, PRINT_START sequence
  // Replace BambuStudio-specific commands (MOVE_TO_*, ROUGHLY_CLEAN, etc.) with OrcaSlicer flow
  let newExecBlock = "; EXECUTABLE_BLOCK_START\n";

  // Extract pre-PRINT_START content (EXCLUDE_OBJECT_DEFINE, M73, M106, etc.)
  const execLines = execContent.split('\n');
  const printStartIdx = execLines.findIndex(l => l.trim() === 'PRINT_START');
  if (printStartIdx > 0) {
    // Keep lines before PRINT_START (EXCLUDE_OBJECT_DEFINE, M73, M106, etc.)
    newExecBlock += execLines.slice(1, printStartIdx).join('\n') + '\n'; // skip EXECUTABLE_BLOCK_START line
  }

  // Keep PRINT_START + DEFECT_DETECTION_START + SET_PRINT_STATS_INFO + TIMELAPSE_START
  newExecBlock += "PRINT_START\n";
  newExecBlock += "DEFECT_DETECTION_START\n";
  if (totalLayers > 0) {
    newExecBlock += `SET_PRINT_STATS_INFO TOTAL_LAYER=${totalLayers} CURRENT_LAYER=0\n`;
  }
  newExecBlock += "TIMELAPSE_START\n";
  newExecBlock += `M140 S${primaryBedTemp}\n`;
  // Preheat all used tools to standby temp
  for (const tool of usedTools) {
    newExecBlock += `M104 T${tool} S140\n`;
  }
  newExecBlock += "M204 S10000\n";

  // OrcaSlicer-style flow: bed mesh → wait temps → auto feed → flow calibrate
  newExecBlock += "G28 X Y\n";
  newExecBlock += "DEFECT_DETECT_NOODLE_FIRST\n";
  newExecBlock += `T${firstTool}\n`;
  newExecBlock += "G90\n";
  newExecBlock += "DEFECT_DETECTION_DETECT_BED\n";
  newExecBlock += "SM_PRINT_CHECK_SWITCH_EXTRUDER\n";
  for (const tool of usedTools) {
    if (tool !== firstTool) {
      newExecBlock += `SM_PRINT_EXTRUDER_PREHEAT EXTRUDER=${tool} TEMP=140\n`;
    }
  }
  newExecBlock += `SM_PRINT_AUTO_FEED EXTRUDER=${firstTool}\n`;
  newExecBlock += `SM_PRINT_FLOW_CALIBRATE EXTRUDER=${firstTool}\n`;
  for (const tool of usedTools) {
    if (tool !== firstTool) {
      newExecBlock += `SM_PRINT_AUTO_FEED EXTRUDER=${tool}\n`;
      newExecBlock += `SM_PRINT_FLOW_CALIBRATE EXTRUDER=${tool}\n`;
    }
  }
  // Turn off all extruders before cleaning (OrcaSlicer standard flow)
  for (const tool of usedTools) {
    newExecBlock += `M104 S0 T${tool} A0\n`;
  }
  newExecBlock += `M104 T${firstTool} S130\n`;

  // Rough clean + detect bed plate + deep clean + fine home (OrcaSlicer standard flow)
  newExecBlock += `T${firstTool}\n`;
  newExecBlock += "M106 S255\n";
  newExecBlock += "M106 P2 S0\n";
  newExecBlock += "MOVE_TO_DISCARD_FILAMENT_POSITION\n";
  newExecBlock += `M109 T${firstTool} S130\n`;
  newExecBlock += "ROUGHLY_CLEAN_NOZZLE_WITH_DISCARD\n";
  newExecBlock += "MOVE_TO_XY_IDLE_POSITION_EXTRUDER\n";
  newExecBlock += "G28 Z I140 J140\n";
  newExecBlock += "DETECT_BED_PLATE\n";
  newExecBlock += "G90\n";
  newExecBlock += "G0 Z5 F10000\n";
  newExecBlock += "MOVE_TO_DISCARD_FILAMENT_POSITION\n";
  newExecBlock += "M109 S170\n";
  newExecBlock += "ROUGHLY_CLEAN_NOZZLE\n";
  newExecBlock += "MOVE_TO_XY_IDLE_POSITION_EXTRUDER\n";
  newExecBlock += "FINELY_CLEAN_NOZZLE_STAGE_1\n";
  newExecBlock += `M104 S130\n`;
  newExecBlock += "G0 Z5 F10000\n";
  newExecBlock += "MOVE_TO_DISCARD_FILAMENT_POSITION\n";
  newExecBlock += "ROUGHLY_CLEAN_NOZZLE\n";
  newExecBlock += "MOVE_TO_XY_IDLE_POSITION_EXTRUDER\n";
  newExecBlock += "FINELY_CLEAN_NOZZLE_STAGE_2\n";

  // Fine home
  newExecBlock += "M106 S255\n";
  newExecBlock += `M109 S130\n`;
  newExecBlock += `M190 S${primaryBedTemp}\n`;
  newExecBlock += "M107 P2\n";
  newExecBlock += "G90\n";
  newExecBlock += "G0 Z5 F10000\n";
  newExecBlock += "G28 Z\n";

  // Bed mesh calibration
  newExecBlock += "BED_MESH_CALIBRATE PROBE_COUNT=11,11\n";

  // Draw prime line (OrcaSlicer standard flow)
  newExecBlock += "G90\n";
  newExecBlock += "G1 Z1.5\n";
  newExecBlock += "G0 X85 Y1 Z2 F18000\n";
  newExecBlock += `M109 S${primaryHotendTemp}\n`;
  newExecBlock += "G1 Z0.2\n";
  newExecBlock += "M83\n";
  newExecBlock += "G1 X185 E15 F360\n";
  newExecBlock += "G1 Z1.5\n";

  // Post prime line setup (OrcaSlicer standard)
  newExecBlock += "G90\n";
  newExecBlock += "M106 S0\n";
  newExecBlock += "G90\n";
  newExecBlock += "G21\n";
  newExecBlock += "M83 ; use relative distances for extrusion\n";

  newExecBlock += "; EXECUTABLE_BLOCK_END\n";

  // Convert print body: replace BambuStudio Start G-code with OrcaSlicer format
  // Find where actual printing starts (first ;LAYER:0 or first G1 with E value after EXEC)
  let convertedBody = printBody;

  // Remove BambuStudio-specific pre-print commands from body start
  // Find where actual printing starts (first ;BEFORE_LAYER_CHANGE or ;LAYER:0)
  const layerStartMarker = convertedBody.includes(";BEFORE_LAYER_CHANGE")
    ? ";BEFORE_LAYER_CHANGE"
    : ";LAYER:0";
  const layer0Idx = convertedBody.indexOf(layerStartMarker);
  if (layer0Idx > 0) {
    const beforeLayer0 = convertedBody.substring(0, layer0Idx);
    const afterLayer0 = convertedBody.substring(layer0Idx);

    // Filter out BambuStudio-specific pre-print commands that are now handled by PRINT_START
    // Keep standard G-code commands (G90, G21, M83, etc.) that are needed for printing
    const lines = beforeLayer0.split("\n");
    const filteredLines = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines at the very start
      if (trimmed === "" && filteredLines.length === 0) continue;
      // Skip BambuStudio-specific commands now handled by PRINT_START
      if (/^M10[49]\s/.test(trimmed) && !trimmed.includes("S0")) continue; // M104/M109 temp set (keep S0/off)
      if (/^M1[49]0\s/.test(trimmed)) continue; // M140/M190 bed temp
      if (/^T\d\s*$/.test(trimmed)) continue;    // Tool changes
      if (/^G28\b/.test(trimmed)) continue;       // Home
      if (/^M106\s/.test(trimmed) && !trimmed.includes("P2") && !trimmed.includes("P3")) continue; // Main fan
      if (/^M106 P[23]\s/.test(trimmed)) continue; // Aux fans
      if (/^M400\b/.test(trimmed)) continue;       // Wait
      if (/^M220\s/.test(trimmed)) continue;       // Speed override
      if (/^M221\s/.test(trimmed)) continue;       // Flow override
      if (/^G92 E0\b/.test(trimmed)) continue;     // E reset
      if (trimmed.startsWith(";_FORCE_RESUME")) continue;
      if (trimmed.startsWith("; Change Tool")) continue;
      if (/^MOVE_TO_/.test(trimmed)) continue;     // BambuStudio-specific moves
      if (/^ROUGHLY_CLEAN/.test(trimmed)) continue;
      if (/^CLEAN_NOZZLE/.test(trimmed)) continue;
      if (/^FINELY_CLEAN/.test(trimmed)) continue;
      if (/^BED_MESH/.test(trimmed)) continue;
      if (/^SET_LED/.test(trimmed)) continue;
      if (/^DETECT_BED/.test(trimmed)) continue;
      if (/^SM_PRINT_/.test(trimmed)) continue;    // U1 specific (handled by new EXEC)
      if (/^DEFECT_DETECTION_DETECT_BED/.test(trimmed)) continue;
      if (/^EXCLUDE_OBJECT_DEFINE/.test(trimmed)) continue; // Moved to EXEC block
      if (/^M73\s/.test(trimmed) && trimmed.includes("P0")) continue; // Initial progress
      if (/^DEFECT_DETECT_NOODLE_FIRST/.test(trimmed)) continue; // OrcaSlicer-specific noodle detect (handled by EXEC)
      if (/^M107\b/.test(trimmed)) continue;       // Fan off (redundant with M106 S0)
      if (trimmed === "; MACHINE_END_GCODE_START") continue;
      if (trimmed === "; MACHINE_START_GCODE_END") continue;
      // Keep everything else (G90, G21, M83, comments, G1 moves, etc.)
      filteredLines.push(line);
    }

    convertedBody = filteredLines.join("\n") + "\n" + afterLayer0;
  }

  // Remove residual EXECUTABLE_BLOCK_END from print body (BambuStudio puts it at the end of body)
  // The new EXEC block already has its own EXECUTABLE_BLOCK_END
  convertedBody = convertedBody.replace(/^; EXECUTABLE_BLOCK_END\s*$/gm, "");

  // Convert End G-code: check if it needs conversion
  // BambuStudio with U1 profile already uses PRINT_END/TIMELAPSE_STOP (OrcaSlicer-compatible)
  // Only replace if it uses BambuStudio-specific end commands
  const endPatterns = [
    "; --- end ---",
    "; End G-code",
    "; end gcode",
  ];
  let endIdx = -1;
  for (const pattern of endPatterns) {
    endIdx = convertedBody.indexOf(pattern);
    if (endIdx >= 0) break;
  }

  // Only replace end gcode if it's NOT already OrcaSlicer format (PRINT_END)
  if (endIdx >= 0 && !convertedBody.includes("PRINT_END")) {
    const beforeEnd = convertedBody.substring(0, endIdx);
    // Build OrcaSlicer-compatible End G-code
    let orcaEnd = "; End G-code\n";
    orcaEnd += "M400\n";
    orcaEnd += "TIMELAPSE_STOP\n";
    orcaEnd += "DEFECT_DETECTION_STOP\n";
    orcaEnd += "SET_PRINT_STATS_INFO TOTAL_LAYER=" + totalLayers + " CURRENT_LAYER=" + totalLayers + "\n";
    orcaEnd += "M106 S0 ; Fan off\n";
    orcaEnd += "M106 P2 S0 ; Cavity fan off\n";
    orcaEnd += "M106 P3 S0 ; Exhaust fan off\n";
    for (const tool of usedTools) {
      orcaEnd += `M104 T${tool} S0 ; T${tool} off\n`;
    }
    orcaEnd += "M140 S0 ; Bed off\n";
    orcaEnd += "M84 ; Motors off\n";
    convertedBody = beforeEnd + orcaEnd;
  }

  // Assemble final file in OrcaSlicer order: HEADER → THUMB → EXEC → body → CONFIG
  let result = "";
  if (headerBlock) result += headerBlock + "\n";
  if (thumbBlock) result += thumbBlock + "\n";
  result += newExecBlock + "\n";
  result += convertedBody;
  if (configBlock) result += configBlock + "\n";

  // Key conversion: replace BambuStudio "; FEATURE:" with OrcaSlicer ";TYPE:"
  // This is the critical difference that makes the U1 device panel reject BambuStudio gcode
  result = result.replace(/; FEATURE: /g, ";TYPE:");

  // Write converted file to AI Lab gcode dir (not BambuStudio dir)
  const parsed = path.parse(gcodePath);
  const convertedName = `${parsed.name}_orca${parsed.ext}`;
  const convertedPath = path.join(GCODE_DIR, convertedName);
  fs.writeFileSync(convertedPath, result, "utf-8");

  log("INFO", `G-code convert: saved to ${convertedName}`);

  return {
    converted: true,
    converted_gcode_name: convertedName,
    conversions: {
      exec_block: "Replaced with OrcaSlicer PRINT_START format",
      start_gcode: "Replaced BambuStudio-specific commands with OrcaSlicer flow",
      end_gcode: "Kept existing PRINT_END format",
      layout: "Reorganized to HEADER→THUMB→EXEC→body→CONFIG",
      feature_type: 'Replaced "; FEATURE:" with ";TYPE:" (critical for U1 device panel)',
    },
    info: {
      hotend_temp: primaryHotendTemp,
      bed_temp: primaryBedTemp,
      first_tool: firstTool,
      used_tools: usedTools,
      total_layers: totalLayers,
    },
  };
}

// ─── 导出 ───

module.exports = {
  AI_PROVIDERS,
  SLICE_FILAMENT_RULES,
  VOXELFLOW_BIN,
  sliceJobs,
  createJobId,
  setAppDataDir,
  loadWorkspace,
  buildSystemPrompt,
  updateMemory,
  analyzeModel,
  sliceModel,
  computeSliceAnalysis,
  suggestParameters,
  generateGcodeFromAnalysis,
  validateGcode,
  extractGcodeStats,
  reviewGcode,
  printQA,
  generateRecommendationReason,
  testAiConnection,
  saveModelFile,
  saveStlFile,
  getStlInfo,
  listModelFiles,
  listStlFiles,
  getGcodePath,
  listGcodeFiles,
  saveGcodeFile,
  patchGcode,
  optimizeGcode,
  convertGcode,
  regenerateFromRawPath,
  advancedSlice,
  setRawPathCache,
  setLogFn,
  STL_DIR: () => STL_DIR,
  GCODE_DIR: () => GCODE_DIR,
  WORKSPACE_DIR: () => WORKSPACE_DIR,
};
