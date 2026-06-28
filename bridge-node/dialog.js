const { execFile, execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const fetch = require("node-fetch");

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

async function showPrintDialog(filename, baseUrl, apikey) {
  const task = await fetchPrintTask(baseUrl, apikey);

  const filTypes = task.filament_type || [];
  const filSub = task.filament_sub_type || [];
  const filExist = task.filament_exist || [];

  const filaments = [];
  for (let i = 0; i < 4; i++) {
    const ftype = filTypes[i] || "--";
    const fsub = filSub[i] || "";
    const exist = !!filExist[i];
    filaments.push({
      label: ftype + (fsub ? ` (${fsub})` : ""),
      exist,
      state: exist ? "Loaded" : "Empty",
    });
  }

  const initData = {
    filename,
    filaments,
    auto_bed_leveling: task.auto_bed_leveling !== false,
    flow_calibrate: task.flow_calibrate !== false,
    time_lapse_camera: task.time_lapse_camera !== false,
  };

  if (process.platform === "win32") {
    return showWindowsDialog(initData);
  } else {
    return showLinuxDialog(initData);
  }
}

module.exports = { showPrintDialog };
