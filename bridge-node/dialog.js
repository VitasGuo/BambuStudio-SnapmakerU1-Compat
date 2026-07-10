const { execFile, execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const fetch = require("node-fetch");
const { getBridgeDataDir } = require("./paths");
const { normalizeExtruderMapTable } = require("./print_job");

const MAC_DIALOG_HELPER_NAMES = ["SnapmakerU1DialogHelper", "U1PrintDialog"];

class NativeDialogError extends Error {
  constructor(message, code = "native_dialog_error", cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "NativeDialogError";
    this.code = code;
    // server.js uses this marker to leave the job available in WebUI instead
    // of interpreting an infrastructure failure as a user cancellation.
    this.keepPending = true;
  }
}

function makeResultFile() {
  return path.join(os.tmpdir(), `bambustudio_dialog_${process.pid}_${crypto.randomBytes(4).toString("hex")}.json`);
}

async function fetchPrintTask(baseUrl, apikey) {
  try {
    const headers = {};
    if (apikey) headers["X-API-Key"] = apikey;
    // Use AbortController (standard Web API) instead of node-fetch v2's non-standard `timeout` option (traps.md #139)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${baseUrl}/server/files/config/snapmaker/print_task.json`, {
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (r.ok) return await r.json();
  } catch (_) {}
  return {};
}

async function fetchGcodeMetadata(baseUrl, filename, apikey, fetchImpl = fetch) {
  try {
    const headers = {};
    if (apikey) headers["X-API-Key"] = apikey;
    const normalizedName = String(filename || "").replace(/^gcodes\//, "");
    const url = new URL("/server/files/metadata", baseUrl);
    url.searchParams.set("filename", normalizedName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl(url.toString(), { headers, signal: controller.signal });
      if (!response.ok) return {};
      const payload = await response.json();
      return payload && payload.result && typeof payload.result === "object" ? payload.result : {};
    } finally {
      clearTimeout(timer);
    }
  } catch (_) {
    return {};
  }
}

const FILAMENT_TYPES = [
  "PETG", "PEEK", "NYLON", "FLEX", "PLA", "TPU", "ABS", "ASA",
  "PVA", "HIPS", "PEI", "CPE", "PA", "PC", "PP", "PET",
];

function valueList(value) {
  if (Array.isArray(value)) return value.map(cleanListValue);
  if (value === undefined || value === null || value === "") return [];
  return (typeof value === "string" ? value.split(";") : [value]).map(cleanListValue);
}

function cleanListValue(value) {
  return typeof value === "string"
    ? value.trim().replace(/^["']+|["']+$/g, "")
    : value;
}

function booleanValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function normalizeMaterialText(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeFilamentType(...values) {
  const text = normalizeMaterialText(values.filter(Boolean).join(" "));
  for (const type of FILAMENT_TYPES) {
    if (text.includes(type)) return type;
  }
  return text;
}

function subtypeMatches(gcodeFilament, machineFilament) {
  const machineSubtype = normalizeMaterialText(machineFilament.subtype);
  if (!machineSubtype) return false;
  const gcodeSubtype = normalizeMaterialText(gcodeFilament.subtype);
  const gcodeName = normalizeMaterialText(gcodeFilament.name);
  return (
    (gcodeSubtype && (gcodeSubtype.includes(machineSubtype) || machineSubtype.includes(gcodeSubtype))) ||
    (gcodeName && gcodeName.includes(machineSubtype))
  );
}

function buildMachineFilaments(task = {}) {
  const types = valueList(task.filament_type);
  const subtypes = valueList(task.filament_sub_type);
  const colors = valueList(task.filament_color_rgba);
  const exists = valueList(task.filament_exist);
  return Array.from({ length: 4 }, (_, index) => {
    const type = String(types[index] || "").trim();
    const subtype = String(subtypes[index] || "").trim();
    const loaded = booleanValue(exists[index]);
    return {
      index,
      label: type + (subtype ? ` (${subtype})` : "") || "--",
      type,
      subtype,
      normalizedType: normalizeFilamentType(type, subtype),
      color: String(colors[index] || ""),
      loaded,
      exist: loaded,
      state: loaded ? "Loaded" : "Empty",
    };
  });
}

function buildGcodeFilaments(metadata = {}) {
  const types = valueList(metadata.filament_type);
  const names = valueList(metadata.filament_name);
  const colors = valueList(metadata.filament_colour);
  return Array.from({ length: 4 }, (_, index) => {
    const type = String(types[index] || "").trim();
    const name = String(names[index] || "").trim();
    const used = !!(type || name);
    return {
      index,
      label: name || type || "--",
      type,
      name,
      subtype: name,
      normalizedType: normalizeFilamentType(type, name),
      color: String(colors[index] || ""),
      used,
      exist: used,
      state: used ? "Used" : "Unused",
    };
  });
}

function autoMapFilaments(gcodeFilaments, machineFilaments) {
  const mappings = Array(4).fill(-1);
  const assigned = new Set();

  for (const gcodeFilament of gcodeFilaments) {
    if (!gcodeFilament.used) continue;
    const candidates = machineFilaments
      .filter((machine) => machine.normalizedType && machine.normalizedType === gcodeFilament.normalizedType)
      .map((machine) => ({
        machine,
        rank: subtypeMatches(gcodeFilament, machine) ? 0 : 1,
      }))
      .sort((left, right) => (
        left.rank - right.rank ||
        Number(right.machine.loaded) - Number(left.machine.loaded) ||
        Number(assigned.has(left.machine.index)) - Number(assigned.has(right.machine.index)) ||
        left.machine.index - right.machine.index
      ));

    let selected = candidates[0] && candidates[0].machine;
    if (!selected) {
      const identity = machineFilaments[gcodeFilament.index];
      selected = (identity && identity.loaded ? identity : null)
        || machineFilaments.find((machine) => machine.loaded && !assigned.has(machine.index))
        || machineFilaments.find((machine) => machine.loaded)
        || identity
        || null;
    }

    if (selected) {
      mappings[gcodeFilament.index] = selected.index;
      assigned.add(selected.index);
    }
  }
  return mappings;
}

function buildDialogInitData(filename, task = {}, metadata = {}) {
  const machineFilaments = buildMachineFilaments(task);
  const parsedGcodeFilaments = buildGcodeFilaments(metadata);
  const hasGcodeMetadata = parsedGcodeFilaments.some((filament) => filament.used);
  const gcodeFilaments = hasGcodeMetadata
    ? parsedGcodeFilaments
    : machineFilaments.map((filament) => ({
        ...filament,
        name: filament.label,
        used: filament.loaded,
      }));

  return {
    filename,
    filaments: gcodeFilaments,
    gcodeFilaments,
    machineFilaments,
    mappings: autoMapFilaments(gcodeFilaments, machineFilaments),
    auto_bed_leveling: task.auto_bed_leveling !== false,
    flow_calibrate: task.flow_calibrate !== false,
    time_lapse_camera: task.time_lapse_camera !== false,
  };
}

function buildWindowsDialogScript(initDataB64, resultFile) {
  const resultPathEscaped = resultFile.replace(/\\/g, "/");
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$d = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${initDataB64}')) | ConvertFrom-Json

$form = New-Object System.Windows.Forms.Form -Property @{
  Text = 'Print Confirmation'
  Size = New-Object System.Drawing.Size(500, 540)
  StartPosition = 'CenterScreen'
  MaximizeBox = $false
  MinimizeBox = $false
  FormBorderStyle = 'FixedDialog'
  TopMost = $true
  BackColor = [System.Drawing.Color]::FromArgb(30, 30, 46)
  ForeColor = [System.Drawing.Color]::FromArgb(224, 224, 224)
}

$titleFont = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$sectionFont = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$labelFont = New-Object System.Drawing.Font('Segoe UI', 10)
$btnFont = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$btnFontSmall = New-Object System.Drawing.Font('Segoe UI', 10)

$yPos = 16

$titleLabel = New-Object System.Windows.Forms.Label -Property @{
  Text = 'Confirm Print'
  Location = New-Object System.Drawing.Point(20, $yPos)
  AutoSize = $true
  Font = $titleFont
  ForeColor = [System.Drawing.Color]::White
}
$form.Controls.Add($titleLabel)
$yPos += 30

$fileLabel = New-Object System.Windows.Forms.Label -Property @{
  Text = $d.filename
  Location = New-Object System.Drawing.Point(20, $yPos)
  Size = New-Object System.Drawing.Size(440, 36)
  Font = New-Object System.Drawing.Font('Segoe UI', 9)
  ForeColor = [System.Drawing.Color]::FromArgb(136, 136, 136)
}
$form.Controls.Add($fileLabel)
$yPos += 44

$filSection = New-Object System.Windows.Forms.Label -Property @{
  Text = 'Filament Selection'
  Location = New-Object System.Drawing.Point(20, $yPos)
  AutoSize = $true
  Font = $sectionFont
  ForeColor = [System.Drawing.Color]::FromArgb(170, 170, 170)
}
$form.Controls.Add($filSection)
$yPos += 24

$filChecks = @()
for ($i = 0; $i -lt 4; $i++) {
  $fil = $d.filaments[$i]
  $chk = New-Object System.Windows.Forms.CheckBox -Property @{
    Text = "Extruder $($i+1): $($fil.label) [$($fil.state)]"
    Location = New-Object System.Drawing.Point(36, $yPos)
    Size = New-Object System.Drawing.Size(420, 24)
    Font = $labelFont
    Checked = [bool]$fil.exist
    BackColor = [System.Drawing.Color]::FromArgb(30, 30, 46)
    ForeColor = [System.Drawing.Color]::FromArgb(224, 224, 224)
  }
  $form.Controls.Add($chk)
  $filChecks += $chk
  $yPos += 28
}

$yPos += 8
$optSection = New-Object System.Windows.Forms.Label -Property @{
  Text = 'Print Options'
  Location = New-Object System.Drawing.Point(20, $yPos)
  AutoSize = $true
  Font = $sectionFont
  ForeColor = [System.Drawing.Color]::FromArgb(170, 170, 170)
}
$form.Controls.Add($optSection)
$yPos += 24

$chkLevel = New-Object System.Windows.Forms.CheckBox -Property @{
  Text = 'Auto Bed Leveling'
  Location = New-Object System.Drawing.Point(36, $yPos)
  Size = New-Object System.Drawing.Size(300, 24)
  Font = $labelFont
  Checked = [bool]$d.auto_bed_leveling
  BackColor = [System.Drawing.Color]::FromArgb(30, 30, 46)
  ForeColor = [System.Drawing.Color]::FromArgb(224, 224, 224)
}
$form.Controls.Add($chkLevel)
$yPos += 28

$chkFlow = New-Object System.Windows.Forms.CheckBox -Property @{
  Text = 'Flow Calibration'
  Location = New-Object System.Drawing.Point(36, $yPos)
  Size = New-Object System.Drawing.Size(300, 24)
  Font = $labelFont
  Checked = [bool]$d.flow_calibrate
  BackColor = [System.Drawing.Color]::FromArgb(30, 30, 46)
  ForeColor = [System.Drawing.Color]::FromArgb(224, 224, 224)
}
$form.Controls.Add($chkFlow)
$yPos += 28

$chkTimelapse = New-Object System.Windows.Forms.CheckBox -Property @{
  Text = 'Timelapse'
  Location = New-Object System.Drawing.Point(36, $yPos)
  Size = New-Object System.Drawing.Size(300, 24)
  Font = $labelFont
  Checked = [bool]$d.time_lapse_camera
  BackColor = [System.Drawing.Color]::FromArgb(30, 30, 46)
  ForeColor = [System.Drawing.Color]::FromArgb(224, 224, 224)
}
$form.Controls.Add($chkTimelapse)
$yPos += 40

$btnPanel = New-Object System.Windows.Forms.Panel -Property @{
  Location = New-Object System.Drawing.Point(0, $yPos)
  Size = New-Object System.Drawing.Size(480, 50)
  BackColor = [System.Drawing.Color]::FromArgb(30, 30, 46)
}
$form.Controls.Add($btnPanel)

$cancelBtn = New-Object System.Windows.Forms.Button -Property @{
  Text = 'Cancel'
  Location = New-Object System.Drawing.Point(280, 8)
  Size = New-Object System.Drawing.Size(80, 34)
  Font = $btnFontSmall
  BackColor = [System.Drawing.Color]::FromArgb(51, 51, 51)
  ForeColor = [System.Drawing.Color]::FromArgb(170, 170, 170)
  FlatStyle = 'Flat'
  Cursor = 'Hand'
}
$btnPanel.Controls.Add($cancelBtn)

$printBtn = New-Object System.Windows.Forms.Button -Property @{
  Text = [char]0x25B6 + ' Start Print'
  Location = New-Object System.Drawing.Point(370, 6)
  Size = New-Object System.Drawing.Size(108, 38)
  Font = $btnFont
  BackColor = [System.Drawing.Color]::FromArgb(33, 150, 243)
  ForeColor = [System.Drawing.Color]::White
  FlatStyle = 'Flat'
  Cursor = 'Hand'
}
$btnPanel.Controls.Add($printBtn)

$resultFile = '${resultPathEscaped}'

$cancelBtn.Add_Click({
  @{ action = 'cancel' } | ConvertTo-Json -Compress | Out-File -FilePath $resultFile -Encoding utf8
  $form.Close()
})

$printBtn.Add_Click({
  $sel = @()
  for ($i = 0; $i -lt 4; $i++) { if ($filChecks[$i].Checked) { $sel += $i } }
  @{
    action = 'print'
    auto_bed_leveling = $chkLevel.Checked
    flow_calibrate = $chkFlow.Checked
    time_lapse_camera = $chkTimelapse.Checked
    selected_extruders = $sel
  } | ConvertTo-Json -Compress | Out-File -FilePath $resultFile -Encoding utf8
  $form.Close()
})

$form.Add_FormClosing({
  if (-not (Test-Path $resultFile)) {
    @{ action = 'cancel' } | ConvertTo-Json -Compress | Out-File -FilePath $resultFile -Encoding utf8
  }
})

[void]$form.ShowDialog()
`;
}

function buildLinuxDialogScript(initData) {
  const { filename, filaments } = initData;

  const safeFilename = filename.replace(/["\\$`]/g, "");
  let cmd = `zenity --title="Print Confirmation" --text="<b>Confirm Print</b>\\n${safeFilename}" --forms`;

  for (let i = 0; i < filaments.length; i++) {
    const f = filaments[i];
    const safeLabel = f.label.replace(/["\\$`]/g, "");
    const state = f.exist ? "Loaded" : "Empty";
    cmd += ` --add-check="Extruder ${i + 1}: ${safeLabel} [${state}]"`;
  }

  cmd += ` --add-check="Auto Bed Leveling"`;
  cmd += ` --add-check="Flow Calibration"`;
  cmd += ` --add-check="Timelapse"`;
  cmd += ` --separator="|"`;

  return cmd;
}

async function showWindowsDialog(initData) {
  const resultFile = makeResultFile();
  if (fs.existsSync(resultFile)) {
    try { fs.unlinkSync(resultFile); } catch (_) {}
  }

  const initDataB64 = Buffer.from(JSON.stringify(initData), "utf-8").toString("base64");
  const script = buildWindowsDialogScript(initDataB64, resultFile);
  const psPath = path.join(
    os.tmpdir(),
    `bambustudio_dialog_${process.pid}_${crypto.randomBytes(4).toString("hex")}.ps1`
  );
  fs.writeFileSync(psPath, script, "utf-8");

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-NoProfile", "-NonInteractive", "-File", psPath],
      { windowsHide: true, timeout: 300000 },
      (error) => {
        try { fs.unlinkSync(psPath); } catch (_) {}

        if (fs.existsSync(resultFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(resultFile, "utf-8").trim());
            try { fs.unlinkSync(resultFile); } catch (_) {}
            if (data.action === "print") {
              resolve({
                auto_bed_leveling: data.auto_bed_leveling ?? true,
                flow_calibrate: data.flow_calibrate ?? true,
                time_lapse_camera: data.time_lapse_camera ?? true,
                selected_extruders: data.selected_extruders || [0, 1, 2, 3],
              });
              return;
            }
          } catch (_) {}
        }
        try { fs.unlinkSync(resultFile); } catch (_) {}
        resolve(null);
      }
    );
  });
}

async function showLinuxDialog(initData) {
  try {
    execFileSync("which", ["zenity"], { timeout: 3000 });
  } catch (_) {
    return null;
  }

  const cmd = buildLinuxDialogScript(initData);

  return new Promise((resolve) => {
    execFile("sh", ["-c", cmd], { timeout: 300000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }

      const values = stdout.trim().split("|");
      const filCount = initData.filaments.length;
      const selectedExtruders = [];
      for (let i = 0; i < filCount; i++) {
        if (values[i] === "true") selectedExtruders.push(i);
      }

      resolve({
        auto_bed_leveling: values[filCount] === "true",
        flow_calibrate: values[filCount + 1] === "true",
        time_lapse_camera: values[filCount + 2] === "true",
        selected_extruders: selectedExtruders.length ? selectedExtruders : [0, 1, 2, 3],
      });
    });
  });
}

