const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { WebSocketServer, WebSocket } = require("ws");
const fetch = require("node-fetch");
const { showPrintDialog } = require("./dialog");
const sliceAgent = require("./slice_agent");
const { getBridgeDataDir } = require("./paths");
const { normalizeBoolean, normalizeExtruderMapTable, startPrintWithOptions } = require("./print_job");
const { probeMoonrakerStatus } = require("./bridge_status");
const { createLocalAccessControl, loadOrCreateSessionToken } = require("./local_access");
const { createMoonrakerHeaders, createMoonrakerWebSocketOptions } = require("./moonraker_auth");
const {
  createMoonrakerProxyHeaders,
  shouldForwardMoonrakerResponseHeader,
} = require("./proxy_headers");

const BRIDGE_VERSION = "5.38.0";
const DEFAULT_PORT = 13628;
const MOONRAKER_TIMEOUT = 10000;

const APPDATA_DIR = getBridgeDataDir();
fs.mkdirSync(APPDATA_DIR, { recursive: true });

const CONFIG_FILE = path.join(APPDATA_DIR, "bridge_config.json");
const LOG_FILE = path.join(APPDATA_DIR, "bridge.log");
const SESSION_TOKEN_FILE = path.join(APPDATA_DIR, ".session_token");

const BRIDGE_DIR = path.resolve(__dirname);
const PROJECT_DIR = path.resolve(__dirname, "..");
const WEB_DIR = fs.existsSync(path.join(__dirname, "web", "webui.html"))
  ? path.join(__dirname, "web")
  : path.join(PROJECT_DIR, "bridge", "web");

let printerConfig = { host: "", port: 80, apikey: "", mode: "webui" };
let aiConfig = { provider: "", model: "", apiKey: "", customBaseUrl: "" };
let pendingPrintFile = "";
let camMonitorActive = false;
let camMonitorLastCall = 0;
const CAM_MONITOR_INTERVAL = 30000;
const bridgeWsClients = new Set();

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      const { aiConfig: savedAiConfig, ...savedPrinterConfig } = data;
      printerConfig = { ...printerConfig, ...savedPrinterConfig };
      if (savedAiConfig) aiConfig = { ...aiConfig, ...savedAiConfig };
      // Existing installations may have created this file with a permissive
      // umask. It can contain printer and AI API keys, so tighten it on read.
      try { fs.chmodSync(CONFIG_FILE, 0o600); } catch (_) {}
    } catch (e) {
      log("ERROR", `Failed to load config: ${e.message}`);
    }
  }
}

function saveConfig() {
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...printerConfig, aiConfig }, null, 2),
    { encoding: "utf-8", mode: 0o600 }
  );
  // mode only applies when a file is created; tighten existing files too.
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch (_) {}
}

function getBaseUrl() {
  if (!printerConfig.host) return "";
  return `http://${printerConfig.host}:${printerConfig.port}`;
}

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a", encoding: "utf-8", mode: 0o600 });
try { fs.chmodSync(LOG_FILE, 0o600); } catch (_) {}
const debugLog = [];
const DEBUG_LOG_MAX = 2000;

function log(level, msg) {
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  const line = `${ts} [${level}] bridge: ${msg}`;
  logStream.write(line + "\n");
  debugLog.push(line);
  if (debugLog.length > DEBUG_LOG_MAX) debugLog.splice(0, debugLog.length - DEBUG_LOG_MAX);
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

process.on("exit", () => {
  try { logStream.end(); } catch (_) {}
});

// Prevent bridge crash from unhandled errors — log and keep running
process.on("uncaughtException", (err) => {
  log("ERROR", `Uncaught exception (bridge staying alive): ${err.message}\n${err.stack}`);
});
process.on("unhandledRejection", (reason) => {
  log("ERROR", `Unhandled rejection (bridge staying alive): ${reason}`);
});

function moonrakerHeaders() {
  return createMoonrakerHeaders(printerConfig.apikey);
}

function moonrakerWebSocketOptions() {
  return createMoonrakerWebSocketOptions(printerConfig.apikey);
}

/**
 * fetch wrapper with AbortController-based timeout.
 * Replaces node-fetch v2's non-standard `timeout` option with the standard
 * Web API (AbortController + signal), which is compatible with node-fetch v2,
 * node-fetch v3, and Node.js built-in fetch. (traps.md #139)
 */
function fetchWithTimeout(url, options = {}, timeoutMs = MOONRAKER_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function moonrakerFetch(urlPath, options = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("No printer configured");
  const url = `${baseUrl}${urlPath}`;
  const headers = { ...moonrakerHeaders(), ...(options.headers || {}) };
  const resp = await fetchWithTimeout(url, { ...options, headers });
  return resp;
}

function notifyWebui(event, data = {}) {
  const msg = JSON.stringify({
    jsonrpc: "2.0",
    method: "notify_bridge_event",
    params: [event, data],
  });
  for (const ws of bridgeWsClients) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    } catch (_) {}
  }
}

async function sendGcode(script) {
  return callMoonrakerJsonRpc("printer.gcode.script", { script });
}

async function startConfiguredPrint(filename, options = {}) {
  return startPrintWithOptions(filename, options, { sendGcode, callMoonrakerJsonRpc });
}

function requestPrintOptions(source = {}) {
  return {
    autoBedLeveling: normalizeBoolean(source.autoBedLeveling ?? source.auto_bed_leveling),
    flowCalibration: normalizeBoolean(source.flowCalibration ?? source.flow_calibrate),
    timelapse: normalizeBoolean(source.timelapse ?? source.time_lapse_camera),
    extruderMapTable: normalizeExtruderMapTable(
      source.extruderMapTable ?? source.extruder_map_table ?? source.mappings
    ),
  };
}

function updatePrinterConfig(source = {}) {
  const host = typeof source.host === "string" ? source.host.trim() : "";
  if (!host || host.length > 253 || host.includes("://") || /[\/\\?#@\s]/.test(host)) {
    throw new Error("valid host is required");
  }
  const port = Number(source.port ?? 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("valid port is required");
  }

  if (Object.prototype.hasOwnProperty.call(source, "apikey")) {
    if (typeof source.apikey !== "string" || source.apikey.length > 4096) {
      throw new Error("invalid API key");
    }
  }

  printerConfig.host = host;
  printerConfig.port = port;
  if (Object.prototype.hasOwnProperty.call(source, "apikey")) printerConfig.apikey = source.apikey;
  saveConfig();
}

async function callMoonrakerJsonRpc(method, params = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("No printer configured");

  return new Promise((resolve, reject) => {
    const wsUrl = `ws://${printerConfig.host}:${printerConfig.port}/websocket`;
    let settled = false;
    const moonrakerWs = new WebSocket(wsUrl, moonrakerWebSocketOptions());
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; moonrakerWs.close(); reject(new Error("Moonraker WebSocket timeout")); }
    }, 10000);

    moonrakerWs.on("open", () => {
      const msg = JSON.stringify({
        jsonrpc: "2.0",
        method: method,
        params: params,
        id: Date.now(),
      });
      if (method === "server.files.start_local_print") {
        log("INFO", `JSON-RPC send: ${method} params=${JSON.stringify(params)}`);
      }
      moonrakerWs.send(msg);
    });

    moonrakerWs.on("message", (data) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      try {
        const resp = JSON.parse(data.toString());
        if (resp.error) {
          reject(new Error(resp.error.message || "JSON-RPC error"));
        } else {
          resolve(resp.result);
        }
      } catch (e) {
        reject(e);
      }
      moonrakerWs.close();
    });

    moonrakerWs.on("error", (err) => {
      clearTimeout(timeout);
      if (!settled) { settled = true; reject(err); }
    });

    moonrakerWs.on("close", () => {
      clearTimeout(timeout);
      if (!settled) { settled = true; reject(new Error("WebSocket closed before response")); }
    });
  });
}

const app = express();
const localAccess = createLocalAccessControl({
  port: DEFAULT_PORT,
  token: loadOrCreateSessionToken(SESSION_TOKEN_FILE),
});

