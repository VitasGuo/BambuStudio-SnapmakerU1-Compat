/**
 * BambuStudio Bridge AI Lab — Slice Agent 核心模块
 * 功能：G-code 优化引擎 + G-code 转换引擎（BambuStudio→OrcaSlicer 兼容）+ Workspace 系统
 * 从 VoxelFlow web/slice_agent.js 提取，移除了 AGENT_TOOLS/AGENT_RESOURCES/executeAgentPlan 等
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { AiClient, AI_PROVIDERS, extractErrorMessage } = require("./aiClient");

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

  // 4. Memory — 所有任务都包含
  if (ws["memory.md"]) sections.push(ws["memory.md"]);

  // 5. 额外上下文（模型分析数据、切片结果等）
  if (extraContext.taskInstructions) {
    sections.push(extraContext.taskInstructions);
  }

  return sections.filter(Boolean).join("\n\n---\n\n");
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

    // G92 E<value> — reset extruder position (NOT a retract, NOT an extrusion).
    // Must be handled before the E-match below, otherwise G92 E0 would look like
    // a huge retract (e=0 < lastE) and inflate stats.retracts.
    const g92eMatch = trimmed.match(/^G92\s+.*?\bE(-?[\d.]+)/i);
    if (g92eMatch) {
      lastE = parseFloat(g92eMatch[1]);
      if (lastE > stats.max_e_value) stats.max_e_value = lastE;
      // Still allow other axes parsing below (fall through, but skip E-stat block)
    }

    // Retract (negative E or G10) — skip if this line was a G92 E reset
    const eMatch = trimmed.match(/E(-?[\d.]+)/);
    if (eMatch && !g92eMatch) {
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

// ─── AI 连接测试 ───

async function testAiConnection(aiConfig) {
  try {
    const client = new AiClient(aiConfig);
    const result = await client.listModels();
    return {
      ok: true,
      provider: client.provider.name,
      models: result.models,
      defaultModel: result.defaultModel,
      currentModel: result.currentModel,
    };
  } catch (e) {
    return { ok: false, error: extractErrorMessage(e) };
  }
}

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
            // fs.readFileSync ignores {start,end} options — use openSync+readSync to read only first 32KB
            const fd = fs.openSync(filePath, "r");
            try {
              const buf = Buffer.alloc(32768);
              const bytesRead = fs.readSync(fd, buf, 0, 32768, 0);
              const head = buf.slice(0, bytesRead).toString("utf-8");
              if (head.includes("; FEATURE:")) format = "bambu";
              else if (head.includes(";TYPE:")) format = "orca";
            } finally {
              fs.closeSync(fd);
            }
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

// ─── G-code Patcher ───

/**
 * Apply patch plan to G-code content (pure function, no file I/O).
 * Extracted from patchGcode for testability. (v5.37.0)
 * Operations: replace_speed / add_retract / replace_fan / modify_temperature / insert_line
 * @returns {{ content: string, patchesApplied: number }}
 */
