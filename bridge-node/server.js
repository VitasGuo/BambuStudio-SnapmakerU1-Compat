const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { WebSocketServer, WebSocket } = require("ws");
const fetch = require("node-fetch");
const { showPrintDialog } = require("./dialog");

const BRIDGE_VERSION = "5.8.1";
const DEFAULT_PORT = 13628;
const MOONRAKER_TIMEOUT = 10000;

const APPDATA_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
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

let printerConfig = { host: "", port: 80, apikey: "", mode: "webui" };
let pendingPrintFile = "";
let camMonitorActive = false;
let camMonitorLastCall = 0;
const CAM_MONITOR_INTERVAL = 30000;
const bridgeWsClients = new Set();

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      printerConfig = { ...printerConfig, ...data };
    } catch (e) {
      log("ERROR", `Failed to load config: ${e.message}`);
    }
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(printerConfig, null, 2), "utf-8");
}

function getBaseUrl() {
  if (!printerConfig.host) return "";
  return `http://${printerConfig.host}:${printerConfig.port}`;
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

function moonrakerHeaders() {
  const h = {};
  if (printerConfig.apikey) h["X-API-Key"] = printerConfig.apikey;
  return h;
}

async function moonrakerFetch(urlPath, options = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("No printer configured");
  const url = `${baseUrl}${urlPath}`;
  const headers = { ...moonrakerHeaders(), ...(options.headers || {}) };
  const resp = await fetch(url, { ...options, headers, timeout: MOONRAKER_TIMEOUT });
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
    const wsUrl = `ws://${printerConfig.host}:${printerConfig.port}/websocket`;
    let settled = false;
    const moonrakerWs = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; moonrakerWs.close(); reject(new Error("Moonraker WebSocket timeout")); }
    }, 10000);

    moonrakerWs.on("open", () => {
      moonrakerWs.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: method,
          params: params,
          id: Date.now(),
        })
      );
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
  const { host, port, apikey } = req.query;
  
  // 始终先加载当前配置，保证状态一致性
  loadConfig();
  
  // 处理查询参数更新
  if (host) {
    printerConfig.host = host;
    printerConfig.port = parseInt(port) || 80;
    printerConfig.apikey = apikey || "";
    saveConfig();
  }

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