app.set("etag", false);
// Reject cross-site browser traffic before parsers or upload handlers consume a
// request body. Native localhost clients remain supported without a cookie.
app.use(localAccess.httpMiddleware);
app.use(express.raw({ type: ["application/octet-stream", "application/x-gcode"], limit: "500mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "text/plain" }));

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  log("INFO", `>>> ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// JSONP callback sanitization — prevent cb parameter injection (XSS via <script> tag)
// Only allow valid JS identifier characters; reject everything else with default "callback"
app.use((req, res, next) => {
  if (req.query && req.query.cb && !/^[A-Za-z_$][\w$]*$/.test(req.query.cb)) {
    req.query.cb = "callback";
  }
  next();
});

const fluiddDir = path.join(WEB_DIR, "dist");

app.get("/fluidd/config.json", (req, res) => {
  const configPath = path.join(fluiddDir, "config.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    log("DEBUG", `Fluidd config.json served, endpoints=${JSON.stringify(config.endpoints)}`);
    res.json(config);
  } catch (e) {
    log("ERROR", `Failed to serve Fluidd config: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

if (fs.existsSync(fluiddDir)) {
  app.get("/fluidd/sw.js", (req, res) => {
    res.type("application/javascript");
    res.send("self.addEventListener('install',()=>{self.skipWaiting();});self.addEventListener('activate',()=>{self.registration.unregister();});");
    log("INFO", "Fluidd Service Worker blocked (auto-unregister)");
  });
  app.get("/fluidd/manifest.webmanifest", (req, res) => {
    res.status(404).send("Disabled");
    log("INFO", "Fluidd PWA manifest blocked");
  });
  app.use("/fluidd", express.static(fluiddDir));
}

app.get("/fluidd/{*path}", (req, res) => {
  const indexPath = path.join(fluiddDir, "index.html");
  if (fs.existsSync(indexPath)) {
    log("DEBUG", `Fluidd SPA fallback: /fluidd/${wcPath(req)}`);
    return res.sendFile(indexPath);
  }
  return res.status(404).send("Fluidd not found");
});

app.get("/", (req, res) => {
  // 始终先加载当前配置，保证状态一致性
  loadConfig();

  if (!printerConfig.host) {
    return res.type("html").send(renderSetupPage());
  }

  const webuiPath = path.join(WEB_DIR, "webui.html");
  if (fs.existsSync(webuiPath)) return res.sendFile(webuiPath);
  return res.type("html").send(renderFallbackPage());
});

app.get("/snapmaker.png", (req, res) => {
  const imgPath = path.join(WEB_DIR, "snapmaker.png");
  if (fs.existsSync(imgPath)) return res.sendFile(imgPath);
  res.status(404).send("Not found");
});

// AI Lab static assets
app.get("/ailab.css", (req, res) => {
  const p = path.join(WEB_DIR, "ailab.css");
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(404).end();
});
app.get("/ailab.js", (req, res) => {
  const p = path.join(WEB_DIR, "ailab.js");
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(404).end();
});
app.get("/gcvt.js", (req, res) => {
  const p = path.join(WEB_DIR, "gcvt.js");
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(404).end();
});

app.get("/api/bridge/config", (req, res) => {
  res.json({
    version: BRIDGE_VERSION,
    printer_host: printerConfig.host,
    printer_port: printerConfig.port,
    has_apikey: !!printerConfig.apikey,
  });
});

app.post("/api/bridge/config", (req, res) => {
  try {
    updatePrinterConfig(req.body || {});
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get("/api/bridge/config.js", (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({
    version: BRIDGE_VERSION,
    printer_host: printerConfig.host,
    printer_port: printerConfig.port,
    has_apikey: !!printerConfig.apikey,
  })});`);
});

app.get("/api/bridge/status", async (req, res) => {
  const printerStatus = await probeMoonrakerStatus(
    getBaseUrl(),
    moonrakerHeaders(),
    fetchWithTimeout,
    2500
  );
  res.json({
    version: BRIDGE_VERSION,
    config: {
      host: printerConfig.host,
      port: printerConfig.port,
      has_apikey: !!printerConfig.apikey,
      mode: printerConfig.mode,
    },
    ...printerStatus,
  });
});

app.get("/api/bridge/save_config.js", (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  res.status(405).send(`${cb}(${JSON.stringify({
    ok: false,
    error: "Configuration updates require POST /api/bridge/config",
  })});`);
});

app.get("/api/bridge/pending_print", (req, res) => {
  res.json({ filename: pendingPrintFile });
});

app.get("/api/bridge/proxy.js", async (req, res) => {
  const targetPath = req.query.path || "";
  const cb = req.query.cb || "callback";
  if (!printerConfig.host) {
    res.type("application/javascript");
    res.send(`${cb}(null);`);
    return;
  }
  try {
    const url = `${getBaseUrl()}${targetPath}`;
    const r = await fetchWithTimeout(url, { headers: moonrakerHeaders() });
    const data = await r.json();
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify(data)});`);
    log("DEBUG", `Proxy JS: ${targetPath} → ${r.status} (${JSON.stringify(data).length}b)`);
  } catch (e) {
    log("ERROR", `Proxy JS error: ${targetPath} → ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(null);`);
  }
});

app.get("/api/bridge/init-data.js", async (req, res) => {
  if (!printerConfig.host) {
    res.type("application/javascript");
    res.send("console.error('[Bridge] No printer configured');");
    return;
  }
  try {
    const url = `${getBaseUrl()}/printer/objects/query?extruder&extruder1&extruder2&extruder3&heater_bed&filament_feed%20left&filament_feed%20right&filament_parameters&gcode_move&fan&fan_generic%20cavity_fan&led%20cavity_led&print_stats&display_status`;
    const r = await fetchWithTimeout(url, { headers: moonrakerHeaders() });
    const data = await r.json();
    res.type("application/javascript");
    res.send(`onInitData(${JSON.stringify(data)});`);
    log("DEBUG", `Init data JS served (${JSON.stringify(data).length}b)`);
  } catch (e) {
    log("ERROR", `Init data JS error: ${e.message}`);
    res.type("application/javascript");
    res.send(`console.error('[Bridge] Init data failed: ${e.message}');`);
  }
});

app.get("/api/bridge/debug/logs", (req, res) => {
  const lines = parseInt(req.query.lines) || 200;
  const level = req.query.level || "";
  let logs = debugLog;
  if (level) logs = logs.filter((l) => l.includes(`[${level}]`));
  res.json({ version: BRIDGE_VERSION, total: debugLog.length, logs: logs.slice(-lines) });
});

app.get("/api/bridge/debug/export", (req, res) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", `attachment; filename="bridge-debug-${ts}.log"`);
  let content = `=== BambuStudio Bridge Debug Export ===\n`;
  content += `Version: ${BRIDGE_VERSION}\n`;
  content += `Time: ${new Date().toISOString()}\n`;
  content += `Printer: ${printerConfig.host}:${printerConfig.port}\n`;
  const safePrinterConfig = {
    ...printerConfig,
    apikey: printerConfig.apikey ? "<redacted>" : "",
  };
  content += `Config: ${JSON.stringify(safePrinterConfig, null, 2)}\n`;
  content += `Log file: ${LOG_FILE}\n`;
  content += `Web dir: ${WEB_DIR}\n`;
  content += `Bridge dir: ${BRIDGE_DIR}\n\n`;
  content += `=== Recent Logs ===\n`;
  content += debugLog.join("\n");
  res.send(content);
});

app.post("/api/bridge/confirm_print", async (req, res) => {
  if (!pendingPrintFile) return res.status(400).json({ error: "no_pending_print" });

  const filename = pendingPrintFile;
  try {
    const options = requestPrintOptions(req.body || {});
    log("INFO", `Confirm print: filename=${filename} options=${JSON.stringify(options)}`);
    const { result } = await startConfiguredPrint(filename, options);
    pendingPrintFile = "";
    log("INFO", `Print started: ${filename}`);
    res.json({ started: true, filename, result });
  } catch (e) {
    log("ERROR", `Confirm print error: ${e.message}`);
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/bridge/cancel_pending", (req, res) => {
  pendingPrintFile = "";
  res.json({ cancelled: true });
});

app.get("/api/bridge/pending_print.js", (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({ filename: pendingPrintFile })});`);
});

app.get("/api/bridge/confirm_print.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  if (!pendingPrintFile) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: "no_pending_print" })});`);
    return;
  }
  const filename = pendingPrintFile;
  try {
    const options = requestPrintOptions(req.query);
    log("INFO", `Confirm print: filename=${filename} options=${JSON.stringify(options)}`);
    const { result } = await startConfiguredPrint(filename, options);
    pendingPrintFile = "";
    log("INFO", `printer.print.start result: ${JSON.stringify(result)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ started: true, filename, result })});`);
  } catch (e) {
    log("ERROR", `confirm_print error: ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: e.message })});`);
  }
});

