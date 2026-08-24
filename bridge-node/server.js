const express = require("express");
const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { pipeline } = require("stream");
const { WebSocketServer, WebSocket } = require("ws");
const fetch = require("node-fetch");
const compression = require("compression");
const { showPrintDialog, cancelActiveDialog } = require("./dialog");
const { isLocalRequest } = require("./netUtils");
const sliceAgent = require("./slice_agent");

const BRIDGE_VERSION = "5.47.0";
// BRIDGE_PORT env override (e.g. running a second local Bridge for testing)
const DEFAULT_PORT = parseInt(process.env.BRIDGE_PORT, 10) || 13628;
const MOONRAKER_TIMEOUT = 10000;

// ── Keep-alive connection pool (v5.47.0) ──
// Without this, every proxied request opens a fresh TCP+TLS connection. Over
// Tailscale (cross-WAN, 30-100ms RTT) each handshake costs 100-400ms, and the
// BambuStudio device panel fires dozens of requests per refresh — the main
// source of "laggy" cascade remote printing. Reusing connections removes the
// handshake from every request after the first.
const keepAliveAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 15000, maxSockets: 8 });
const keepAliveAgentHttps = new https.Agent({ keepAlive: true, keepAliveMsecs: 15000, maxSockets: 8 });
function agentFor(url) {
  return String(url).startsWith("https") ? keepAliveAgentHttps : keepAliveAgent;
}

// Cross-platform config directory (Windows: %APPDATA%, Linux: XDG_CONFIG_HOME).
// BRIDGE_CONFIG_DIR env override allows a second instance (cascade testing,
// pairs with BRIDGE_PORT) to keep its own bridge_config.json + bridge.log.
const APPDATA_DIR = process.env.BRIDGE_CONFIG_DIR || path.join(
  process.platform === "win32"
    ? (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")),
  "BambuStudio-Bridge"
);
fs.mkdirSync(APPDATA_DIR, { recursive: true });

const CONFIG_FILE = path.join(APPDATA_DIR, "bridge_config.json");
const LOG_FILE = path.join(APPDATA_DIR, "bridge.log");

const BRIDGE_DIR = path.resolve(__dirname);
const PROJECT_DIR = path.resolve(__dirname, "..");
const WEB_DIR = fs.existsSync(path.join(__dirname, "web", "webui.html"))
  ? path.join(__dirname, "web")
  : path.join(PROJECT_DIR, "bridge", "web");

let printerConfig = { host: "", port: 80, apikey: "", mode: "webui", bind: "127.0.0.1", upstream: "" };
let aiConfig = { provider: "", model: "", apiKey: "", customBaseUrl: "" };
let pendingPrintFile = "";
let camMonitorActive = false;
let camMonitorLastCall = 0;
const CAM_MONITOR_INTERVAL = 30000;
const bridgeWsClients = new Set();

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      // Strip UTF-8 BOM: Windows PowerShell 5.1 / Notepad "UTF-8" saves add it
      // and JSON.parse chokes on the leading \uFEFF (traps.md #152)
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8").replace(/^\uFEFF/, "");
      const data = JSON.parse(raw);
      printerConfig = { ...printerConfig, ...data };
      if (data.aiConfig) aiConfig = { ...aiConfig, ...data.aiConfig };
    } catch (e) {
      log("ERROR", `Failed to load config: ${e.message}`);
    }
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...printerConfig, aiConfig }, null, 2), "utf-8");
}

// ── Upstream target (v5.46.0 cascade mode) ──
// printerConfig.upstream, when set, is the base URL of another Bridge
// (e.g. "https://home-pc.tailxxxx.ts.net") that this Bridge treats exactly
// like a local Moonraker: all HTTP + WS traffic goes there instead. Empty
// string = direct printer connection (host/port), the default.

function getBaseUrl() {
  if (printerConfig.upstream) {
    return printerConfig.upstream.replace(/\/+$/, ""); // tolerate trailing slash
  }
  if (!hasUpstreamTarget()) return "";
  return `http://${printerConfig.host}:${printerConfig.port}`;
}

function getWsUrl() {
  const base = getBaseUrl();
  if (!base) return "";
  return `${base.replace(/^http/, "ws")}/websocket`; // http→ws, https→wss
}

function hasUpstreamTarget() {
  return !!(printerConfig.upstream || printerConfig.host);
}

// ── Tailscale detection (v5.44.0) ──
// Two layers: `tailscale status --json` (authoritative: MagicDNS name + online
// state) with a fallback to interface scanning for the 100.64.0.0/10 CGNAT
// range (covers machines where the CLI is not on PATH).

function detectTailscaleIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        const parts = iface.address.split(".").map(Number);
        if (parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
          return iface.address;
        }
      }
    }
  }
  return null;
}

function findTailscaleBinary() {
  if (process.platform === "win32") {
    const candidates = [
      "tailscale.exe",
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Tailscale", "tailscale.exe"),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch (_) {}
    }
    return null;
  }
  return "tailscale";
}

/**
 * Run `tailscale status --json` and extract the self node info.
 * Returns { ip, dns_name, online } or null when the CLI is unavailable.
 */