function findBundleContents(startPath) {
  if (!startPath) return null;
  let current = path.resolve(startPath);
  try {
    if (fs.statSync(current).isFile()) current = path.dirname(current);
  } catch (_) {
    // A non-existent executable path can still contribute its parent dirs.
    current = path.dirname(current);
  }

  while (true) {
    if (path.basename(current) === "Contents" && path.extname(path.dirname(current)) === ".app") {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isFile(candidate, fsImpl = fs) {
  try {
    return fsImpl.statSync(candidate).isFile();
  } catch (_) {
    return false;
  }
}

/**
 * Locate the native dialog helper. U1_DIALOG_HELPER is authoritative when set;
 * packaged builds then search the conventional Contents locations, followed
 * by the per-user runtime directory used by the companion app.
 */
function findMacDialogHelper({
  env = process.env,
  fsImpl = fs,
  moduleDir = __dirname,
  execPath = process.execPath,
  mainPath = require.main && require.main.filename,
  dataDir,
} = {}) {
  if (env.U1_DIALOG_HELPER && env.U1_DIALOG_HELPER.trim()) {
    const configured = env.U1_DIALOG_HELPER.trim();
    const expanded = configured === "~"
      ? os.homedir()
      : configured.startsWith("~/")
        ? path.join(os.homedir(), configured.slice(2))
        : configured;
    return path.resolve(expanded);
  }

  const contentsDirs = new Set(
    [moduleDir, execPath, mainPath]
      .map(findBundleContents)
      .filter(Boolean)
  );
  const candidates = [];
  for (const contentsDir of contentsDirs) {
    for (const name of MAC_DIALOG_HELPER_NAMES) {
      candidates.push(path.join(contentsDir, "MacOS", name));
      candidates.push(path.join(contentsDir, "Resources", "Helpers", name));
    }
  }

  const resolvedDataDir = dataDir || getBridgeDataDir({ platform: "darwin", env });
  for (const name of MAC_DIALOG_HELPER_NAMES) {
    candidates.push(path.join(resolvedDataDir, "bin", name));
    candidates.push(path.join(moduleDir, name));
  }

  return candidates.find((candidate) => isFile(candidate, fsImpl)) || null;
}

function buildMacDialogPayload(initData) {
  return {
    protocolVersion: 1,
    type: "printConfirmation",
    filename: initData.filename,
    filaments: initData.filaments,
    gcodeFilaments: initData.gcodeFilaments || initData.filaments,
    machineFilaments: initData.machineFilaments || [],
    mappings: initData.mappings || [0, 1, 2, 3],
    auto_bed_leveling: initData.auto_bed_leveling,
    flow_calibrate: initData.flow_calibrate,
    time_lapse_camera: initData.time_lapse_camera,
    // Native-style aliases keep the protocol straightforward for Swift while
    // snake_case fields preserve parity with the Windows/Linux implementations.
    bedLeveling: initData.auto_bed_leveling,
    flowCalibration: initData.flow_calibrate,
    timelapse: initData.time_lapse_camera,
  };
}

function readDialogBoolean(data, names, fallback) {
  for (const name of names) {
    if (!(name in data)) continue;
    if (typeof data[name] !== "boolean") {
      throw new NativeDialogError(`Dialog helper returned non-boolean ${name}`, "invalid_helper_response");
    }
    return data[name];
  }
  return fallback;
}

function normalizeMacDialogResult(stdout, initData) {
  let data;
  try {
    data = JSON.parse(String(stdout || "").trim());
  } catch (e) {
    throw new NativeDialogError("Dialog helper returned invalid JSON", "invalid_helper_response", e);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new NativeDialogError("Dialog helper returned a non-object response", "invalid_helper_response");
  }
  if (data.confirmed === false || data.action === "cancel") return null;
  if (data.confirmed !== true && data.action !== "print") {
    throw new NativeDialogError("Dialog helper response is missing confirmation state", "invalid_helper_response");
  }

  let mapTable = [];
  let mappings;
  try {
    if (data.extruder_map_table !== undefined || data.mappingTable !== undefined) {
      mapTable = normalizeExtruderMapTable(data.extruder_map_table ?? data.mappingTable);
    } else if (data.mappings !== undefined) {
      if (!Array.isArray(data.mappings)) throw new Error("mappings must be an array");
      mappings = data.mappings.map((value) => Number(value));
      if (mappings.some((value) => !Number.isInteger(value) || value < -1 || value > 3)) {
        throw new Error("mappings contain an out-of-range value");
      }
      mapTable = normalizeExtruderMapTable(mappings);
    }
  } catch (e) {
    throw new NativeDialogError(`Dialog helper returned invalid mappings: ${e.message}`, "invalid_helper_response", e);
  }

  let selectedExtruders;
  if (data.selected_extruders !== undefined) {
    if (!Array.isArray(data.selected_extruders)) {
      throw new NativeDialogError("Dialog helper returned invalid selected_extruders", "invalid_helper_response");
    }
    selectedExtruders = [...new Set(data.selected_extruders.map(Number))];
    if (selectedExtruders.some((value) => !Number.isInteger(value) || value < 0 || value > 3)) {
      throw new NativeDialogError("Dialog helper returned out-of-range selected_extruders", "invalid_helper_response");
    }
  } else if (mapTable.length > 0) {
    selectedExtruders = [...new Set(mapTable.map(([, physical]) => physical))];
  } else {
    selectedExtruders = [0, 1, 2, 3];
  }

  return {
    auto_bed_leveling: readDialogBoolean(
      data,
      ["bedLeveling", "auto_bed_leveling"],
      initData.auto_bed_leveling
    ),
    flow_calibrate: readDialogBoolean(
      data,
      ["flowCalibration", "flow_calibrate"],
      initData.flow_calibrate
    ),
    time_lapse_camera: readDialogBoolean(
      data,
      ["timelapse", "time_lapse_camera"],
      initData.time_lapse_camera
    ),
    selected_extruders: selectedExtruders,
    mappings,
    extruder_map_table: mapTable,
  };
}

async function showMacDialog(initData, options = {}) {
  const helperPath = options.helperPath || findMacDialogHelper(options);
  if (!helperPath) {
    throw new NativeDialogError(
      "No macOS dialog helper found; set U1_DIALOG_HELPER or reinstall Snapmaker U1 Bridge",
      "helper_not_found"
    );
  }

  const execFileImpl = options.execFileImpl || execFile;
  const payload = JSON.stringify(buildMacDialogPayload(initData));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    let child;
    try {
      child = execFileImpl(
        helperPath,
        [],
        { timeout: 300000, maxBuffer: 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const detail = String(stderr || "").trim();
            const suffix = detail ? `: ${detail.slice(0, 500)}` : "";
            finish(
              reject,
              new NativeDialogError(
                `macOS dialog helper failed (${error.code || "unknown"})${suffix}`,
                "helper_failed",
                error
              )
            );
            return;
          }
          try {
            finish(resolve, normalizeMacDialogResult(stdout, initData));
          } catch (e) {
            finish(reject, e);
          }
        }
      );
    } catch (e) {
      finish(reject, new NativeDialogError(`Unable to launch macOS dialog helper: ${e.message}`, "helper_failed", e));
      return;
    }

    if (!child || !child.stdin) {
      finish(reject, new NativeDialogError("macOS dialog helper has no stdin", "helper_failed"));
      return;
    }
    child.stdin.on("error", (e) => {
      finish(reject, new NativeDialogError(`Failed to send dialog request: ${e.message}`, "helper_failed", e));
    });
    try {
      child.stdin.end(payload);
    } catch (e) {
      finish(reject, new NativeDialogError(`Failed to send dialog request: ${e.message}`, "helper_failed", e));
    }
  });
}

async function showPrintDialog(filename, baseUrl, apikey) {
  const [task, metadata] = await Promise.all([
    fetchPrintTask(baseUrl, apikey),
    fetchGcodeMetadata(baseUrl, filename, apikey),
  ]);
  const initData = buildDialogInitData(filename, task, metadata);

  if (process.platform === "win32") {
    return showWindowsDialog(initData);
  } else if (process.platform === "darwin") {
    return showMacDialog(initData);
  } else {
    return showLinuxDialog(initData);
  }
}

module.exports = {
  NativeDialogError,
  autoMapFilaments,
  buildDialogInitData,
  buildGcodeFilaments,
  buildMacDialogPayload,
  buildMachineFilaments,
  fetchGcodeMetadata,
  findMacDialogHelper,
  normalizeMacDialogResult,
  showMacDialog,
  showPrintDialog,
};