app.get("/api/bridge/start_print.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  const filePath = req.query.path;
  if (!filePath) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: "path_required" })});`);
    return;
  }
  try {
    const options = requestPrintOptions(req.query);
    log("INFO", `start_print: path=${filePath} options=${JSON.stringify(options)}`);
    const { result } = await startConfiguredPrint(filePath, options);
    log("INFO", `printer.print.start result: ${JSON.stringify(result)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ started: true, path: filePath, result })});`);
  } catch (e) {
    log("ERROR", `start_print error: ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: e.message })});`);
  }
});

app.get("/api/bridge/cancel_pending.js", (req, res) => {
  const cb = req.query.cb || "callback";
  pendingPrintFile = "";
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({ cancelled: true })});`);
});

app.get("/api/bridge/check_update.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const r = await fetchWithTimeout("https://api.github.com/repos/VitasGuo/BambuStudio-SnapmakerU1-Compat/releases/latest", {
      headers: { "User-Agent": "BambuStudio-Bridge" },
    }, 8000);
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const data = await r.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ latest, current: BRIDGE_VERSION, url: data.html_url || "" })});`);
  } catch (e) {
    log("WARN", `check_update failed: ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: e.message })});`);
  }
});

// Open a path (URL or directory) using the OS default handler — spawn-based, no shell, no injection
function openPathExternally(target) {
  return new Promise((resolve) => {
    let cmd, args;
    if (process.platform === "win32") {
      // explorer.exe handles both URLs (default browser) and directories
      cmd = "explorer";
      args = [target];
    } else if (process.platform === "darwin") {
      cmd = "open";
      args = [target];
    } else {
      cmd = "xdg-open";
      args = [target];
    }
    const child = spawn(cmd, args, { windowsHide: false });
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      resolve(err);
    };
    child.on("error", done);
    child.on("exit", (code) => {
      // Windows explorer returns non-zero even on success — treat as success on Windows
      if (code !== 0 && process.platform !== "win32") {
        done(new Error(`${cmd} exited with code ${code}`));
      } else {
        done(null);
      }
    });
    // Safety timeout in case neither event fires (explorer may detach)
    setTimeout(() => done(null), 2000);
  });
}

app.get("/api/bridge/open_external.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: "Invalid URL" })});`);
    return;
  }
  const err = await openPathExternally(url);
  res.type("application/javascript");
  if (err) {
    log("WARN", `open_external failed: ${err.message}`);
    res.send(`${cb}(${JSON.stringify({ error: err.message })});`);
  } else {
    log("INFO", `Opened external URL: ${url}`);
    res.send(`${cb}(${JSON.stringify({ success: true })});`);
  }
});

// 打开本地文件夹
app.get("/api/ai/open_folder.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  const target = req.query.target; // workspace | gcode | stl
  let dir;
  switch (target) {
    case "gcode": dir = sliceAgent.GCODE_DIR(); break;
    case "stl": dir = sliceAgent.STL_DIR(); break;
    default: dir = sliceAgent.WORKSPACE_DIR(); break;
  }
  const err = await openPathExternally(dir);
  res.type("application/javascript");
  // Windows explorer always returns non-zero even on success — treat as success on Windows
  if (err && process.platform !== "win32") {
    res.send(`${cb}(${JSON.stringify({ error: err.message })});`);
  } else {
    res.send(`${cb}(${JSON.stringify({ success: true, path: dir })});`);
  }
});

async function ensureCamMonitor() {
  const now = Date.now();
  if (camMonitorActive && now - camMonitorLastCall < CAM_MONITOR_INTERVAL) return;
  camMonitorLastCall = now;
  try {
    const result = await callMoonrakerJsonRpc("camera.start_monitor", { domain: "lan", interval: 0, expect_pw: true });
    camMonitorActive = true;
    log("INFO", `camera.start_monitor response: ${JSON.stringify(result)}`);
  } catch (e) {
    log("WARN", `camera.start_monitor failed: ${e.message}`);
  }
}

let camLastSize = 0;
let camStaleCount = 0;

app.get("/api/bridge/cam_snapshot", async (req, res) => {
  if (!printerConfig.host) return res.status(400).json({ error: "no_printer_configured" });
  await ensureCamMonitor();
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/server/files/camera/monitor.jpg?_t=${Date.now()}`;
  try {
    const r = await fetchWithTimeout(url, {
      method: "GET",
      headers: moonrakerHeaders(),
    });
    if (!r.ok) {
      log("DEBUG", `cam_snapshot: Moonraker returned ${r.status}`);
      return res.status(r.status).json({ error: `moonraker_${r.status}` });
    }
    const body = Buffer.from(await r.arrayBuffer());
    if (body.length === camLastSize) {
      camStaleCount++;
    } else {
      camStaleCount = 0;
    }
    camLastSize = body.length;
    res.set({
      "Content-Type": "image/jpeg",
      "Content-Length": body.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Bridge-Cam-Size": body.length,
      "X-Bridge-Cam-Stale": camStaleCount,
    });
    if (camStaleCount > 0 && camStaleCount % 10 === 0) {
      log("WARN", `cam_snapshot: same size ${body.length}b for ${camStaleCount} consecutive requests, monitor may not be active`);
    }
    return res.send(body);
  } catch (e) {
    log("ERROR", `cam_snapshot error: ${e.message}`);
    return res.status(502).json({ error: e.message });
  }
});

app.get("/api/bridge/cam_start_monitor.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  if (!printerConfig.host) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: "no_printer_configured" })});`);
    return;
  }
  try {
    const result = await callMoonrakerJsonRpc("camera.start_monitor", { domain: "lan", interval: 0, expect_pw: true });
    camMonitorLastCall = Date.now();
    let camUrl = null;
    if (result && result.url) {
      camUrl = `http://${printerConfig.host}:${printerConfig.port}/server${result.url}`;
      log("INFO", `camera.start_monitor got URL: ${camUrl}`);
    } else {
      log("INFO", `camera.start_monitor response: ${JSON.stringify(result)}`);
    }
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, url: camUrl })});`);
  } catch (e) {
    log("ERROR", `cam_start_monitor error: ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: e.message })});`);
  }
});

app.get("/api/bridge/cam_stop_monitor.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  if (!printerConfig.host) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: "no_printer_configured" })});`);
    return;
  }
  try {
    await callMoonrakerJsonRpc("camera.stop_monitor", { domain: "lan" });
    camMonitorActive = false;
    camMonitorLastCall = 0;
    log("INFO", "camera.stop_monitor sent via JSONP endpoint");
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true })});`);
  } catch (e) {
    log("ERROR", `cam_stop_monitor error: ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: e.message })});`);
  }
});

app.get("/api/bridge/debug/logs.js", (req, res) => {
  const cb = req.query.cb || "callback";
  const lines = parseInt(req.query.lines) || 200;
  const level = req.query.level || "";
  let logs = debugLog;
  if (level) logs = logs.filter((l) => l.includes(`[${level}]`));
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({ version: BRIDGE_VERSION, total: debugLog.length, logs: logs.slice(-lines) })});`);
});