function queryTailscaleSelf() {
  const bin = findTailscaleBinary();
  if (!bin) return null;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, ["status", "--json"], { windowsHide: true });
    } catch (_) {
      resolve(null);
      return;
    }
    let out = "";
    let timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      resolve(null);
    }, 3000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null); // binary not found / not executable
    });
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !out.trim()) { resolve(null); return; }
      try {
        const j = JSON.parse(out);
        const self = j.Self || {};
        let ip = null;
        for (const a of self.TailscaleIPs || []) {
          if (a && !a.includes(":")) { ip = a; break; }
        }
        resolve({
          ip,
          dns_name: (self.DNSName || "").replace(/\.+$/, "") || null,
          online: self.Online === true,
        });
      } catch (_) {
        resolve(null);
      }
    });
  });
}

// 10s cache — tailscale_status.js is polled by the WebUI; spawning the CLI on
// every JSONP request would be wasteful.
let tailscaleInfoCache = { data: null, ts: 0 };
const TAILSCALE_CACHE_MS = 10000;

async function getTailscaleInfo() {
  const now = Date.now();
  if (tailscaleInfoCache.data && now - tailscaleInfoCache.ts < TAILSCALE_CACHE_MS) {
    return tailscaleInfoCache.data;
  }
  let info = null;
  try {
    info = await queryTailscaleSelf();
  } catch (_) {}
  if (info) {
    if (!info.ip) info.ip = detectTailscaleIP();
  } else {
    // CLI unavailable → fall back to interface scan
    const ip = detectTailscaleIP();
    if (ip) info = { ip, dns_name: null, online: true };
  }
  if (info && !info.ip) info = null; // DNS name without an IP is not usable
  tailscaleInfoCache = { data: info, ts: now };
  return info;
}

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a", encoding: "utf-8" });
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
  const h = {};
  if (printerConfig.apikey) h["X-API-Key"] = printerConfig.apikey;
  return h;
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
  return fetch(url, { agent: agentFor(url), ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
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

async function callMoonrakerJsonRpc(method, params = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("No printer configured");

  return new Promise((resolve, reject) => {
    const wsUrl = getWsUrl();
    let settled = false;
    const moonrakerWs = new WebSocket(wsUrl);
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

app.set("etag", false);
// v5.47.0: gzip responses ≥1KB for clients that send accept-encoding (the
// upstream Bridge's node-fetch always does). Cuts cross-Tailscale transfer
// of file listings / G-code text by ~70-80%. Already-compressed payloads
// (JPEG snapshots, zips) are skipped by the content-type filter. JSONP
// requests (cb= param, loaded via <script> tag) are excluded — some legacy
// WebViews don't gunzip script responses.
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.query && req.query.cb !== undefined) return false;
    return compression.filter(req, res);
  },
}));
app.use(express.raw({ type: ["application/octet-stream", "application/x-gcode"], limit: "500mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "text/plain" }));

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
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
  app.use("/fluidd", express.static(fluiddDir, { dotfiles: 'allow' }));
}

app.get("/fluidd/{*path}", (req, res) => {
  const indexPath = path.join(fluiddDir, "index.html");
  if (fs.existsSync(indexPath)) {
    log("DEBUG", `Fluidd SPA fallback: /fluidd/${wcPath(req)}`);
    return res.sendFile(indexPath, { dotfiles: 'allow' });
  }
  return res.status(404).send("Fluidd not found");
});

app.get(["/", "/webui.html"], (req, res) => {
  const { host, port, apikey, upstream } = req.query;

  // 始终先加载当前配置，保证状态一致性
  loadConfig();

  // 处理查询参数更新（upstream: 级联模式连另一台 Bridge；host: 直连打印机）
  if (upstream !== undefined && String(upstream).trim()) {
    printerConfig.upstream = String(upstream).trim().replace(/\/+$/, "");
    saveConfig();
  } else if (host) {
    printerConfig.host = host;
    printerConfig.port = parseInt(port) || 80;
    printerConfig.apikey = apikey || "";
    printerConfig.upstream = "";
    saveConfig();
  }

  if (!hasUpstreamTarget()) {
    return res.type("html").send(renderSetupPage());
  }

  const webuiPath = path.join(WEB_DIR, "webui.html");
  if (fs.existsSync(webuiPath)) return res.sendFile(webuiPath, { dotfiles: 'allow' });
  return res.type("html").send(renderFallbackPage());
});

app.get("/snapmaker.png", (req, res) => {
  const imgPath = path.join(WEB_DIR, "snapmaker.png");
  if (fs.existsSync(imgPath)) return res.sendFile(imgPath, { dotfiles: 'allow' });
  res.status(404).send("Not found");
});

// AI Lab static assets
app.get("/ailab.css", (req, res) => {
  const p = path.join(WEB_DIR, "ailab.css");
  if (fs.existsSync(p)) return res.sendFile(p, { dotfiles: 'allow' });
  res.status(404).end();
});
app.get("/ailab.js", (req, res) => {
  const p = path.join(WEB_DIR, "ailab.js");
  if (fs.existsSync(p)) return res.sendFile(p, { dotfiles: 'allow' });
  res.status(404).end();
});
app.get("/gcvt.js", (req, res) => {
  const p = path.join(WEB_DIR, "gcvt.js");
  if (fs.existsSync(p)) return res.sendFile(p, { dotfiles: 'allow' });
  res.status(404).end();
});

app.get("/api/bridge/config", (req, res) => {
  res.json({
    version: BRIDGE_VERSION,
    printer_host: printerConfig.host,
    printer_port: printerConfig.port,
    has_apikey: !!printerConfig.apikey,
    bind: printerConfig.bind || "127.0.0.1",
    upstream: printerConfig.upstream || "",
  });
});

app.get("/api/bridge/config.js", (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  res.send(`${cb}(${JSON.stringify({
    version: BRIDGE_VERSION,
    printer_host: printerConfig.host,
    printer_port: printerConfig.port,
    has_apikey: !!printerConfig.apikey,
    bind: printerConfig.bind || "127.0.0.1",
    upstream: printerConfig.upstream || "",
  })});`);
});

// Toggle remote access by changing the listen bind (v5.44.0).
// bind: "127.0.0.1" (local only) | "tailnet" (Tailscale interface only,
// recommended) | "0.0.0.0" (all interfaces). Requires a bridge restart.
// Legacy `enabled` param is still accepted: 1 → tailnet, 0 → 127.0.0.1.
app.get("/api/bridge/set_remote_access.js", (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  try {
    let bind = req.query.bind;
    if (!bind && req.query.enabled !== undefined) {
      bind = (req.query.enabled === "1" || req.query.enabled === "true") ? "tailnet" : "127.0.0.1";
    }
    if (!["127.0.0.1", "tailnet", "0.0.0.0"].includes(bind)) {
      throw new Error("bind must be 127.0.0.1, tailnet or 0.0.0.0");
    }
    const changed = bind !== (printerConfig.bind || "127.0.0.1");
    printerConfig.bind = bind;
    saveConfig();
    log("INFO", `Remote access bind=${bind} — ${changed ? "restart bridge to apply" : "no change"}`);
    res.send(`${cb}(${JSON.stringify({ ok: true, bind, needs_restart: changed })});`);
  } catch (e) {
    res.send(`${cb}(${JSON.stringify({ ok: false, error: e.message })});`);
  }
});

// Tailscale status — reports the tailnet IP, MagicDNS name and the URL the
// remote BambuStudio should use as print_host. 10s cached.
app.get("/api/bridge/tailscale_status.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  const info = await getTailscaleInfo();
  const bind = printerConfig.bind || "127.0.0.1";
  res.send(`${cb}(${JSON.stringify({
    installed: !!info,
    online: info ? info.online : false,
    ip: info ? info.ip : null,
    dns_name: info ? info.dns_name : null,
    remote_url: info ? `http://${info.ip}:${DEFAULT_PORT}` : null,
    magicdns_url: info && info.dns_name ? `http://${info.dns_name}:${DEFAULT_PORT}` : null,
    bind,
    remote_access_ready: !!info && bind !== "127.0.0.1",
  })});`);
});

// Save connection config. Two targets (v5.46.0):
//   target=upstream&url=https://...  → cascade: this Bridge forwards to a
//                                     remote Bridge (two-bridge architecture)
//   target=printer&host=..&port=..   → direct printer (default, legacy
//                                     no-target calls behave the same)
app.get("/api/bridge/save_config.js", (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  try {
    const target = req.query.target || (req.query.url ? "upstream" : "printer");
    if (target === "upstream") {
      const url = (req.query.url || "").trim().replace(/\/+$/, "");
      if (!url) throw new Error("url is required");
      if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
      printerConfig.upstream = url;
      saveConfig();
      log("INFO", `Connection target: upstream bridge ${url}`);
      res.send(`${cb}(${JSON.stringify({ ok: true, upstream: url })});`);
      return;
    }
    const host = (req.query.host || "").trim();
    if (!host) throw new Error("host is required");
    printerConfig.host = host;
    printerConfig.port = parseInt(req.query.port) || 80;
    printerConfig.upstream = "";
    if (req.query.apikey !== undefined && req.query.apikey !== "") {
      printerConfig.apikey = req.query.apikey;
    }
    saveConfig();
    log("INFO", `Connection target: printer ${host}:${printerConfig.port}`);
    res.send(`${cb}(${JSON.stringify({ ok: true })});`);
  } catch (e) {
    res.send(`${cb}(${JSON.stringify({ ok: false, error: e.message })});`);
  }
});

// Probe a remote Bridge before saving it: fetches /server/info through the
// URL (the upstream Bridge proxies /server/* to its Moonraker), 5s timeout.
app.get("/api/bridge/test_upstream.js", async (req, res) => {
  const cb = req.query.cb || "callback";
  res.type("application/javascript");
  const send = (obj) => res.send(`${cb}(${JSON.stringify(obj)});`);
  const url = (req.query.url || "").trim().replace(/\/+$/, "");
  if (!url) return send({ ok: false, error: "url is required" });
  if (!/^https?:\/\//i.test(url)) return send({ ok: false, error: "url must start with http:// or https://" });
  try {
    const r = await fetchWithTimeout(`${url}/server/info`, {}, 5000);
    if (!r.ok) return send({ ok: false, error: `HTTP ${r.status}` });
    const j = await r.json().catch(() => ({}));
    const ver = j.result && j.result.moonraker_version ? ` (Moonraker ${j.result.moonraker_version})` : "";
    log("INFO", `test_upstream OK: ${url}${ver}`);
    return send({ ok: true, detail: `reachable${ver}` });
  } catch (e) {
    log("WARN", `test_upstream failed: ${url} — ${e.message}`);
    return send({ ok: false, error: e.message });
  }
});

app.get("/api/bridge/pending_print", (req, res) => {
  res.json({ filename: pendingPrintFile });
});

app.get("/api/bridge/proxy.js", async (req, res) => {
  const targetPath = req.query.path || "";
  const cb = req.query.cb || "callback";
  if (!hasUpstreamTarget()) {
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
  if (!hasUpstreamTarget()) {
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
  content += `Connection: ${printerConfig.upstream ? `upstream bridge ${printerConfig.upstream}` : `printer ${printerConfig.host}:${printerConfig.port}`}\n`;
  content += `Config: ${JSON.stringify(printerConfig, null, 2)}\n`;
  content += `Log file: ${LOG_FILE}\n`;
  content += `Web dir: ${WEB_DIR}\n`;
  content += `Bridge dir: ${BRIDGE_DIR}\n\n`;
  content += `=== Recent Logs ===\n`;
  content += debugLog.join("\n");
  res.send(content);
});

app.post("/api/bridge/confirm_print", async (req, res) => {
  if (!pendingPrintFile) return res.status(400).json({ error: "no_pending_print" });

  const options = req.body || {};
  const filename = pendingPrintFile;
  pendingPrintFile = "";
  // Consumed via WebUI — close any lingering native desktop dialog
  cancelActiveDialog();

  let script = `SDCARD_PRINT_FILE_WITH_PARAMETERS FILENAME="${filename}"`;
  for (const [k, v] of Object.entries(options)) {
    const val = ["true", "1", "yes"].includes(String(v).toLowerCase()) ? "1" : "0";
    script += ` ${k.toUpperCase()}=${val}`;
  }

  log("INFO", `Confirm print: ${script}`);

  try {
    await sendGcode(script);
    log("INFO", `Print started: ${filename}`);
    res.json({ started: true, filename });
  } catch (e) {
    log("ERROR", `Confirm print error: ${e.message}`);
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/bridge/cancel_pending", (req, res) => {
  pendingPrintFile = "";
  cancelActiveDialog();
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
  const bedLevel = req.query.auto_bed_leveling === "1" ? 1 : 0;
  const flowCal = req.query.flow_calibrate === "1" ? 1 : 0;
  const timelapse = req.query.time_lapse_camera === "1" ? 1 : 0;
  let mapTable = [];
  if (req.query.extruder_map_table) {
    try {
      if (req.query.extruder_map_table.length > 4096) throw new Error("extruder_map_table too large");
      mapTable = JSON.parse(req.query.extruder_map_table);
      if (!Array.isArray(mapTable)) throw new Error("extruder_map_table not an array");
    } catch (e) { log("WARN", `extruder_map_table parse error: ${e.message}`); mapTable = []; }
  }
  const filename = pendingPrintFile;
  pendingPrintFile = "";
  // Consumed via WebUI — close any lingering native desktop dialog
  cancelActiveDialog();
  log("INFO", `Confirm print: filename=${filename} bed_level=${bedLevel} flow_cal=${flowCal} timelapse=${timelapse} map_table=${JSON.stringify(mapTable)}`);
  try {
    for (const [configExt, mapExt] of mapTable) {
      await sendGcode(`SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=${configExt} MAP_EXTRUDER=${mapExt}`);
    }
    if (mapTable.length > 0) {
      const usedExtruders = [...new Set(mapTable.map(([_, m]) => m))].sort();
      await sendGcode(`SET_PRINT_USED_EXTRUDERS EXTRUDERS=${usedExtruders.join(',')}`);
    }
    await sendGcode(`SET_PRINT_PREFERENCES BED_LEVEL=${bedLevel} FLOW_CALIBRATE=${flowCal} TIME_LAPSE_CAMERA=${timelapse}`);
    const result = await callMoonrakerJsonRpc("printer.print.start", { filename: filename });
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
  const path = req.query.path;
  if (!path) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: "path_required" })});`);
    return;
  }
  const bedLevel = req.query.auto_bed_leveling === "1" ? 1 : 0;
  const flowCal = req.query.flow_calibrate === "1" ? 1 : 0;
  const timelapse = req.query.time_lapse_camera === "1" ? 1 : 0;
  let mapTable = [];
  if (req.query.extruder_map_table) {
    try {
      if (req.query.extruder_map_table.length > 4096) throw new Error("extruder_map_table too large");
      mapTable = JSON.parse(req.query.extruder_map_table);
      if (!Array.isArray(mapTable)) throw new Error("extruder_map_table not an array");
    } catch (e) { log("WARN", `extruder_map_table parse error: ${e.message}`); mapTable = []; }
  }
  log("INFO", `start_print: path=${path} bed_level=${bedLevel} flow_cal=${flowCal} timelapse=${timelapse} map_table=${JSON.stringify(mapTable)}`);
  try {
    for (const [configExt, mapExt] of mapTable) {
      await sendGcode(`SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=${configExt} MAP_EXTRUDER=${mapExt}`);
    }
    if (mapTable.length > 0) {
      const usedExtruders = [...new Set(mapTable.map(([_, m]) => m))].sort();
      await sendGcode(`SET_PRINT_USED_EXTRUDERS EXTRUDERS=${usedExtruders.join(',')}`);
    }
    await sendGcode(`SET_PRINT_PREFERENCES BED_LEVEL=${bedLevel} FLOW_CALIBRATE=${flowCal} TIME_LAPSE_CAMERA=${timelapse}`);
    const result = await callMoonrakerJsonRpc("printer.print.start", { filename: path });
    log("INFO", `printer.print.start result: ${JSON.stringify(result)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ started: true, path, result })});`);
  } catch (e) {
    log("ERROR", `start_print error: ${e.message}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: e.message })});`);
  }
});