app.get("/api/bridge/config", (req, res) => {
  res.json({
    version: BRIDGE_VERSION,
    printer_host: printerConfig.host,
    printer_port: printerConfig.port,
    has_apikey: !!printerConfig.apikey,
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
  })});`);
});

app.get("/api/bridge/status", async (req, res) => {
  if (!printerConfig.host) return res.json({ connected: false, reason: "no_printer" });
  try {
    const r = await moonrakerFetch("/api/version");
    if (r.ok) {
      const data = await r.json();
      return res.json({ connected: true, klipper_version: data.klipper_version || "" });
    }
    return res.json({ connected: false, reason: `http_${r.status}` });
  } catch (e) {
    return res.json({ connected: false, reason: e.message });
  }
});

app.post("/api/bridge/disconnect", (req, res) => {
  printerConfig = { host: "", port: 80, apikey: "", mode: "webui" };
  saveConfig();
  res.json({ disconnected: true });
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
    const r = await fetch(url, { headers: moonrakerHeaders(), timeout: MOONRAKER_TIMEOUT });
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
    const r = await fetch(url, { headers: moonrakerHeaders(), timeout: MOONRAKER_TIMEOUT });
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
  const options = {
    auto_bed_leveling: req.query.auto_bed_leveling === "1" ? 1 : 0,
    flow_calibrate: req.query.flow_calibrate === "1" ? 1 : 0,
    time_lapse_camera: req.query.time_lapse_camera === "1" ? 1 : 0,
  };
  const filename = pendingPrintFile;
  pendingPrintFile = "";
  log("INFO", `Confirm print (JSONP): start_local_print path=${filename} options=${JSON.stringify(options)}`);
  try {
    const result = await callMoonrakerJsonRpc("server.files.start_local_print", {
      path: filename,
      options: options,
      print_plate: 1,
    });
    log("INFO", `server.files.start_local_print result: ${JSON.stringify(result)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ started: true, filename, result })});`);
  } catch (e) {
    log("ERROR", `server.files.start_local_print error: ${e.message}`);
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
  const options = {
    auto_bed_leveling: req.query.auto_bed_leveling === "1" ? 1 : 0,
    flow_calibrate: req.query.flow_calibrate === "1" ? 1 : 0,
    time_lapse_camera: req.query.time_lapse_camera === "1" ? 1 : 0,
  };
  log("INFO", `start_print (JSONP): start_local_print path=${path} options=${JSON.stringify(options)}`);
  try {
    const result = await callMoonrakerJsonRpc("server.files.start_local_print", {
      path: path,
      options: options,
      print_plate: 1,
    });
    log("INFO", `server.files.start_local_print result: ${JSON.stringify(result)}`);
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ started: true, path, result })});`);
  } catch (e) {
    log("ERROR", `server.files.start_local_print error: ${e.message}`);
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

async function ensureCamMonitor() {
  const now = Date.now();
  if (camMonitorActive && now - camMonitorLastCall < CAM_MONITOR_INTERVAL) return;
  camMonitorLastCall = now;
  try {
    const reqId = Date.now();
    await callMoonrakerJsonRpc("camera.start_monitor", { req_id: reqId });
    camMonitorActive = true;
    log("INFO", "camera.start_monitor sent via server-side RPC, monitor active");
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
    const r = await fetch(url, {
      method: "GET",
      headers: moonrakerHeaders(),
      timeout: MOONRAKER_TIMEOUT,
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
    const reqId = Date.now();
    await callMoonrakerJsonRpc("camera.start_monitor", { req_id: reqId });
    camMonitorLastCall = Date.now();
    log("INFO", "camera.start_monitor sent via JSONP endpoint");
    res.type("application/javascript");
    res.send(`${cb}(${JSON.stringify({ ok: true })});`);
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
    const reqId = Date.now();
    await callMoonrakerJsonRpc("camera.stop_monitor", { req_id: reqId });
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

async function handleUploadWithConfirm(req, res) {
  if (!printerConfig.host) return res.status(400).json({ error: "no_printer_configured" });

  const contentType = req.headers["content-type"] || "";
  log("INFO", `Upload request: content_type=${contentType}`);

  if (!contentType.includes("multipart")) {
    return proxyToMoonraker(req, res, "/api/files/local");
  }

  try {
    const formidable = require("formidable");
    const form = new formidable.IncomingForm({ maxFileSize: 500 * 1024 * 1024 });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.file?.[0];
    if (!file) {
      log("WARN", "Upload has no file field");
      return res.status(400).json({ error: "no_file_field" });
    }

    const printFlag = String(fields.print?.[0] || "false").toLowerCase() === "true";
    log("INFO", `Upload file: ${file.originalFilename}, print_flag=${printFlag}`);

    const fileContent = fs.readFileSync(file.filepath);
    const FD = require("form-data");
    const formData = new FD();
    formData.append("file", fileContent, { filename: file.originalFilename });

    const uploadHeaders = { ...moonrakerHeaders(), ...formData.getHeaders() };
    const uploadResp = await fetch(`${getBaseUrl()}/server/files/upload`, {
      method: "POST",
      headers: uploadHeaders,
      body: formData,
      timeout: 120000,
    });

    const respData = await uploadResp.json();
    log("INFO", `Moonraker upload: status=${uploadResp.status}`);

    if (uploadResp.status === 200 || uploadResp.status === 201) {
      const uploadedPath = respData?.result?.item?.path || file.originalFilename || "";
      log("INFO", `Uploaded: ${uploadedPath}, print_flag=${printFlag}`);

      if (printFlag && uploadedPath) {
        pendingPrintFile = uploadedPath;
        log("INFO", `Showing native dialog for: ${uploadedPath}`);
        notifyWebui("pending_print", { filename: uploadedPath });

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
    try {
      const tmpFiles = req.files?.file;
      if (tmpFiles) {
        const arr = Array.isArray(tmpFiles) ? tmpFiles : [tmpFiles];
        for (const f of arr) {
          if (f.filepath && fs.existsSync(f.filepath)) {
            try { fs.unlinkSync(f.filepath); } catch (_) {}
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

  const headers = { ...moonrakerHeaders() };
  for (const [k, v] of Object.entries(req.headers)) {
    if (!["host", "content-length", "transfer-encoding", "connection"].includes(k.toLowerCase())) {
      headers[k] = v;
    }
  }

  try {
    const opts = { method: req.method, headers, timeout: MOONRAKER_TIMEOUT };
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
    const r = await fetch(url, opts);
    const contentType = r.headers.get("content-type") || "";
    const body = Buffer.from(await r.arrayBuffer());
    log("DEBUG", `Proxy ${req.method} ${targetPath} → ${r.status} (${contentType}, ${body.length}b)`);

    const skipHeaders = ["transfer-encoding", "connection"];
    for (const [k, v] of r.headers.entries()) {
      if (!skipHeaders.includes(k.toLowerCase())) {
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
    const r = await fetch(url, { headers: moonrakerHeaders(), timeout: 30000 });
    const body = Buffer.from(await r.arrayBuffer());
    const skipHeaders = ["transfer-encoding", "connection"];
    for (const [k, v] of r.headers.entries()) {
      if (!skipHeaders.includes(k.toLowerCase())) {
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
<script>function scanPrinters(){var btn=document.getElementById('scanBtn');var result=document.getElementById('scanResult');btn.disabled=true;btn.innerHTML='\\u23F3 Scanning...';result.className='scan-result';result.style.display='none';fetch('/api/bridge/scan?timeout=5').then(function(r){return r.json()}).then(function(d){btn.disabled=false;btn.innerHTML='\\uD83D\\uDD0D Scan Network';if(d.error){result.className='scan-result error';result.style.display='block';result.textContent='Scan error: '+d.error;return;}var printers=d.printers||[];if(printers.length===0){result.className='scan-result none';result.style.display='block';result.textContent='No Snapmaker printers found on your network.';return;}if(printers.length===1){var p=printers[0];document.getElementById('host').value=p.ip;result.className='scan-result found';result.style.display='block';result.innerHTML='Found: <b>'+p.name+'</b> at <b>'+p.ip+'</b>. Click Connect below.';}else{var html='Found '+printers.length+' printers (click to select):<br>';printers.forEach(function(p){html+='<div class="printer-item" data-ip="'+p.ip+'"><span class="p-name">'+p.name+'</span> <span class="p-ip">'+p.ip+'</span></div>';});result.className='scan-result found';result.style.display='block';result.innerHTML=html;result.querySelectorAll('.printer-item').forEach(function(el){el.onclick=function(){document.getElementById('host').value=el.dataset.ip;};});}}).catch(function(e){btn.disabled=false;btn.innerHTML='\\uD83D\\uDD0D Scan Network';result.className='scan-result error';result.style.display='block';result.textContent='Scan failed: '+e.message;});}document.getElementById('setup').onsubmit=function(e){e.preventDefault();var h=document.getElementById('host').value;var p=document.getElementById('port').value||'80';var k=document.getElementById('apikey').value;window.location.href='/?host='+encodeURIComponent(h)+'&port='+p+'&apikey='+encodeURIComponent(k);};</script></body></html>`;
}

function renderFallbackPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BambuStudio Bridge</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:#16213e;border-radius:16px;padding:40px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}h1{color:#0f8bff;margin:0 0 8px;font-size:24px}.info{color:#888;margin:0 0 16px;font-size:14px}a{color:#0f8bff}</style></head><body>
<div class="card"><h1>&#x1F50C; BambuStudio Bridge</h1><p class="info">Connected to <b>${printerConfig.host}:${printerConfig.port}</b></p><p class="info">Fluidd frontend not found. Access printer directly:<br><a href="http://${printerConfig.host}:${printerConfig.port}">http://${printerConfig.host}:${printerConfig.port}</a></p></div></body></html>`;
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/websocket" });

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
    moonrakerWs = new WebSocket(moonrakerUrl);
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