app.get("/api/bridge/restart.js", (req, res) => {
  const cb = req.query.cb || "callback";
  log("INFO", "Bridge restart requested via WebUI");
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({ ok: true })});`);
  setTimeout(() => {
    const child = require("child_process").spawn(
      process.execPath,
      [process.argv[1]],
      { detached: true, stdio: "ignore", cwd: process.cwd() }
    );
    child.unref();
    process.exit(0);
  }, 500);
});

app.get("/api/bridge/scan", async (req, res) => {
  try {
    const { Bonjour } = require("bonjour-service");
    const bonjour = new Bonjour();
    const timeout = parseInt(req.query.timeout) || 5;
    const found = [];

    const browser = bonjour.find({ type: "snapmaker" }, (service) => {
      const ip = service.addresses?.[0] || service.referer?.address || "";
      const props = {};
      if (service.txt) {
        for (const [k, v] of Object.entries(service.txt)) {
          props[k] = typeof v === "string" ? v : String(v);
        }
      }
      found.push({ name: service.name, ip, port: 80, mdns_port: service.port || 80, properties: props });
    });

    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      res.json({ printers: found });
    }, timeout * 1000);
  } catch (e) {
    log("ERROR", `mDNS scan error: ${e.message}`);
    res.status(500).json({ error: e.message, printers: [] });
  }
});

/**
 * Reorder G-code block layout: move CONFIG_BLOCK to end of file.
 * Moonraker searches for CONFIG_BLOCK at file end; BambuStudio puts it at start.
 */
function patchGcodeLayout(content) {
  const headerStart = content.indexOf("; HEADER_BLOCK_START");
  const headerEnd = content.indexOf("; HEADER_BLOCK_END");
  const configStart = content.indexOf("; CONFIG_BLOCK_START");
  const configEnd = content.indexOf("; CONFIG_BLOCK_END");
  const thumbStart = content.indexOf("; THUMBNAIL_BLOCK_START");
  const thumbEnd = content.indexOf("; THUMBNAIL_BLOCK_END");
  const execStart = content.indexOf("; EXECUTABLE_BLOCK_START");
  const execEnd = content.indexOf("; EXECUTABLE_BLOCK_END");

  if (configStart === -1 || execStart === -1 || configStart > execStart) return null;

  const headerBlock = headerStart >= 0 && headerEnd >= 0 ? content.substring(headerStart, headerEnd + "; HEADER_BLOCK_END".length) : "";
  const configBlock = configStart >= 0 && configEnd >= 0 ? content.substring(configStart, configEnd + "; CONFIG_BLOCK_END".length) : "";
  const thumbBlock = thumbStart >= 0 && thumbEnd >= 0 ? content.substring(thumbStart, thumbEnd + "; THUMBNAIL_BLOCK_END".length) : "";
  const execBlock = execStart >= 0 && execEnd >= 0 ? content.substring(execStart, execEnd + "; EXECUTABLE_BLOCK_END".length) : "";

  if (!execBlock || !configBlock) return null;

  let beforeHeader = headerStart > 0 ? content.substring(0, headerStart) : "";
  let afterExecEnd = execEnd >= 0 ? content.substring(execEnd + "; EXECUTABLE_BLOCK_END".length) : "";

  let result = beforeHeader;
  if (headerBlock) result += headerBlock + "\n";
  if (thumbBlock) result += thumbBlock + "\n";
  result += execBlock + "\n";
  result += configBlock;
  result += afterExecEnd;

  return result;
}

async function handleUploadWithConfirm(req, res) {
  if (!printerConfig.host) return res.status(400).json({ error: "no_printer_configured" });

  const contentType = req.headers["content-type"] || "";
  log("INFO", `Upload request: content_type=${contentType}`);

  if (!contentType.includes("multipart")) {
    return proxyToMoonraker(req, res, "/api/files/local");
  }

  let uploadedFiles = null;
  try {
    const formidable = require("formidable");
    const form = new formidable.IncomingForm({ maxFileSize: 500 * 1024 * 1024 });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });
    uploadedFiles = files;

    const file = files.gcode?.[0] || files.file?.[0];
    if (!file) {
      log("WARN", `Upload has no file field, available keys: ${Object.keys(files).join(",")}`);
      return res.status(400).json({ error: "no_file_field" });
    }

    const printFlag = String(fields.print?.[0] || "false").toLowerCase() === "true";
    log("INFO", `Upload file: ${file.originalFilename}, print_flag=${printFlag}`);

    let fileContent = fs.readFileSync(file.filepath);
    const isGcode = /\.gcode$/i.test(file.originalFilename);
    if (isGcode) {
      const patched = patchGcodeLayout(fileContent.toString("utf-8"));
      if (patched) {
        fileContent = Buffer.from(patched, "utf-8");
        log("INFO", `G-code layout patched: CONFIG_BLOCK moved to end for ${file.originalFilename}`);
      }
    }
    const FD = require("form-data");
    const formData = new FD();
    formData.append("file", fileContent, { filename: file.originalFilename });

    const uploadHeaders = { ...moonrakerHeaders(), ...formData.getHeaders() };
    // No timeout for uploads: file size × network speed is uncontrollable.
    // Moonraker offline → TCP fails fast; Moonraker slow → must wait for large files.
    // Fixed timeout caused regression on large G-code (traps.md #148).
    const uploadResp = await fetch(`${getBaseUrl()}/server/files/upload`, {
      method: "POST",
      headers: uploadHeaders,
      body: formData,
    });

    const respData = await uploadResp.json();
    log("INFO", `Moonraker upload: status=${uploadResp.status}`);

    if (uploadResp.status === 200 || uploadResp.status === 201) {
      const uploadedPath = respData?.result?.item?.path || file.originalFilename || "";
      log("INFO", `Uploaded: ${uploadedPath}, print_flag=${printFlag}`);

      if (printFlag && uploadedPath) {
        pendingPrintFile = uploadedPath;
        log("INFO", `Showing native dialog for: ${uploadedPath}`);
        // macOS uses the native helper as the primary confirmation surface.
        // WebUI is notified only if that helper fails, avoiding two dialogs.
        if (process.platform !== "darwin") {
          notifyWebui("pending_print", { filename: uploadedPath });
        }

        try {
          const dialogResult = await showPrintDialog(uploadedPath, getBaseUrl(), printerConfig.apikey);
          if (pendingPrintFile !== uploadedPath) {
            log("INFO", `Pending print was already handled elsewhere; ignoring native dialog result for ${uploadedPath}`);
          } else if (dialogResult) {
            log("INFO", `Dialog confirmed for ${uploadedPath}; applying mappings and print preferences`);
            try {
              await startConfiguredPrint(uploadedPath, {
                auto_bed_leveling: dialogResult.auto_bed_leveling,
                flow_calibrate: dialogResult.flow_calibrate,
                time_lapse_camera: dialogResult.time_lapse_camera,
                extruder_map_table: dialogResult.extruder_map_table || dialogResult.mappings,
              });
              pendingPrintFile = "";
              log("INFO", `Print started after dialog: ${uploadedPath}`);
            } catch (e) {
              log("ERROR", `Failed to start print after dialog: ${e.message}`);
              notifyWebui("pending_print", { filename: uploadedPath, start_print_error: e.message });
            }
          } else {
            pendingPrintFile = "";
            log("INFO", `Dialog cancelled for: ${uploadedPath}`);
          }
        } catch (e) {
          if (e && e.keepPending && pendingPrintFile === uploadedPath) {
            log("WARN", `Native dialog unavailable; print remains pending in WebUI: ${e.message}`);
            notifyWebui("pending_print", { filename: uploadedPath, native_dialog_error: e.message });
          } else if (e && e.keepPending) {
            log("INFO", `Native dialog failed after pending print was already handled: ${uploadedPath}`);
          } else {
            log("ERROR", `Dialog error: ${e.message}`);
            if (pendingPrintFile === uploadedPath) pendingPrintFile = "";
          }
        }
      }

      return res.status(uploadResp.status).json({
        files: [{ name: file.originalFilename, path: uploadedPath, origin: "local" }],
        done: 1,
      });
    }

    return res.status(uploadResp.status).json(respData);
  } catch (e) {
    log("ERROR", `Upload parse error: ${e.message}`);
    return res.status(500).json({ error: `Upload failed: ${e.message}` });
  } finally {
    // Clean up formidable temp files — iterate all fields (file, gcode, etc.)
    try {
      if (uploadedFiles && typeof uploadedFiles === "object") {
        for (const key of Object.keys(uploadedFiles)) {
          const val = uploadedFiles[key];
          const arr = Array.isArray(val) ? val : [val];
          for (const f of arr) {
            if (f && f.filepath && fs.existsSync(f.filepath)) {
              try { fs.unlinkSync(f.filepath); } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
  }
}

async function proxyToMoonraker(req, res, targetPath) {
  if (!printerConfig.host) return res.status(400).json({ error: "no_printer_configured" });

  const baseUrl = getBaseUrl();
  let url = `${baseUrl}${targetPath}`;
  const qs = req.url.includes("?") ? req.url.split("?").slice(1).join("?") : "";
  if (qs) url += `?${qs}`;
  log("DEBUG", `proxyToMoonraker: ${req.method} ${url} (req.url=${req.url})`);

  const headers = createMoonrakerProxyHeaders(req.headers, moonrakerHeaders());

  try {
    const opts = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        opts.body = req.body;
      } else if (typeof req.body === "string" && req.body.length > 0) {
        opts.body = req.body;
      } else if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        opts.body = JSON.stringify(req.body);
        opts.headers["content-type"] = "application/json";
      }
    }
    const r = await fetchWithTimeout(url, opts);
    const contentType = r.headers.get("content-type") || "";
    const body = Buffer.from(await r.arrayBuffer());
    log("DEBUG", `Proxy ${req.method} ${targetPath} → ${r.status} (${contentType}, ${body.length}b)`);

    for (const [k, v] of r.headers.entries()) {
      if (shouldForwardMoonrakerResponseHeader(k)) {
        res.setHeader(k, v);
      }
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    return res.status(r.status).send(body);
  } catch (e) {
    log("ERROR", `Proxy error: ${e.message}`);
    return res.status(502).json({ error: e.message });
  }
}

// ─── AI Lab Endpoints ───
function aiErrMsg(e) { return e.message || (e.cause && (e.cause.message || e.cause.code || String(e.cause))) || String(e); }

app.get("/api/ai/config.js", (req, res) => {
  const cb = req.query.cb || "callback";
  const ws = sliceAgent.loadWorkspace();

  // 从 soul.md 提取身份信息
  const soulMd = ws["soul.md"] || "";
  const nameMatch = soulMd.match(/\*\*名称\*\*:\s*(.+)/);
  const roleMatch = soulMd.match(/\*\*角色\*\*:\s*(.+)/);
  const goalMatch = soulMd.match(/研究.*?—\s*(.+)/);

  // 从 skills/ 目录提取技能列表
  const skills = ws.skills ? Object.entries(ws.skills).map(([f, content]) => {
    const nameMatch = content.match(/##\s*\w+\s*—\s*(.+)/);
    const idMatch = f.replace(".md", "");
    return {
      id: idMatch,
      name: nameMatch ? nameMatch[1].trim() : idMatch,
      desc: content.split("\n").find(l => l.startsWith("### 描述"))?.replace("### 描述", "").trim() || "",
      status: "active",
    };
  }) : [];

  // 从 tools/ 目录提取工具列表
  const tools = ws.tools ? Object.entries(ws.tools).map(([f, content]) => {
    const nameMatch = content.match(/#\s+.+—\s*(.+)/);
    const idMatch = f.replace(".md", "");
    return {
      id: idMatch,
      name: nameMatch ? nameMatch[1].trim() : idMatch,
      desc: content.split("\n").find(l => l.startsWith("## 描述"))?.replace("## 描述", "").trim() || "",
      status: "active",
    };
  }) : [];

  // 从 memory.md 提取统计
  const memoryMd = ws["memory.md"] || "";
  const experienceCount = (memoryMd.match(/### \[/g) || []).length;
  const knownIssues = [];
  const issueRegex = /### #(\d+)\s+(.+)/g;
  let issueMatch;
  while ((issueMatch = issueRegex.exec(memoryMd)) !== null) {
    knownIssues.push({ id: parseInt(issueMatch[1]), title: issueMatch[2].trim() });
  }

  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({
    aiConfig: { provider: aiConfig.provider, model: aiConfig.model, customBaseUrl: aiConfig.customBaseUrl, hasKey: !!aiConfig.apiKey },
    providers: Object.fromEntries(Object.entries(sliceAgent.AI_PROVIDERS).map(([k, v]) => [k, { name: v.name, defaultModel: v.defaultModel, availableModels: v.availableModels, isLocal: !!v.isLocal, isCustom: !!v.isCustom }])),
    cliAvailable: sliceAgent.VOXELFLOW_BIN !== "voxelflow" || require("child_process").spawnSync("voxelflow", ["--version"], { timeout: 3000 }).status === 0,
    cliBinary: sliceAgent.VOXELFLOW_BIN,
    workspace: {
      soul: {
        name: nameMatch ? nameMatch[1].trim() : "VoxelFlow AI",
        version: "1.0",
        role: roleMatch ? roleMatch[1].trim() : "FDM 3D打印 AI切片引擎",
        goal: goalMatch ? goalMatch[1].trim() : "研究LLM辅助切片可行性",
      },
      knowledge: ws["knowledge.md"] ? { sections: (ws["knowledge.md"].match(/^## \d+\. .+$/gm) || []).map(s => s.replace(/^## \d+\. /, "")) } : [],
      skills,
      tools,
      memory: {
        description: "项目上下文 + 切片经验 + 用户偏好 + 已知问题",
        experienceCount,
        knownIssues,
      },
    },
  })});`);
});