app.get("/api/bridge/cancel_pending.js", (req, res) => {
  const cb = req.query.cb || "callback";
  pendingPrintFile = "";
  cancelActiveDialog();
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
  if (!hasUpstreamTarget()) return res.status(400).json({ error: "no_printer_configured" });
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
  if (!hasUpstreamTarget()) {
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ error: "no_printer_configured" })});`);
    return;
  }
  try {
    const result = await callMoonrakerJsonRpc("camera.start_monitor", { domain: "lan", interval: 0, expect_pw: true });
    camMonitorLastCall = Date.now();
    let camUrl = null;
    if (result && result.url) {
      camUrl = `${getBaseUrl()}/server${result.url}`;
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
  if (!hasUpstreamTarget()) {
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
  if (!hasUpstreamTarget()) return res.status(400).json({ error: "no_printer_configured" });

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
    // No timeout for uploads: file size × network speed is uncontrollable.
    // Moonraker offline → TCP fails fast; Moonraker slow → must wait for large files.
    // Fixed timeout caused regression on large G-code (traps.md #148).
    // v5.47.0: retry once on transient network errors (cross-Tailscale
    // cascade makes ECONNRESET/ETIMEDOUT plausible); a form-data stream can
    // only be consumed once, so the body is rebuilt per attempt. Moonraker
    // upload is idempotent (same filename overwrites), so a retry is safe.
    const uploadUrl = `${getBaseUrl()}/server/files/upload`;
    const buildUpload = () => {
      const formData = new FD();
      formData.append("file", fileContent, { filename: file.originalFilename });
      return { formData, headers: { ...moonrakerHeaders(), ...formData.getHeaders() } };
    };
    let uploadResp;
    for (let attempt = 0; ; attempt++) {
      try {
        const { formData, headers } = buildUpload();
        uploadResp = await fetch(uploadUrl, { method: "POST", headers, body: formData, agent: agentFor(uploadUrl) });
        break;
      } catch (e) {
        const retriable = ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED", "EAI_AGAIN"].includes(e.code) || e.type === "system";
        if (attempt >= 1 || !retriable) throw e;
        log("WARN", `Upload attempt 1 failed (${e.code || e.message}), retrying once in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const respData = await uploadResp.json();
    log("INFO", `Moonraker upload: status=${uploadResp.status}`);

    if (uploadResp.status === 200 || uploadResp.status === 201) {
      const uploadedPath = respData?.result?.item?.path || file.originalFilename || "";
      log("INFO", `Uploaded: ${uploadedPath}, print_flag=${printFlag}`);

      if (printFlag && uploadedPath) {
        pendingPrintFile = uploadedPath;
        notifyWebui("pending_print", { filename: uploadedPath });

        if (isLocalRequest(req)) {
          // Local request: confirmation pops the native desktop dialog (existing behavior)
          log("INFO", `Showing native dialog for: ${uploadedPath}`);
          try {
            const dialogResult = await showPrintDialog(uploadedPath, getBaseUrl(), printerConfig.apikey);
            pendingPrintFile = "";

            if (dialogResult) {
              let script = `SDCARD_PRINT_FILE_WITH_PARAMETERS FILENAME="${uploadedPath}"`;
              for (const k of ["auto_bed_leveling", "flow_calibrate", "time_lapse_camera"]) {
                if (k in dialogResult) {
                  script += ` ${k.toUpperCase()}=${dialogResult[k] ? "1" : "0"}`;
                }
              }
              log("INFO", `Dialog confirmed, sending: ${script}`);
              try {
                await sendGcode(script);
                log("INFO", `Print started after dialog: ${uploadedPath}`);
              } catch (e) {
                log("ERROR", `Failed to start print after dialog: ${e.message}`);
              }
            } else {
              log("INFO", `Dialog cancelled for: ${uploadedPath}`);
            }
          } catch (e) {
            log("ERROR", `Dialog error: ${e.message}`);
            pendingPrintFile = "";
          }
        } else {
          // Remote request: the home machine stays a pure data bridge — no
          // desktop popup. The pending print is announced to WebUI clients
          // (the remote BambuStudio Device tab / browser) via WebSocket, and
          // the requester confirms there with the same filament-mapping flow.
          // Requests proxied by `tailscale serve` arrive from loopback with
          // X-Forwarded-For set to the real client (v5.44.1, traps.md #155).
          const xffClient = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
          log("INFO", `Remote upload from ${xffClient || req.socket.remoteAddress}: pending print ${uploadedPath}, awaiting remote confirmation via WebUI`);
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
  if (!hasUpstreamTarget()) return res.status(400).json({ error: "no_printer_configured" });

  const baseUrl = getBaseUrl();
  let url = `${baseUrl}${targetPath}`;
  const qs = req.url.includes("?") ? req.url.split("?").slice(1).join("?") : "";
  if (qs) url += `?${qs}`;
  log("DEBUG", `proxyToMoonraker: ${req.method} ${url} (req.url=${req.url})`);

  const headers = { ...moonrakerHeaders() };
  for (const [k, v] of Object.entries(req.headers)) {
    if (!["host", "content-length", "transfer-encoding", "connection"].includes(k.toLowerCase())) {
      headers[k] = v;
    }
  }

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
    log("DEBUG", `Proxy ${req.method} ${targetPath} → ${r.status} (${contentType}, streaming)`);

    // node-fetch auto-decompresses gzip/deflate, so the body we forward is
    // already decoded — forwarding upstream content-encoding/content-length
    // makes clients try to gunzip plain text (zlib "incorrect header check",
    // breaks cascade: Bridge A fetching from Bridge B). Strip both.
    const skipHeaders = ["transfer-encoding", "connection", "content-encoding", "content-length"];
    for (const [k, v] of r.headers.entries()) {
      if (!skipHeaders.includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    // v5.47.0: stream the body instead of buffering (r.arrayBuffer() loaded
    // whole files into memory on both cascade hops — large G-code downloads
    // doubled RAM and delayed the first byte). fetchWithTimeout's timer only
    // guards until headers arrive, so slow bodies are never aborted midway.
    res.status(r.status);
    if (req.method === "HEAD" || !r.body) {
      return res.end();
    }
    pipeline(r.body, res, (err) => {
      if (err) {
        log("ERROR", `Proxy stream error ${req.method} ${targetPath}: ${err.message}`);
        res.destroy();
      }
    });
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
    if (!hasUpstreamTarget()) throw new Error("No printer configured");
    const gcodeName = req.query.gcode_name;
    const gcodePath = sliceAgent.getGcodePath(gcodeName);
    if (!gcodePath) throw new Error("G-code not found: " + gcodeName);
    const fileContent = fs.readFileSync(gcodePath);
    const FD = require("form-data");
    const formData = new FD();
    formData.append("file", fileContent, { filename: gcodeName });
    // No timeout for uploads: file size × network speed is uncontrollable (traps.md #148).
    const uploadUrl2 = `${getBaseUrl()}/server/files/upload`;
    const uploadResp = await fetch(uploadUrl2, {
      method: "POST",
      headers: { ...moonrakerHeaders(), ...formData.getHeaders() },
      body: formData,
      agent: agentFor(uploadUrl2),
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
    if (!hasUpstreamTarget()) {
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
    if (!hasUpstreamTarget()) throw new Error("No printer configured");
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    // Range request: only download first 32KB for format detection
    const rangeUrl = `${getBaseUrl()}/server/files/gcodes/${encodedPath}`;
    const resp = await fetch(rangeUrl, {
      headers: { ...moonrakerHeaders(), Range: "bytes=0-32767" },
      agent: agentFor(rangeUrl),
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
    if (!hasUpstreamTarget()) throw new Error("No printer configured");
    // Download from Moonraker — encode path segments for URLs with spaces/CJK
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    // No timeout for downloads: G-code files can be large, download time is uncontrollable.
    const dlUrl = `${getBaseUrl()}/server/files/gcodes/${encodedPath}`;
    const resp = await fetch(dlUrl, {
      headers: moonrakerHeaders(),
      agent: agentFor(dlUrl),
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
  const gcodeDir = (sliceAgent.GCODE_DIR && sliceAgent.GCODE_DIR()) || path.join(osAppData, "ai-lab", "gcode");
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
  if (!hasUpstreamTarget()) return res.status(400).json({ error: "no_printer_configured" });
  const p = wcPath(req);
  const qs = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
  const url = `${getBaseUrl()}/webcam/${p}${qs}`;
  try {
    const r = await fetchWithTimeout(url, { headers: moonrakerHeaders() }, 30000);
    // node-fetch auto-decompresses gzip/deflate, so the body we forward is
    // already decoded — forwarding upstream content-encoding/content-length
    // makes clients try to gunzip plain text (zlib "incorrect header check",
    // breaks cascade: Bridge A fetching from Bridge B). Strip both.
    const skipHeaders = ["transfer-encoding", "connection", "content-encoding", "content-length"];
    for (const [k, v] of r.headers.entries()) {
      if (!skipHeaders.includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    log("DEBUG", `Webcam proxy: /webcam/${p} → ${r.status} (streaming)`);
    res.status(r.status);
    if (!r.body) return res.end();
    pipeline(r.body, res, (err) => {
      if (err) {
        log("ERROR", `Webcam stream error /webcam/${p}: ${err.message}`);
        res.destroy();
      }
    });
    return;
  } catch (e) {
    log("ERROR", `Webcam proxy error: ${e.message}`);
    return res.status(502).json({ error: e.message });
  }
});

app.all("/{*path}", async (req, res) => {
  const p = wcPath(req);
  if (!hasUpstreamTarget()) return res.status(503).json({ error: "no_printer_configured" });
  log("DEBUG", `Catch-all proxy: ${req.method} /${p}`);
  return proxyToMoonraker(req, res, `/${p}`);
});

function renderSetupPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BambuStudio Bridge</title>
<style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:#16213e;border-radius:16px;padding:40px;max-width:520px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}h1{color:#0f8bff;margin:0 0 8px;font-size:24px}.subtitle{color:#ff9800;margin:0 0 20px;font-size:14px}.scan-section{text-align:center;margin-bottom:24px}.scan-btn{padding:14px 32px;border:none;border-radius:12px;background:#0f8bff;color:#fff;font-size:16px;font-weight:600;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px}.scan-btn:hover{background:#0a6fd6;transform:scale(1.02)}.scan-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}.scan-result{margin-top:16px;font-size:13px;padding:10px 12px;border-radius:8px;display:none}.scan-result.found{display:block;background:#0a2e1a;border:1px solid #1a5c3a;color:#4caf50}.scan-result.none{display:block;background:#2e1a0a;border:1px solid #5c3a1a;color:#ff9800}.scan-result.error{display:block;background:#2e0a0a;border:1px solid #5c1a1a;color:#f44336}.printer-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:all .15s;margin-top:6px}.printer-item:hover{background:rgba(15,139,255,.1)}.printer-item .p-ip{font-weight:600;color:#0f8bff}.printer-item .p-name{color:#888;font-size:12px}.divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:#555;font-size:13px}.divider::before,.divider::after{content:'';flex:1;height:1px;background:#333}label{display:block;margin-bottom:4px;font-size:13px;color:#aaa}input{width:100%;padding:10px 12px;border:1px solid #333;border-radius:8px;background:#0d1117;color:#e0e0e0;font-size:14px;box-sizing:border-box;margin-bottom:12px}input:focus{outline:none;border-color:#0f8bff}.ip-row{display:flex;gap:8px;margin-bottom:12px}.ip-row input{flex:1;margin-bottom:0}button[type=submit]{width:100%;padding:12px;border:none;border-radius:8px;background:#0f8bff;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s}button[type=submit]:hover{background:#0a6fd6}.hint{color:#555;font-size:12px;margin-top:16px;line-height:1.5}.hint code{background:#0d1117;padding:2px 6px;border-radius:4px;color:#888}</style></head><body>
<div class="card"><h1>&#x1F50C; BambuStudio Bridge</h1><p class="subtitle">No printer on this network — connect directly, or through a Bridge at home.</p>
<div class="scan-section"><button class="scan-btn" id="scanBtn" onclick="scanPrinters()">&#x1F50D; Scan Network</button><div class="scan-result" id="scanResult"></div></div>
<div class="divider">or enter manually</div>
<form id="setup"><label>Printer IP Address</label><div class="ip-row"><input id="host" placeholder="192.168.1.12"></div><label>Moonraker Port</label><input id="port" value="80" type="number"><label>API Key (optional)</label><input id="apikey" placeholder="Leave empty if trusted_clients is configured"><button type="submit">Connect</button></form>
<div class="divider">or connect to a remote Bridge</div>
<form id="setupRemote"><label>Remote Bridge URL <span style="color:#555">(away from home, via Tailscale)</span></label><input id="upstream" placeholder="https://home-pc.tailxxxx.ts.net"><button type="submit">Connect</button></form>
<p class="hint">Tip: Make sure your printer is powered on and connected to the same network. Add <code>trusted_clients: 192.168.0.0/16</code> to your <code>moonraker.conf</code> [authorization] section to skip API Key.<br>Remote Bridge: on your <b>home</b> PC run <code>tailscale serve --bg http://127.0.0.1:13628</code>, then paste its URL here — this PC talks to your printer through it.</p></div>
<script>function escHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}function scanPrinters(){var btn=document.getElementById('scanBtn');var result=document.getElementById('scanResult');btn.disabled=true;btn.innerHTML='\\u23F3 Scanning...';result.className='scan-result';result.style.display='none';fetch('/api/bridge/scan?timeout=5').then(function(r){return r.json()}).then(function(d){btn.disabled=false;btn.innerHTML='\\uD83D\\uDD0D Scan Network';if(d.error){result.className='scan-result error';result.style.display='block';result.textContent='Scan error: '+d.error;return;}var printers=d.printers||[];if(printers.length===0){result.className='scan-result none';result.style.display='block';result.textContent='No Snapmaker printers found on your network.';return;}if(printers.length===1){var p=printers[0];document.getElementById('host').value=p.ip;result.className='scan-result found';result.style.display='block';result.innerHTML='Found: <b>'+escHtml(p.name)+'</b> at <b>'+escHtml(p.ip)+'</b>. Click Connect below.';}else{var html='Found '+printers.length+' printers (click to select):<br>';printers.forEach(function(p){html+='<div class="printer-item" data-ip="'+escHtml(p.ip)+'"><span class="p-name">'+escHtml(p.name)+'</span> <span class="p-ip">'+escHtml(p.ip)+'</span></div>';});result.className='scan-result found';result.style.display='block';result.innerHTML=html;result.querySelectorAll('.printer-item').forEach(function(el){el.onclick=function(){document.getElementById('host').value=el.dataset.ip;};});}}).catch(function(e){btn.disabled=false;btn.innerHTML='\\uD83D\\uDD0D Scan Network';result.className='scan-result error';result.style.display='block';result.textContent='Scan failed: '+e.message;});}document.getElementById('setup').onsubmit=function(e){e.preventDefault();var h=document.getElementById('host').value;var p=document.getElementById('port').value||'80';var k=document.getElementById('apikey').value;window.location.href='/?host='+encodeURIComponent(h)+'&port='+p+'&apikey='+encodeURIComponent(k);};document.getElementById('setupRemote').onsubmit=function(e){e.preventDefault();var u=document.getElementById('upstream').value.trim().replace(/\\/+$/,'');if(!u){document.getElementById('upstream').style.borderColor='#f44336';return;}if(!/^https?:\\/\\//.test(u)){u='https://'+u;}window.location.href='/?upstream='+encodeURIComponent(u);};</script></body></html>`;
}

function renderFallbackPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BambuStudio Bridge</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:#16213e;border-radius:16px;padding:40px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}h1{color:#0f8bff;margin:0 0 8px;font-size:24px}.info{color:#888;margin:0 0 16px;font-size:14px}a{color:#0f8bff}</style></head><body>
<div class="card"><h1>&#x1F50C; BambuStudio Bridge</h1><p class="info">Connected to <b>${getBaseUrl()}</b></p><p class="info">Fluidd frontend not found. Access printer directly:<br><a href="${getBaseUrl()}">${getBaseUrl()}</a></p></div></body></html>`;
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/websocket" });

function handleWsConnection(ws) {
  bridgeWsClients.add(ws);
  log("DEBUG", `WS client connected, total=${bridgeWsClients.size}`);

  if (!hasUpstreamTarget()) {
    ws.close(4001, "no_printer_configured");
    return;
  }

  const moonrakerUrl = getWsUrl();
  let moonrakerWs;
  const pendingMsgs = [];

  try {
    moonrakerWs = new WebSocket(moonrakerUrl);
  } catch (e) {
    log("ERROR", `WS connect to Moonraker failed: ${e.message}`);
    ws.close(4002, e.message);
    return;
  }

  // v5.47.0: keepalive ping — idle WebSocket/TCP paths through Tailscale or
  // NAT middleboxes get dropped after minutes of silence; the next device-
  // panel update then stalls until the client reconnects. A 30s protocol
  // ping keeps the hop (Bridge A→B or B→Moonraker) permanently warm.
  // BambuStudio's own WebView WebSocket cannot send pings, but its hop to
  // this Bridge is localhost, which has no NAT problem.
  const wsPingTimer = setInterval(() => {
    if (moonrakerWs.readyState === WebSocket.OPEN) {
      try { moonrakerWs.ping(); } catch (_) { /* socket dying; close handler cleans up */ }
    }
  }, 30000);
  const stopPing = () => clearInterval(wsPingTimer);
  moonrakerWs.on("close", stopPing);
  moonrakerWs.on("error", stopPing);

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
}

wss.on("connection", handleWsConnection);

loadConfig();
sliceAgent.setAppDataDir(path.join(APPDATA_DIR, "ai-lab"));
sliceAgent.setRawPathCache(new Map());
sliceAgent.setLogFn(log);
log("INFO", `BambuStudio Bridge v${BRIDGE_VERSION} starting on port ${DEFAULT_PORT}`);
if (printerConfig.upstream) log("INFO", `Cascade mode: forwarding to upstream bridge ${printerConfig.upstream}`);
log("INFO", `Web dir: ${WEB_DIR}`);
log("INFO", `Config: ${CONFIG_FILE}`);

async function autoDetectPrinter() {
  if (hasUpstreamTarget()) return;
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

// Resolve the effective listen address from the bind preference (v5.44.0):
// "127.0.0.1" (default, local only) | "tailnet" (Tailscale interface + a
// loopback listener so local BambuStudio keeps working) | "0.0.0.0" (all
// interfaces). Falls back to loopback when "tailnet" is requested but no
// Tailscale interface is present.
const bindPref = printerConfig.bind || "127.0.0.1";
let listenHost = bindPref;
if (bindPref === "tailnet") {
  const tsIP = detectTailscaleIP();
  if (tsIP) {
    listenHost = tsIP;
  } else {
    listenHost = "127.0.0.1";
    log("WARN", "bind=tailnet but no Tailscale interface found — falling back to 127.0.0.1");
  }
}

server.listen(DEFAULT_PORT, listenHost, async () => {
  log("INFO", `Server listening on http://${listenHost}:${DEFAULT_PORT} (bind=${bindPref})`);
  if (listenHost !== "127.0.0.1" && listenHost !== "0.0.0.0") {
    const info = await getTailscaleInfo();
    if (info) log("INFO", `Tailscale remote URL: http://${info.ip}:${DEFAULT_PORT}` + (info.dns_name ? ` (MagicDNS: http://${info.dns_name}:${DEFAULT_PORT})` : ""));
  }
  await autoDetectPrinter();
});

// bind=tailnet: keep serving loopback too, so the local BambuStudio
// (print_host = http://127.0.0.1:13628) continues to work unchanged.
if (listenHost !== "127.0.0.1" && listenHost !== "0.0.0.0") {
  const loopbackServer = http.createServer(app);
  const wssLoopback = new WebSocketServer({ server: loopbackServer, path: "/websocket" });
  wssLoopback.on("connection", handleWsConnection);
  loopbackServer.listen(DEFAULT_PORT, "127.0.0.1", () => {
    log("INFO", `Loopback listener on http://127.0.0.1:${DEFAULT_PORT} (local access)`);
  });
}