function patchGcodeContent(content, patchPlan) {
  if (!patchPlan || patchPlan.length === 0) return { content, patchesApplied: 0 };

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
        // Fixes:
        // 1. Retract must be inserted BEFORE the travel move (not after) — retracting after travel does nothing
        // 2. Use min_travel_length to skip short travels (no need to retract for <5mm moves)
        // 3. Match both G0 and G1 travel moves (OrcaSlicer uses G1 for travel with F but no E)
        const { retract_length, min_travel_length = 5.0 } = patch;
        const lines = content.split('\n');
        const newLines = [];
        let curX = null, curY = null;
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          // Detect travel moves: G0/G1 with X/Y but no E parameter
          const travelMatch = ln.match(/G[01]\s+X([\d.-]+)\s+Y([\d.-]+)/);
          if (travelMatch && !/\bE[\d.-]/.test(ln)) {
            const targetX = parseFloat(travelMatch[1]);
            const targetY = parseFloat(travelMatch[2]);
            // Compute travel distance from last known position
            let isLongTravel = true;
            if (curX !== null && curY !== null && typeof min_travel_length === 'number') {
              const dx = targetX - curX;
              const dy = targetY - curY;
              isLongTravel = Math.sqrt(dx * dx + dy * dy) >= min_travel_length;
            }
            // Avoid duplicate retract: check last line in output buffer
            const prevOut = newLines.length > 0 ? newLines[newLines.length - 1] : '';
            if (isLongTravel && !prevOut.includes('retract')) {
              newLines.push(`G1 E-${retract_length} F2400 ; agent-added retract`);
              patchesApplied++;
            }
            newLines.push(ln);
            curX = targetX;
            curY = targetY;
          } else {
            // Track position from any G0/G1 with X/Y (extrusion moves update position too)
            const xyMatch = ln.match(/G[01]\s+X([\d.-]+)\s+Y([\d.-]+)/);
            if (xyMatch) {
              curX = parseFloat(xyMatch[1]);
              curY = parseFloat(xyMatch[2]);
            }
            newLines.push(ln);
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

  return { content, patchesApplied };
}

/**
 * Patch G-code file with patch plan. Reads file, applies patches via
 * patchGcodeContent, writes result with _patched suffix.
 */
function patchGcode(gcodeName, patchPlan) {
  const gcodePath = getGcodePath(gcodeName);
  if (!gcodePath) throw new Error(`G-code not found: ${gcodeName}`);
  if (!patchPlan || patchPlan.length === 0) return { patched: false, patches_applied: 0 };

  const originalContent = fs.readFileSync(gcodePath, 'utf-8');
  const { content, patchesApplied } = patchGcodeContent(originalContent, patchPlan);

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

// ─── AI 优化 G-code ───

async function optimizeGcode(gcodeName, aiConfig) {
  const gcodePath = getGcodePath(gcodeName);
  if (!gcodePath) throw new Error(`G-code not found: ${gcodeName}`);

  // Step 1: Read and extract stats
  const content = fs.readFileSync(gcodePath, "utf-8");
  const stats = extractGcodeStats(content);

  // Step 2: Call AI for diagnosis and patch plan
  const client = new AiClient(aiConfig);

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

  const resp = await client.chat({
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    maxTokens: 3000,
  });

  const data = await resp.json();
  const aiContent = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || "";

  let aiResult;
  try {
    aiResult = AiClient.parseJsonContent(aiContent);
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

/** 流式打印问答 — 返回 streamId，通过 qaStreams 供轮询读取 */
const qaStreams = new Map();

async function printQAStream(question, context, aiConfig) {
  const client = new AiClient(aiConfig);

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

  const streamId = "qa_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const streamState = { thinkingChunks: [], answerChunks: [], done: false, error: null };
  qaStreams.set(streamId, streamState);

  // 后台启动流式请求
  (async () => {
    try {
      const resp = await client.chat({
        systemPrompt,
        userPrompt,
        temperature: 0.5,
        maxTokens: 4096,
        stream: true,
      });

      // Use async iterator instead of resp.body.getReader() — node-fetch v2
      // returns a Node.js Readable stream (not Web ReadableStream), so
      // getReader() may be undefined and throw TypeError. Async iteration
      // works on both Node streams and Web ReadableStreams. (traps.md #138)
      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of resp.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // 保留未完成的行

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            streamState.done = true;
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;
            const thinkingDelta = choice.delta?.reasoning_content || "";
            const answerDelta = choice.delta?.content || "";
            if (thinkingDelta) streamState.thinkingChunks.push(thinkingDelta);
            if (answerDelta) streamState.answerChunks.push(answerDelta);
          } catch { /* skip malformed JSON */ }
        }
      }
      streamState.done = true;
    } catch (e) {
      log("ERROR", `printQAStream stream error: ${extractErrorMessage(e)}`);
      streamState.error = extractErrorMessage(e);
      streamState.done = true;
    } finally {
      // Fallback cleanup — if client stops polling (browser closed, network drop),
      // streamState would leak in qaStreams forever. Schedule delayed removal so
      // clients have a 30s window to poll the final state before eviction.
      setTimeout(() => {
        try { qaStreams.delete(streamId); } catch (_) {}
      }, 30000);
    }
  })();

  return streamId;
}

/** 轮询流式会话 — 返回分类的新 chunk 列表和完成状态 */
function pollQAStream(streamId) {
  const state = qaStreams.get(streamId);
  if (!state) return { ok: false, error: "stream not found" };

  const newThinking = state.thinkingChunks.splice(0);
  const newAnswer = state.answerChunks.splice(0);
  return {
    ok: true,
    thinking: newThinking,
    chunks: newAnswer,
    done: state.done,
    error: state.error || null,
  };
}

/** 清理已完成的流式会话 */
function cleanupQAStream(streamId) {
  qaStreams.delete(streamId);
}

// ─── G-code 格式转换（BambuStudio → OrcaSlicer 兼容） ───

/**
 * Convert BambuStudio G-code content to OrcaSlicer-compatible format (pure function, no file I/O).
 * Extracted from convertGcode for testability. (v5.37.0)
 * @param {string} content - Original BambuStudio G-code content
 * @returns {{ content: string, info: object }}
 * @throws {Error} if content is not valid BambuStudio format or already OrcaSlicer format
 */
function convertGcodeContent(content) {
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
  // Note: EXECUTABLE_BLOCK_END is NOT added here — it goes after the print body
  // (PRINT_END), wrapping the entire print process inside EXECUTABLE_BLOCK to
  // match OrcaSlicer native format. (traps.md #141)

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

  // Add EXECUTABLE_BLOCK_END at the end of body, wrapping the entire print process
  // (start code + body + PRINT_END) inside EXECUTABLE_BLOCK. This matches OrcaSlicer
  // native format where EXECUTABLE_BLOCK encompasses the whole print. (traps.md #141)
  convertedBody = convertedBody.trimEnd() + "\n; EXECUTABLE_BLOCK_END\n";

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

  return {
    content: result,
    info: {
      hotend_temp: primaryHotendTemp,
      bed_temp: primaryBedTemp,
      first_tool: firstTool,
      used_tools: usedTools,
      total_layers: totalLayers,
    },
  };
}

/**
 * Convert BambuStudio G-code file to OrcaSlicer-compatible format.
 * Reads file, converts via convertGcodeContent, writes result with _orca suffix.
 */
function convertGcode(gcodeName) {
  const gcodePath = getGcodePath(gcodeName);
  if (!gcodePath) throw new Error(`G-code not found: ${gcodeName}`);

  const originalContent = fs.readFileSync(gcodePath, "utf-8");
  const { content, info } = convertGcodeContent(originalContent);

  // Write converted file to AI Lab gcode dir (not BambuStudio dir)
  const parsed = path.parse(gcodePath);
  const convertedName = `${parsed.name}_orca${parsed.ext}`;
  const convertedPath = path.join(GCODE_DIR, convertedName);
  fs.writeFileSync(convertedPath, content, "utf-8");

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
    info,
  };
}

// ─── 导出 ───

module.exports = {
  AI_PROVIDERS,
  VOXELFLOW_BIN,
  setAppDataDir,
  loadWorkspace,
  buildSystemPrompt,
  extractGcodeStats,
  printQAStream,
  pollQAStream,
  cleanupQAStream,
  testAiConnection,
  getGcodePath,
  listGcodeFiles,
  saveGcodeFile,
  patchGcode,
  patchGcodeContent,
  optimizeGcode,
  convertGcode,
  convertGcodeContent,
  setRawPathCache,
  setLogFn,
  STL_DIR: () => STL_DIR,
  GCODE_DIR: () => GCODE_DIR,
  WORKSPACE_DIR: () => WORKSPACE_DIR,
};