app.get("/api/ai/save_config.js", (req, res) => {
  const cb = req.query.cb || "callback";
  if (req.query.provider) aiConfig.provider = req.query.provider;
  if (req.query.model) aiConfig.model = req.query.model;
  if (req.query.apiKey) aiConfig.apiKey = req.query.apiKey;
  if (req.query.customBaseUrl) aiConfig.customBaseUrl = req.query.customBaseUrl;
  saveConfig();
  log("INFO", `AI config saved: provider=${aiConfig.provider} model=${aiConfig.model}`);
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({ ok: true })});`);
});

// POST version — API Key in body, not URL
app.post("/api/ai/save_config", express.json(), (req, res) => {
  const body = req.body || {};
  if (body.provider) aiConfig.provider = body.provider;
  if (body.model) aiConfig.model = body.model;
  if (body.apiKey) aiConfig.apiKey = body.apiKey;
  if (body.customBaseUrl) aiConfig.customBaseUrl = body.customBaseUrl;
  saveConfig();
  log("INFO", `AI config saved: provider=${aiConfig.provider} model=${aiConfig.model}`);
  res.json({ ok: true });
});

app.get("/api/ai/test_connection.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const testConfig = {
      provider: req.query.provider || aiConfig.provider,
      model: req.query.model || aiConfig.model,
      apiKey: req.query.apiKey || aiConfig.apiKey,
      customBaseUrl: req.query.customBaseUrl || aiConfig.customBaseUrl,
    };
    const result = await sliceAgent.testAiConnection(testConfig);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify(result)});`);
  } catch (e) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

// POST version — API Key in body, not URL
app.post("/api/ai/test_connection", express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const testConfig = {
      provider: body.provider || aiConfig.provider,
      model: body.model || aiConfig.model,
      apiKey: body.apiKey || aiConfig.apiKey,
      customBaseUrl: body.customBaseUrl || aiConfig.customBaseUrl,
    };
    const result = await sliceAgent.testAiConnection(testConfig);
    res.json(result);
  } catch (e) {
    res.json({ ok: false, error: aiErrMsg(e) });
  }
});

app.get("/api/ai/download/:name", (req, res) => {
  const gcodeName = req.params.name;
  const gcodePath = sliceAgent.getGcodePath(gcodeName);
  if (!gcodePath) return res.status(404).json({ error: "G-code not found" });
  res.download(gcodePath, gcodeName);
});

app.get("/api/ai/read_gcode.js", (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const gcodeName = req.query.gcode_name;
    if (!gcodeName) throw new Error("gcode_name parameter required");
    const gcodePath = sliceAgent.getGcodePath(gcodeName);
    if (!gcodePath) throw new Error("G-code not found: " + gcodeName);
    const maxLines = parseInt(req.query.max_lines) || 500;
    const content = fs.readFileSync(gcodePath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;
    const shown = lines.slice(0, maxLines).join("\n");
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, total_lines: totalLines, shown_lines: Math.min(maxLines, totalLines), content: shown })});`);
  } catch (e) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

app.get("/api/ai/upload_to_printer.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    if (!printerConfig.host) throw new Error("No printer configured");
    const gcodeName = req.query.gcode_name;
    const gcodePath = sliceAgent.getGcodePath(gcodeName);
    if (!gcodePath) throw new Error("G-code not found: " + gcodeName);
    const fileContent = fs.readFileSync(gcodePath);
    const FD = require("form-data");
    const formData = new FD();
    formData.append("file", fileContent, { filename: gcodeName });
    // No timeout for uploads: file size × network speed is uncontrollable (traps.md #148).
    const uploadResp = await fetch(`${getBaseUrl()}/server/files/upload`, {
      method: "POST",
      headers: { ...moonrakerHeaders(), ...formData.getHeaders() },
      body: formData,
    });
    const respData = await uploadResp.json();
    if (uploadResp.status === 200 || uploadResp.status === 201) {
      const uploadedPath = respData?.result?.item?.path || gcodeName;
      log("INFO", `AI Lab: gcode uploaded to printer: ${uploadedPath}`);
      res.type("application/javascript");
      res.send(`${cb}(${JSON.stringify({ ok: true, path: uploadedPath })});`);
    } else {
      throw new Error(`Upload failed: ${uploadResp.status} ${JSON.stringify(respData)}`);
    }
  } catch (e) {
    log("ERROR", `AI Lab upload_to_printer error: ${aiErrMsg(e)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

app.get("/api/ai/list_gcode.js", (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const files = sliceAgent.listGcodeFiles();
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, files })});`);
  } catch (e) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

app.get("/api/ai/download_gcode", (req, res) => {
  try {
    const gcodeName = req.query.gcode_name;
    if (!gcodeName) return res.status(400).json({ ok: false, error: "gcode_name required" });
    const gcodePath = sliceAgent.getGcodePath(gcodeName);
    if (!gcodePath || !fs.existsSync(gcodePath)) return res.status(404).json({ ok: false, error: "File not found" });
    res.download(gcodePath, gcodeName);
  } catch (e) {
    res.status(500).json({ ok: false, error: aiErrMsg(e) });
  }
});

app.get("/api/ai/optimize_gcode.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const gcodeName = req.query.gcode_name;
    if (!gcodeName) throw new Error("gcode_name parameter required");
    const result = await sliceAgent.optimizeGcode(gcodeName, aiConfig);
    log("INFO", `AI Lab: gcode optimized: ${gcodeName} patches=${result.patches_applied || 0}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, ...result })});`);
  } catch (e) {
    log("ERROR", `AI Lab optimize_gcode error: ${aiErrMsg(e)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

app.get("/api/ai/convert_gcode.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const gcodeName = req.query.gcode_name;
    if (!gcodeName) throw new Error("gcode_name parameter required");
    const result = sliceAgent.convertGcode(gcodeName);
    log("INFO", `AI Lab: gcode converted: ${gcodeName} → ${result.converted_gcode_name}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, ...result })});`);
  } catch (e) {
    log("ERROR", `AI Lab convert_gcode error: ${aiErrMsg(e)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

// ─── 流式打印问答（JSONP 轮询模式） ───
app.get("/api/ai/qa_stream_start.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const question = req.query.question;
    if (!question) throw new Error("question parameter required");
    const context = req.query.context || "";
    const streamId = await sliceAgent.printQAStream(question, context, aiConfig);
    log("INFO", `AI Lab: stream QA started: ${streamId}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, streamId })});`);
  } catch (e) {
    log("ERROR", `AI Lab qa_stream_start error: ${aiErrMsg(e)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

app.get("/api/ai/qa_stream_poll.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const streamId = req.query.stream_id;
    if (!streamId) throw new Error("stream_id parameter required");
    const result = sliceAgent.pollQAStream(streamId);
    if (result.done && result.error) {
      // 流出错，清理
      sliceAgent.cleanupQAStream(streamId);
    } else if (result.done && !result.error) {
      // 流完成，延迟清理（确保最后一个 poll 能取到数据）
      setTimeout(() => sliceAgent.cleanupQAStream(streamId), 5000);
    }
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify(result)});`);
  } catch (e) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

// Upload G-code file for optimization
app.post("/api/ai/upload_gcode", async (req, res) => {
  try {
    const formidable = require("formidable");
    const form = new formidable.IncomingForm({ maxFileSize: 500 * 1024 * 1024 });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });
    const file = files.gcode?.[0] || files.file?.[0];
    if (!file) return res.status(400).json({ error: "no_file" });
    const buffer = fs.readFileSync(file.filepath);
    const gcodeName = sliceAgent.saveGcodeFile(file.originalFilename, buffer);
    log("INFO", `AI Lab: gcode uploaded for optimization: ${gcodeName}`);
    try { fs.unlinkSync(file.filepath); } catch (_) {}
    res.json({ ok: true, gcode_name: gcodeName });
  } catch (e) {
    log("ERROR", `AI Lab upload_gcode error: ${aiErrMsg(e)}`);
    res.status(500).json({ error: aiErrMsg(e) });
  }
});

// List G-code files from printer (Moonraker)
app.get("/api/ai/list_printer_gcode.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    if (!printerConfig.host) {
      res.type("application/javascript");
      res.send(`${cb}(${JSON.stringify({ ok: false, error: "No printer configured" })});`);
      return;
    }
    const resp = await fetchWithTimeout(`${getBaseUrl()}/server/files/list?root=gcodes`, {
      headers: moonrakerHeaders(),
    });
    const data = await resp.json();
    const items = (data.result || []).filter(f => f.path?.match(/\.gcode$/i));
    const files = items.map(f => ({
      name: f.path.replace(/^.*\//, ""),
      path: f.path,
      size: f.size ? (f.size / 1024).toFixed(1) + "KB" : "?",
    }));
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, files })});`);
  } catch (e) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

// Check G-code format (BambuStudio vs OrcaSlicer) by reading first 32KB from printer
app.get("/api/ai/check_gcode_format.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const filePath = req.query.path;
    if (!filePath) throw new Error("path parameter required");
    if (!printerConfig.host) throw new Error("No printer configured");
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    // Range request: only download first 32KB for format detection
    const resp = await fetch(`${getBaseUrl()}/server/files/gcodes/${encodedPath}`, {
      headers: { ...moonrakerHeaders(), Range: "bytes=0-32767" },
    });
    if (!resp.ok && resp.status !== 206) throw new Error(`Moonraker download failed: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const head = buf.toString("utf-8");
    // Detect format by layer marker (traps.md #116)
    let format = "unknown";
    if (head.includes("; FEATURE:")) format = "bambu";
    else if (head.includes(";TYPE:")) format = "orca";
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, format })});`);
  } catch (e) {
    log("ERROR", `check_gcode_format error: ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

// Fetch G-code from printer for optimization
// Download progress tracker
let fetchProgress = { active: false, bytesReceived: 0, bytesTotal: 0, status: "idle", error: null, gcodeName: null };

app.get("/api/ai/fetch_printer_gcode_progress.js", (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({ ok: true, ...fetchProgress })});`);
});

app.get("/api/ai/fetch_printer_gcode.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  try {
    const filePath = req.query.path;
    if (!filePath) throw new Error("path parameter required");
    if (!printerConfig.host) throw new Error("No printer configured");
    // Download from Moonraker — encode path segments for URLs with spaces/CJK
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    // No timeout for downloads: G-code files can be large, download time is uncontrollable.
    const resp = await fetch(`${getBaseUrl()}/server/files/gcodes/${encodedPath}`, {
      headers: moonrakerHeaders(),
    });
    if (!resp.ok) throw new Error(`Moonraker download failed: ${resp.status} ${await resp.text().catch(()=>"")}`);

    const contentLength = parseInt(resp.headers.get("content-length") || "0");
    fetchProgress = { active: true, bytesReceived: 0, bytesTotal: contentLength, status: "downloading", error: null, gcodeName: null };

    // Download with progress — use arrayBuffer() (compatible with all Node.js versions)
    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const received = buffer.length;
    fetchProgress.bytesReceived = received;
    fetchProgress.bytesTotal = contentLength || received;

    const fileName = filePath.replace(/^.*\//, "");
    const gcodeName = sliceAgent.saveGcodeFile(fileName, buffer);
    fetchProgress = { active: false, bytesReceived: received, bytesTotal: contentLength || received, status: "done", error: null, gcodeName };
    log("INFO", `AI Lab: fetched printer gcode: ${filePath} → ${gcodeName} (${(received/1024).toFixed(1)}KB)`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true, gcode_name: gcodeName })});`);
  } catch (e) {
    fetchProgress = { active: false, bytesReceived: 0, bytesTotal: 0, status: "error", error: aiErrMsg(e), gcodeName: null };
    log("ERROR", `AI Lab fetch_printer_gcode error: ${aiErrMsg(e)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: false, error: aiErrMsg(e) })});`);
  }
});

// Open gcode folder in system file explorer
app.get("/api/ai/open_gcode_folder.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  const gcodeDir = (sliceAgent.GCODE_DIR && sliceAgent.GCODE_DIR()) || path.join(APPDATA_DIR, "ai-lab", "gcode");
  // Ensure directory exists
  if (!fs.existsSync(gcodeDir)) fs.mkdirSync(gcodeDir, { recursive: true });
  const err = await openPathExternally(gcodeDir);
  res.type("application/javascript");
  // Windows explorer always returns exit code 1 even on success — treat as success if directory exists
  if (err && process.platform !== "win32") {
    log("WARN", `open_gcode_folder failed: ${err.message}`);
    res.send(`${cb}(${JSON.stringify({ ok: false, error: err.message })});`);
  } else {
    res.send(`${cb}(${JSON.stringify({ ok: true, path: gcodeDir })});`);
  }
});

// ─── End AI Lab Endpoints ───

app.post("/api/files/local", handleUploadWithConfirm);

function wcPath(req) {
  const p = req.params.path;
  return Array.isArray(p) ? p.join("/") : (p || "");
}

app.all("/api/{*path}", async (req, res) => {
  const p = wcPath(req);
  if (p.startsWith("bridge/")) return res.status(404).json({ error: "not_found" });
  return proxyToMoonraker(req, res, `/api/${p}`);
});

app.all("/access/{*path}", (req, res) => proxyToMoonraker(req, res, `/access/${wcPath(req)}`));

app.all("/server/{*path}", (req, res) => proxyToMoonraker(req, res, `/server/${wcPath(req)}`));
app.all("/printer/{*path}", (req, res) => proxyToMoonraker(req, res, `/printer/${wcPath(req)}`));
app.all("/machine/{*path}", (req, res) => proxyToMoonraker(req, res, `/machine/${wcPath(req)}`));

app.get("/webcam/{*path}", async (req, res) => {
  if (!printerConfig.host) return res.status(400).json({ error: "no_printer_configured" });
  const p = wcPath(req);
  const qs = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
  const url = `${getBaseUrl()}/webcam/${p}${qs}`;
  try {
    const r = await fetchWithTimeout(url, { headers: moonrakerHeaders() }, 30000);
    const body = Buffer.from(await r.arrayBuffer());
    for (const [k, v] of r.headers.entries()) {
      if (shouldForwardMoonrakerResponseHeader(k)) {
        res.setHeader(k, v);
      }
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    log("DEBUG", `Webcam proxy: /webcam/${p} → ${r.status} (${body.length}b)`);
    return res.status(r.status).send(body);
  } catch (e) {
    log("ERROR", `Webcam proxy error: ${e.message}`);
    return res.status(502).json({ error: e.message });
  }
});

app.all("/{*path}", async (req, res) => {
  const p = wcPath(req);
  if (!printerConfig.host) return res.status(503).json({ error: "no_printer_configured" });
  log("DEBUG", `Catch-all proxy: ${req.method} /${p}`);
  return proxyToMoonraker(req, res, `/${p}`);
});

function renderSetupPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BambuStudio Bridge</title>
<style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:#16213e;border-radius:16px;padding:40px;max-width:520px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}h1{color:#0f8bff;margin:0 0 8px;font-size:24px}.subtitle{color:#ff9800;margin:0 0 20px;font-size:14px}.scan-section{text-align:center;margin-bottom:24px}.scan-btn{padding:14px 32px;border:none;border-radius:12px;background:#0f8bff;color:#fff;font-size:16px;font-weight:600;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px}.scan-btn:hover{background:#0a6fd6;transform:scale(1.02)}.scan-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}.scan-result{margin-top:16px;font-size:13px;padding:10px 12px;border-radius:8px;display:none}.scan-result.found{display:block;background:#0a2e1a;border:1px solid #1a5c3a;color:#4caf50}.scan-result.none{display:block;background:#2e1a0a;border:1px solid #5c3a1a;color:#ff9800}.scan-result.error{display:block;background:#2e0a0a;border:1px solid #5c1a1a;color:#f44336}.printer-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:all .15s;margin-top:6px}.printer-item:hover{background:rgba(15,139,255,.1)}.printer-item .p-ip{font-weight:600;color:#0f8bff}.printer-item .p-name{color:#888;font-size:12px}.divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:#555;font-size:13px}.divider::before,.divider::after{content:'';flex:1;height:1px;background:#333}label{display:block;margin-bottom:4px;font-size:13px;color:#aaa}input{width:100%;padding:10px 12px;border:1px solid #333;border-radius:8px;background:#0d1117;color:#e0e0e0;font-size:14px;box-sizing:border-box;margin-bottom:12px}input:focus{outline:none;border-color:#0f8bff}.ip-row{display:flex;gap:8px;margin-bottom:12px}.ip-row input{flex:1;margin-bottom:0}button[type=submit]{width:100%;padding:12px;border:none;border-radius:8px;background:#0f8bff;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s}button[type=submit]:hover{background:#0a6fd6}.hint{color:#555;font-size:12px;margin-top:16px;line-height:1.5}.hint code{background:#0d1117;padding:2px 6px;border-radius:4px;color:#888}</style></head><body>
<div class="card"><h1>&#x1F50C; BambuStudio Bridge</h1><p class="subtitle">Auto-detection did not find a printer on your network.</p>
<div class="scan-section"><button class="scan-btn" id="scanBtn" onclick="scanPrinters()">&#x1F50D; Scan Network</button><div class="scan-result" id="scanResult"></div></div>
<div class="divider">or enter manually</div>
<form id="setup"><label>Printer IP Address</label><div class="ip-row"><input id="host" placeholder="192.168.1.12"></div><label>Moonraker Port</label><input id="port" value="80" type="number"><label>API Key (optional)</label><input id="apikey" placeholder="Leave empty if trusted_clients is configured"><button type="submit">Connect</button></form>
<p class="hint">Tip: Make sure your printer is powered on and connected to the same network. Add <code>trusted_clients: 192.168.0.0/16</code> to your <code>moonraker.conf</code> [authorization] section to skip API Key.</p></div>
<script>function escHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}function scanPrinters(){var btn=document.getElementById('scanBtn');var result=document.getElementById('scanResult');btn.disabled=true;btn.innerHTML='\\u23F3 Scanning...';result.className='scan-result';result.style.display='none';fetch('/api/bridge/scan?timeout=5').then(function(r){return r.json()}).then(function(d){btn.disabled=false;btn.innerHTML='\\uD83D\\uDD0D Scan Network';if(d.error){result.className='scan-result error';result.style.display='block';result.textContent='Scan error: '+d.error;return;}var printers=d.printers||[];if(printers.length===0){result.className='scan-result none';result.style.display='block';result.textContent='No Snapmaker printers found on your network.';return;}if(printers.length===1){var p=printers[0];document.getElementById('host').value=p.ip;result.className='scan-result found';result.style.display='block';result.innerHTML='Found: <b>'+escHtml(p.name)+'</b> at <b>'+escHtml(p.ip)+'</b>. Click Connect below.';}else{var html='Found '+printers.length+' printers (click to select):<br>';printers.forEach(function(p){html+='<div class="printer-item" data-ip="'+escHtml(p.ip)+'"><span class="p-name">'+escHtml(p.name)+'</span> <span class="p-ip">'+escHtml(p.ip)+'</span></div>';});result.className='scan-result found';result.style.display='block';result.innerHTML=html;result.querySelectorAll('.printer-item').forEach(function(el){el.onclick=function(){document.getElementById('host').value=el.dataset.ip;};});}}).catch(function(e){btn.disabled=false;btn.innerHTML='\\uD83D\\uDD0D Scan Network';result.className='scan-result error';result.style.display='block';result.textContent='Scan failed: '+e.message;});}document.getElementById('setup').onsubmit=function(e){e.preventDefault();var h=document.getElementById('host').value;var p=document.getElementById('port').value||'80';var k=document.getElementById('apikey').value;var btn=this.querySelector('button[type=submit]');btn.disabled=true;fetch('/api/bridge/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:h,port:Number(p),apikey:k})}).then(function(r){return r.json();}).then(function(d){if(!d.ok)throw new Error(d.error||'Save failed');window.location.replace('/');}).catch(function(err){btn.disabled=false;alert('Save failed: '+err.message);});};</script></body></html>`;
}

function renderFallbackPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BambuStudio Bridge</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:#16213e;border-radius:16px;padding:40px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}h1{color:#0f8bff;margin:0 0 8px;font-size:24px}.info{color:#888;margin:0 0 16px;font-size:14px}a{color:#0f8bff}</style></head><body>
<div class="card"><h1>&#x1F50C; BambuStudio Bridge</h1><p class="info">Connected to <b>${printerConfig.host}:${printerConfig.port}</b></p><p class="info">Fluidd frontend not found. Access printer directly:<br><a href="http://${printerConfig.host}:${printerConfig.port}">http://${printerConfig.host}:${printerConfig.port}</a></p></div></body></html>`;
}

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/websocket",
  verifyClient: localAccess.verifyWebSocket,
});

wss.on("connection", (ws) => {
  bridgeWsClients.add(ws);
  log("DEBUG", `WS client connected, total=${bridgeWsClients.size}`);

  if (!printerConfig.host) {
    ws.close(4001, "no_printer_configured");
    return;
  }

  const moonrakerUrl = `ws://${printerConfig.host}:${printerConfig.port}/websocket`;
  let moonrakerWs;
  const pendingMsgs = [];

  try {
    moonrakerWs = new WebSocket(moonrakerUrl, moonrakerWebSocketOptions());
  } catch (e) {
    log("ERROR", `WS connect to Moonraker failed: ${e.message}`);
    ws.close(4002, e.message);
    return;
  }

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      log("DEBUG", `WS client→Moonraker: ${msg.method || msg.id || "unknown"}`);
    } catch (_) {}
    if (moonrakerWs.readyState === WebSocket.OPEN) {
      moonrakerWs.send(data);
    } else if (moonrakerWs.readyState === WebSocket.CONNECTING) {
      pendingMsgs.push(data);
      log("DEBUG", `WS queued pending msg (queue=${pendingMsgs.length})`);
    } else {
      log("WARN", `WS client msg dropped: Moonraker state=${moonrakerWs.readyState}`);
    }
  });

  moonrakerWs.on("open", () => {
    log("INFO", `WS Moonraker connected, flushing ${pendingMsgs.length} pending msgs`);
    for (const msg of pendingMsgs) {
      if (moonrakerWs.readyState === WebSocket.OPEN) moonrakerWs.send(msg);
    }
    pendingMsgs.length = 0;
  });

  moonrakerWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.result) log("DEBUG", `WS Moonraker→client: result id=${msg.id}`);
      else if (msg.error) log("WARN", `WS Moonraker→client: error id=${msg.id} ${msg.error.message || ""}`);
      else if (msg.method) log("DEBUG", `WS Moonraker→client: notify ${msg.method}`);
    } catch (_) {}
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  moonrakerWs.on("close", (code, reason) => {
    log("WARN", `WS Moonraker closed: code=${code} reason=${reason || ""}`);
    if (ws.readyState === WebSocket.OPEN) ws.close(code, reason || "");
  });

  moonrakerWs.on("error", (err) => {
    log("ERROR", `WS Moonraker error: ${err.message}`);
    if (ws.readyState === WebSocket.OPEN) ws.close(4003, "moonraker_ws_error");
  });

  ws.on("close", () => {
    bridgeWsClients.delete(ws);
    log("DEBUG", `WS client disconnected, total=${bridgeWsClients.size}`);
    if (moonrakerWs.readyState === WebSocket.OPEN || moonrakerWs.readyState === WebSocket.CONNECTING) {
      moonrakerWs.close();
    }
  });

  ws.on("error", (err) => {
    log("ERROR", `WS client error: ${err.message}`);
    bridgeWsClients.delete(ws);
  });
});

loadConfig();
sliceAgent.setAppDataDir(path.join(APPDATA_DIR, "ai-lab"));
sliceAgent.setRawPathCache(new Map());
sliceAgent.setLogFn(log);
log("INFO", `BambuStudio Bridge v${BRIDGE_VERSION} starting on port ${DEFAULT_PORT}`);
log("INFO", `Web dir: ${WEB_DIR}`);
log("INFO", `Config: ${CONFIG_FILE}`);

async function autoDetectPrinter() {
  if (printerConfig.host) return;
  log("INFO", "No printer configured, starting auto-detection...");
  try {
    const { Bonjour } = require("bonjour-service");
    const bonjour = new Bonjour();
    const found = [];
    return new Promise((resolve) => {
      const browser = bonjour.find({ type: "snapmaker" }, (service) => {
        const ip = service.addresses?.[0] || service.referer?.address || "";
        if (ip) {
          found.push({ name: service.name, ip });
          log("INFO", `Found printer: ${service.name} at ${ip} (mDNS port ${service.port}, using HTTP port 80)`);
        }
      });
      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        if (found.length > 0) {
          printerConfig.host = found[0].ip;
          printerConfig.port = 80;
          printerConfig.mode = "webui";
          saveConfig();
          log("INFO", `Auto-detected printer: ${found[0].ip}:80`);
        } else {
          log("INFO", "No printer found via mDNS auto-detection");
        }
        resolve();
      }, 5000);
    });
  } catch (e) {
    log("WARN", `mDNS auto-detection unavailable: ${e.message}`);
  }
}

server.listen(DEFAULT_PORT, "127.0.0.1", async () => {
  log("INFO", `Server listening on http://127.0.0.1:${DEFAULT_PORT}`);
  await autoDetectPrinter();
});
