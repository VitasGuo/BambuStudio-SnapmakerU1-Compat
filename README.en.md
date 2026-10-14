# Snapmaker U1 BambuStudio Compatibility Pack v5.48.0

Enables BambuStudio to slice for and print on the Snapmaker U1 with a **native-level device control experience** (via the Bridge server + native print-confirm dialog), supporting LAN direct connection and Tailscale cascade remote printing.

---

This project was developed with Solo by ByteDance, in cooperation with Zhipu AI's GLM-5.1 & GLM-5.2 models.

---

## Prerequisites

- **Operating System**: Windows or Linux
- **BambuStudio** installed ([official download](https://bambulab.com/en/download/bambu-studio))
- **Node.js** 18+ installed ([official download](https://nodejs.org))
- Snapmaker U1 printer and computer on the **same LAN** (remote printing over the internet requires Tailscale, see [Remote Printing](#remote-printing-tailscale-cascade-architecture-v5460))

---

## Quick Start

### Step 1: Install the Compatibility Pack

#### Windows (Automatic Installation)

1. Right-click `install.bat` → **Run as administrator**
2. The script automatically: detects the BambuStudio path → clears old caches → copies configuration → installs Bridge → patches `print_host` → creates startup auto-launch → starts Bridge
3. If BambuStudio is not detected, enter the installation path manually

> After installation, the original compatibility pack directory can be deleted; Bridge and configuration have been integrated into the BambuStudio directory and APPDATA.

#### Linux (Automatic Installation)

```bash
# 1. Make sure Node.js 18+ and BambuStudio are installed
node --version  # Check Node.js

# 2. Grant execute permission and run the install script
chmod +x install.sh
./install.sh
```

The install script automatically:
1. Detects the BambuStudio installation path (supports AppImage / .deb / directory installs)
2. Clears the old system cache
3. Clears the filament cache in BambuStudio.conf
4. Patches the `print_host` in the user machine configuration to `http://127.0.0.1:13628`
5. Copies the Snapmaker profiles into BambuStudio's `resources/profiles/`
6. Installs the Bridge Server to `~/.local/share/BambuStudio-Bridge/bridge/`
7. Installs npm dependencies
8. Creates a systemd user service (or .desktop autostart + cron watchdog)
9. Starts the Bridge Server

**BambuStudio installation method notes**:

| Installation method | profiles install location | Notes |
|----------|-------------------|------|
| .deb package | `/opt/BambuStudio/resources/profiles/` | Written directly, permanent |
| Directory install | `<dir>/resources/profiles/` | Written directly, permanent |
| AppImage | `~/.config/BambuStudio/system/` | User cache directory, may be overwritten after BambuStudio restarts |

> For AppImage users who want a permanent profiles installation, it is recommended to extract the AppImage first (`./BambuStudio_*.AppImage --appimage-extract`), then point the install script at the `squashfs-root/` directory.

**Configuration/Log paths** (Linux XDG standard):
- Bridge config: `~/.config/BambuStudio-Bridge/`
- Bridge data: `~/.local/share/BambuStudio-Bridge/`
- BambuStudio config: `~/.config/BambuStudio/`

### Step 2: Add the Printer in BambuStudio

1. **Completely close** BambuStudio (make sure the process has exited), then reopen it
2. Click **Add Printer** → select the **Snapmaker** brand → **Snapmaker U1** → choose the nozzle diameter

> Bridge auto-detects Snapmaker printers on the LAN via mDNS on first launch — no need to enter the IP manually.

### Step 3: Slice and Print

1. Import a 3D model → select a process preset and filament → click **Slice**
2. After slicing completes, click **Print** → select **Print**
3. Bridge pops up the **native print-confirm dialog**:
   - G-code info (file name / estimated time / estimated material usage)
   - Filament mapping (gcode slot → physical slot, auto-match + manual selection)
   - Print options (auto bed leveling / flow calibration / time-lapse)
4. Click **▶ Start Print** → printing begins

> If you select **Upload**, the file is only uploaded to the printer without auto-starting the print. You can start the print manually from the WebUI in the Device tab.

### Uninstall

**Windows**: Right-click `uninstall.bat` → **Run as administrator**. The script cleans up configuration, Bridge, and caches, preserving user-defined filament presets.

**Linux**:
```bash
chmod +x uninstall.sh
./uninstall.sh
```
The script stops Bridge, removes auto-start, cleans profiles and configuration, preserving user-defined filament presets.

**Reinstall (Linux)**:
```bash
chmod +x reinstall.sh
./reinstall.sh
```

---

## Package Contents

### Slicing Profiles

| Category | Contents | Count |
|------|------|------|
| Printer | Snapmaker U1 (0.4 nozzle) | 1 |
| Process presets | 0.08~0.28mm (Extra Fine / Fine / Optimal / Standard / Draft, etc.) | 10 |
| Filament presets | Full Bambu Lab range + Generic + Snapmaker official | 80 |
| Bed model | Snapmaker U1 bed STL + texture SVG + cover image | 3 |

### Bridge Server (Node.js)

| File | Description |
|------|------|
| `bridge-node/server.js` | Express HTTP/WebSocket proxy server |
| `bridge-node/slice_agent.js` | AI Lab core: G-code optimization engine + G-code conversion engine + Workspace system |
| `bridge-node/aiClient.js` | Shared AI invocation module (AiClient class + AI_PROVIDERS + extractErrorMessage, v5.36.0+) |
| `bridge-node/dialog.js` | Cross-platform native print-confirm dialog (v5.44.0+ supports cross-channel cancellation) |
| `bridge-node/netUtils.js` | Request source detection (isLocalAddress, remote/local confirm interaction routing, v5.44.0+) |
| `bridge-node/package.json` | Node.js dependency declarations |
| `bridge-node/workspace/` | AI Agent Workspace (Soul/Knowledge/Skills/Memory Markdown) |
| `bridge/web/webui.html` | WebUI device control panel |
| `bridge/web/ailab.css` | AI Lab styles |
| `bridge/web/ailab.js` | AI Lab frontend logic (G-code optimization + print assistant) |
| `bridge/web/gcvt.js` | G-code conversion frontend logic (standalone tab) |

### Directory Structure

```
BambuStudio-SnapmakerU1-Compat/
├── install.bat / install.ps1       # Install scripts
├── reinstall.bat / reinstall.ps1   # Reinstall scripts
├── uninstall.bat / uninstall.ps1   # Uninstall scripts
├── install-common.psm1             # Install script common module (v5.36.0+, includes BambuStudio/Beta dual-channel config traversal)
├── install.sh / reinstall.sh / uninstall.sh  # Linux scripts (v5.39.0+)
├── make-zip.ps1                    # Release packaging script
├── deploy-home.ps1                 # Home machine Bridge one-click deploy script (v5.45.0+)
├── Snapmaker.json                  # Brand config entry
├── Snapmaker/                      # Slicing profiles directory
│   ├── machine/                    # Printer configuration
│   ├── process/                    # Process presets
│   └── filament/                   # Filament presets
├── bridge-node/                    # Bridge server (Node.js)
│   ├── server.js                   # Core server
│   ├── slice_agent.js              # AI Lab optimization engine
│   ├── aiClient.js                 # Shared AI invocation module (AiClient class)
│   ├── dialog.js                   # Native dialog
│   ├── netUtils.js                 # Request source detection (remote print routing, v5.44.0+)
│   ├── package.json                # Dependency declarations
│   └── workspace/                  # AI Agent Workspace
│       ├── soul.md                 # Agent identity and principles
│       ├── knowledge.md            # Domain knowledge
│       ├── memory.md               # Experiential memory
│       ├── skills/                 # Skill files
│       └── tools/                  # Tool files
└── bridge/                         # WebUI resources
    └── web/
        ├── webui.html              # Device control panel
        ├── ailab.css               # AI Lab styles
        ├── ailab.js                # AI Lab frontend logic
        ├── gcvt.js                 # G-code conversion frontend logic
        └── dist/                   # Fluidd frontend (optional)
```

After installation:
- Bridge directory copied to: `C:\Program Files\Bambu Studio\bridge\`
- Configuration files stored in: `%APPDATA%\BambuStudio-Bridge\`
- Log file: `%APPDATA%\BambuStudio-Bridge\bridge.log`

---

## Workflow

### Bridge Architecture

```
BambuStudio
  │
  │ 1. Slice → click Print
  │    BambuStudio pops up Upload/Print/Cancel
  │
  │ 2. Select Print → POST /api/files/local (print=true)
  │    ┌──────────────────────────────────────────┐
  │    │  Bridge (localhost:13628)                 │
  │    │  3. Upload file to Moonraker (without print) │
  │    │  4. Pop up native print-confirm dialog    │
  │    │     - Filament mapping (gcode→physical slot) │
  │    │     - Auto bed leveling / flow calibration / time-lapse │
  │    │  5. After confirmation, send stepwise print commands │
  │    │     (SET_PRINT_EXTRUDER_MAP →              │
  │    │      SET_PRINT_USED_EXTRUDERS →             │
  │    │      SET_PRINT_PREFERENCES →               │
  │    │      printer.print.start)                  │
  │    └──────────────────────────────────────────┘
  │
  │ 6. Device tab → WebUI / Fluidd
  │    Real-time monitoring, temperature control, lights, fans, etc.
  │
  ▼
Snapmaker U1 (Moonraker + Klipper)
```

### Remote Printing (Tailscale Cascade Architecture, v5.46.0+)

Securely connect to your home printer from anywhere on the internet — **connect to your own printer anywhere, with full control of your data** (WireGuard end-to-end encryption, no cloud dependency, no third-party servers).

Uses a **cascade architecture (two Bridges)**: the remote machine also runs a local Bridge (A), and A treats the home Bridge (B) as a "printer" — the confirm dialog, slicing, and AI Lab are all handled locally on the remote machine, while the home computer does pure data relay, giving an experience identical to being at home.

```
Remote BambuStudio ──> Remote Bridge A ──Tailscale tunnel(encrypted)──> Home Bridge B ──LAN──> Snapmaker U1

  Remote slice → click Print → A shows the confirm dialog locally (no popup on the home desktop)
  → confirmed on the remote machine → A relays through B → printing starts
```

**Configuration steps (recommended: Tailscale Serve, zero firewall configuration)**:

1. Install [Tailscale](https://tailscale.com/download) on both the home computer and the external device, and log in with the same account (the free tier is sufficient)
2. Run once on the home computer (no administrator needed, takes effect automatically after restart/reconnect; HTTPS must be enabled on the tailnet):
   `tailscale serve --bg http://127.0.0.1:13628`
   — the tailscaled service proxies traffic on the local loopback and auto-issues an HTTPS certificate, so Windows Firewall does not need to allow node.exe (traps.md #154)
3. Install this compatibility pack v5.46.0+ on the external device (purely local install, no mode selection)
4. On the external device, open the WebUI (http://127.0.0.1:13628 gear settings) → Connection → select **Remote Bridge** → enter the home serve address (e.g. `https://vitasguo-pc.tailxxxx.ts.net`, port 443 need not be written) → click **Test** and it shows reachable → save
5. Slice → Print: the upload returns immediately, the filament mapping confirm dialog pops up on the remote machine (identical to being at home), and printing starts after confirmation

**How it works**:

- **Cascade relay**: A treats B as a Moonraker endpoint (fully transparent HTTP + WebSocket forwarding); the printer apikey is stored only on B's side, and A holds no printer credentials; the `BRIDGE_CONFIG_DIR`/`BRIDGE_PORT` environment variables support multi-instance debugging on a single machine
- **Confirm interaction happens locally on A**: popups/filament mapping are handled locally on the remote machine that initiated the request; the unattended home computer is unaffected
- **Network efficiency** (v5.47.0+): keep-alive connection pool (avoids repeated TLS handshakes for cross-network requests — the main fix for slow panel refreshes), double-layer gzip compression (cross-network traffic for file lists/G-code text reduced by ~70-80%, already-compressed content like JPEG auto-skipped), large-file streaming relay (a 146MB G-code download verified complete, with zero full-memory buffering on either end)
- **Stability guarantees** (v5.47.0+): WebSocket 30s ping keep-alive (prevents idle disconnects through Tailscale/NAT), automatic retry of transient upload network errors (Moonraker uploads are idempotent, so retries are safe), unlimited upload timeout (completes naturally according to file size × network speed)
- **Large-file contingency**: the home broadband upload is a hard constraint (at 5Mbps upload, a 100MB G-code takes ~3 minutes, which is a physical limit); if the cascade link fails, the fallback channel is to access `https://<machine>.ts.net/fluidd` directly from the external browser to operate the WebUI/Fluidd, bypassing the cascade
- **Serve proxy detection** (v5.44.1+): `tailscale serve` proxy connections originate from loopback but carry an `X-Forwarded-For` header (the real client's tailnet IP) — loopback + XFF is judged as a remote request (traps.md #155); judging by the raw socket address would misclassify it
- **Trust model**: relies on Tailscale device-level authentication (everything in the tailnet is your own device); serve is reachable only within the tailnet (not Funnel, not exposed to the public internet), and Bridge adds no extra token

**Advanced: direct-connection mode (three-state bind, requires allowing the firewall as administrator)**

WebUI gear settings → Remote Access allows selecting the listening mode for direct connection via `http://100.x.x.x:13628`:

| bind mode | Listen address | Who can access |
|-----------|---------|---------|
| Local only (default) | 127.0.0.1 | This machine only |
| Tailnet only | 100.x.x.x + 127.0.0.1 dual listening | This machine + devices in your tailnet |
| All interfaces | 0.0.0.0 | All devices on the LAN (not recommended) |

Note: direct-connection mode requires the Windows Firewall to allow node.exe inbound. If you clicked "Cancel" in a previous firewall popup, an auto-generated Block rule remains (with higher priority than Allow and must be deleted as administrator, traps.md #154); serve mode has no such requirement and is recommended.

### Key Design Decisions

| Decision | Reason |
|------|------|
| JSONP bridging (`bridgeGET`/`bridgePOST`) | BambuStudio's WebView blocks fetch/XHR but allows `<script>` loading |
| Stepwise print commands (not `SDCARD_PRINT_FILE_WITH_PARAMETERS`) | `SET_PRINT_TASK_PARAMETERS` does not update `reprint_info`, so the mapping does not take effect (traps.md #101) |
| CIEDE2000 color matching | RGB space is not perceptually uniform; aligns with OrcaSlicer's native implementation |
| `patchGcodeLayout()` reassembles gcode on upload | BambuStudio puts the CONFIG_BLOCK at the beginning, while Moonraker only searches the end of the file |
| Snapshot polling (not MJPEG stream) | U1 does not run mjpegstreamer; implemented via single `monitor.jpg` JPEGs |
| Remote confirm interaction follows the request initiator (v5.44.0) | The home computer only bridges data: remote requests do not pop up on the home desktop; the confirm dialog appears in the remote WebUI, providing a seamless experience identical to local use |
| bind=tailnet dual listening (v5.44.0) | Binds a tailnet-dedicated address (unreachable from the LAN) + loopback (zero changes for local BambuStudio) |
| Trust Tailscale device auth, no token (v5.44.0) | Everything in the tailnet is your own device; avoids reworking BambuStudio request URLs and preserves the zero-configuration experience |
| `cancelActiveDialog()` cross-channel cancellation (v5.44.0) | Automatically closes leftover desktop dialogs after WebUI confirm/cancel, eliminating duplicate-print risk caused by dual-channel races |
| `tailscale serve` for remote entry (v5.44.1) | tailscaled proxies on loopback + auto HTTPS certificate, bypassing the Windows Firewall node.exe Block rule (traps.md #154), zero configuration and zero privilege escalation |
| loopback + `X-Forwarded-For` judged as remote (v5.44.1) | The serve proxy request's socket source is 127.0.0.1; only by recognizing XFF can the confirm interaction follow the real initiator (traps.md #155) |
| Installer remote-mode auto-detection + print_host rewrite (v5.45.0, removed in v5.46.0) | Command-line mode selection was a poor experience; v5.46.0 replaced it with the graphical Connection section in the WebUI (Local printer / Remote Bridge radio buttons + Test detection), returning the installer to pure-local |
| Cascade architecture (two Bridges, v5.46.0) | Remote Bridge A treats home Bridge B as a "printer": popups/slicing/AI Lab all handled locally on A, with B doing pure relay; printer credentials are stored only on B's side, giving a remote experience identical to being at home |
| Proxy responses strip content-encoding/content-length (v5.46.0) | node-fetch auto-decompresses gzip, so the body is already plain text; forwarding the original encoding header would make downstream clients' gunzip fail (always occurs in cascade A→B, traps.md #161) |
| keep-alive connection pool + gzip compression + streaming relay (v5.47.0) | Each request over the cascade crossing Tailscale pays a +100~400ms TLS handshake — the main cause of "lag"; text traffic compresses ~75%; arrayBuffer full buffering doubled memory usage on both ends for large files |
| JSONP requests exempt from compression (v5.47.0) | JSONP goes through `<script>` tags, and old WebViews do not guarantee gzip response decompression; the `cb=` parameter is the JSONP signature, so exempting it is zero-risk |

### Device Control Features

| Feature | WebUI | Fluidd |
|------|-------|--------|
| Camera | ✅ Live preview | ✅ Full monitoring |
| Print progress | ✅ Percentage + layer count | ✅ Full management |
| Temperature control | ✅ Bed + 4 nozzles | ✅ Full temperature graph |
| Lights | ✅ On/off | ❌ |
| Fan | ✅ Cooling + chamber | ✅ Full fan graph |
| Filament info | ✅ Type + color | ❌ |
| Speed adjustment | ✅ 5 levels | ✅ Full control |
| Z-axis control | ✅ Up/down + home | ✅ |
| Print control | ✅ Start/pause/resume/cancel | ✅ Full Klipper |
| Chinese/English | ✅ | ❌ |
| Debug logs | ✅ Debug panel | ❌ |
| AI Lab | ✅ G-code optimization + print assistant (streaming output + Thinking mode) | ❌ |
| G-code conversion | ✅ BambuStudio→OrcaSlicer | ❌ |

---

## Notes

- **Reinstall after BambuStudio updates**: updates may overwrite configuration files; simply re-run `install.bat`
- **Printer auto-detection**: Bridge auto-detects via mDNS on first launch. If it fails, open `http://127.0.0.1:13628` in a browser to configure manually
- **Multi-color printing**: BambuStudio supports multi-color slicing, and the U1's 4-tool-head color change mechanism works correctly. The mapping rows in the print-confirm dialog are dynamically generated from the colors actually used by the gcode (v5.48.0, supports 8+ color projects — e.g. in an 8-color project using colors 2/4/6/8, all 4 rows are visible and editable); each G-code slot's dropdown can select from the 4 physical slots; multiple G-code slots can map to the same physical extruder (e.g. printing a 4-color PLA with a single spool)
- **Filament selection**: manually select a filament preset in BambuStudio that matches what is actually loaded in the U1 tool heads
- **⚠️ Direct printing from the device panel limitation**: printing BambuStudio-generated gcode directly on the U1's device touch panel shows "unrecognized gcode type" (the closed-source touchscreen firmware checks `;TYPE:` layer markers). You can use the **G-code Conversion** feature in the WebUI sidebar's "Convert" tab to convert BambuStudio gcode to an OrcaSlicer-compatible format before uploading, or print through the WebUI

---

## FAQ

**Q: After installation, I can't see the Snapmaker U1 in BambuStudio?**
A: Completely close and restart BambuStudio. Check that the files were correctly copied into the `resources/profiles/` directory.

**Q: After slicing, clicking print starts immediately without the confirm dialog?**
A: Check that Bridge is running (look for the node process in Task Manager). Check that `print_host` points to `http://127.0.0.1:13628`. Check the log at `%APPDATA%\BambuStudio-Bridge\bridge.log`.

**Q: I only see 2 filaments after installation?**
A: Re-run `install.bat`; the script will automatically clear the filament cache.

**Q: The compatibility pack stops working after a BambuStudio update?**
A: Re-run `install.bat`.

**Q: My custom filament presets were lost after reinstall?**
A: This was fixed in v5.18.1; the install script no longer deletes user-defined presets.

---

## Version History

- **v5.48.0** (2026-10-08) - Fixed 8+ color project filament mapping showing only the first 4 slots (traps.md #164): the G-code slots in the webui.html print-confirm dialog are now dynamic — rendered according to the actual slot count in the metadata (supports 8+ color BambuStudio projects); mapping rows show only the colors **actually used** by the gcode (`filament_used_mm>0` filter, falling back to showing all typed slots when no usage data exists); physical slots remain 4 (U1 is a four-head machine); also fixed two issues — auto-match grabbing physical slots for unused slots, and `SET_PRINT_USED_EXTRUDERS` mislabeling unused physical heads; version numbers fully unified (fixed version numbers missed in webui.html/install scripts in v5.47.0)
- **v5.47.0** (2026-08-24) - Cascade link network efficiency optimization + large-file transfer stability (targeted fix for "lag" observed on external networks): 1) **keep-alive connection pool** (http/https Agent) — previously each request created a new TCP+TLS connection, and each TLS handshake across Tailscale cost +100~400ms; tens of requests per panel refresh was the main cause of "lag"; 2) **gzip response compression** (express compression, ≥1KB, JSONP `cb=` requests exempted to protect old WebViews) — cross-network traffic for file lists/G-code text reduced ~70-80%; 3) **streaming relay** (proxyToMoonraker/webcam switched from arrayBuffer full buffering to pipeline) — a 146MB G-code cascade download verified complete (17.5s) with zero full-memory buffering on either end; 4) **WS 30s ping keep-alive** — prevents panel state freezing from idle disconnects through Tailscale/NAT; 5) **automatic retry of transient upload network errors** (ECONNRESET/ETIMEDOUT, etc., retrying once after 2s; Moonraker uploads are idempotent and safe); 6) deploy-home.ps1 added dependency auto-sync (compression is a new runtime dependency; a missing old node_modules would crash on startup)
- **v5.46.0** (2026-08-24) - Cascade architecture (two Bridges) + WebUI graphical connection configuration: remote Bridge A treats home Bridge B as a "printer" — popups/slicing/AI Lab all handled locally on A, with B doing pure relay, printer credentials stored only on B's side; WebUI gear settings added the Connection section (Local printer / Remote Bridge radio buttons + Test connectivity detection via `/api/bridge/test_upstream.js`); the installer returned to pure-local (removed v5.45.0's command-line mode selection; all remote configuration moved to the WebUI); fixed the always-reproducible gzip forwarding header bug in the cascade (node-fetch forwards the original content-encoding header after auto-decompression, causing the downstream gunzip of plain text to report "incorrect header check", traps.md #161); added the `BRIDGE_CONFIG_DIR` environment variable for multi-instance debugging (traps.md #162); test script restored net_utils.test.js back to 52/52 (traps.md #163)
- **v5.45.0** (2026-08-24) - Installer remote mode works out of the box (replaced by WebUI configuration in v5.46.0): choose local/remote mode at install time; remote mode auto-detects a Bridge on an online tailnet device and rewrites print_host; supports BambuStudio stable/Beta dual-channel config directories (traps.md #159); fixed the machine JSON regex matching (traps.md #158); Linux scripts CRLF newline fix + `.gitattributes` regression guard (traps.md #160); added deploy-home.ps1 (one-click home machine deployment) + make-zip.ps1 (release packaging)
- **v5.44.1** (2026-08-24) - Tailscale Serve remote printing adaptation: during deployment it was discovered that Windows Firewall has a node.exe inbound Block rule (auto-generated when "Cancel" was clicked in a firewall popup, with higher priority than Allow, traps.md #154), making the direct-connection mode unreachable from the internet without admin rights to delete it. Switched to `tailscale serve` (tailscaled proxies on loopback + auto HTTPS certificate, zero firewall configuration): 1) `netUtils.js` added `isLocalRequest(req)` — only loopback without `X-Forwarded-For` is judged local; loopback + XFF = remote request proxied through serve (traps.md #155), fixing the issue where remote uploads wrongly popped the home desktop dialog in serve scenarios; 2) README remote printing section rewritten: serve is the recommended path, bind direct connection downgraded to advanced mode; 3) unit tests added 8 isLocalRequest cases (52 total)
- **v5.44.0** (2026-08-24) - Tailscale remote printing official release: 1) **confirm interaction follows the request initiator** — local requests pop the local desktop dialog (unchanged); remote requests skip the home desktop popup and return upload success immediately, with the confirm dialog appearing in the remote WebUI (Device tab), the home computer acting as a pure data bridge; 2) **dual-channel race fix** — `dialog.js` added `cancelActiveDialog()`, which automatically closes leftover desktop dialogs after WebUI confirm/cancel, eliminating duplicate-print risk; 3) **three-state bind** (`127.0.0.1`/`tailnet`/`0.0.0.0`) — the recommended tailnet mode dual-listens the tailnet IP + loopback, unreachable from the LAN with zero changes to local BambuStudio; 4) **Tailscale status detection** — `tailscale status --json` retrieves the MagicDNS hostname + online status (NIC scan fallback, 10s cache); the WebUI settings popup shows the recommended Remote URL for one-click copy; 5) added `netUtils.js` (isLocalAddress pure function) + 16 unit tests (44 total)
- **v5.38.0** (2026-07-02) - AI Lab/G-code conversion bilingualization + print dialog format indicator (traps.md #149, #150): 1) `ailab.js` / `gcvt.js` added the `aiT(zh,en)` / `gcvtT(zh,en)` translation functions; the IIFE was changed to a re-callable function + ApplyLang function, with `setLang()` calling re-render at the end; ~90 text points fully bilingualized, following the WebUI language switch; 2) `server.js` added the `check_gcode_format.js` JSONP endpoint (HTTP Range download of the first 32KB for format detection); `showPrintDialog` asynchronously displays the format indicator, showing an orange warning + "Go to Convert" jump link for BambuStudio format
- **v5.37.3** (2026-06-29) - Fixed upload timeout regression bug (traps.md #148): the v5.37.2 code-review fix M2 added fixed timeouts to upload/download (120s/60s), causing large G-code files to time out and be aborted on slow networks with `HTTP 500: The user aborted a request`. Uploads and downloads reverted to bare `fetch` (no timeout); list operations keep the 10s timeout
- **v5.37.2** (2026-06-29) - Full code-review security fixes (traps.md #142-#147): setup page mDNS XSS (H1, added escHtml escaping); dialog.js fetch timeout normalization missed (M1, AbortController); three AI Lab endpoints in server.js used bare fetch without timeouts (M2, fetchWithTimeout); webui.html file list double-escaping failure XSS (M3, data-path + dataset); ailab.js/gcvt.js escape functions missing single quotes (M4, added &#39;); extruder_map_table GET query had no size limit (M5, 4096 bytes + Array validation); printer settings popup curHost/curPort not escaped (L1)
- **v5.37.1** (2026-06-29) - Fixed G-code conversion EXECUTABLE_BLOCK range error (traps.md #141): `EXECUTABLE_BLOCK_END` moved from the startup code to after `PRINT_END`, wrapping the entire print process, consistent with OrcaSlicer's native format; added unit tests to verify
- **v5.37.0** (2026-06-29) - Phase 4 unit tests + fetch timeout normalization + code organization: 1) created the `test/` directory + `node:test` framework; 28 tests covering 5 patchGcodeContent operations + convertGcodeContent format detection/conversion; extracted the pure functions `patchGcodeContent`/`convertGcodeContent` (no file I/O) for testability; 2) added the `fetchWithTimeout` helper using the standard AbortController to replace node-fetch v2's non-standard `timeout` option; all 8 fetch call sites replaced; 3) extracted patchGcodeLayout from handleUploadWithConfirm into a top-level function
- **v5.36.1** (2026-06-29) - Fixed AI Q&A streaming empty response (traps.md #138): backend `printQAStream` streaming read changed from `resp.body.getReader()` to `for await` async iterator (node-fetch v2 compatible); frontend done branch checks `pd.error` to display the error message instead of "empty response"; qa_stream_start removed the redundant query parameter
- **v5.36.0** (2026-06-29) - Phase 3 shared AI invocation module extraction + PowerShell script refactor: 1) extracted `bridge-node/aiClient.js` (AiClient class + AI_PROVIDERS + extractErrorMessage); the three slice_agent.js functions (testAiConnection/optimizeGcode/printQAStream) refactored, eliminating ~50 lines of duplication + unified error handling (fixed lost cause chains); 2) ailab.js optimize_gcode removed 4 redundant query parameters, eliminating the apiKey GET URL leak risk; 3) extracted the `install-common.psm1` module (14 shared functions, 558 lines): install.ps1 508→199 / reinstall.ps1 524→228 / uninstall.ps1 236→157; parameterized design; `exit 1` → `throw` + caller-side try/catch; unified regex fallback enablement
- **v5.35.0** (2026-06-29) - Phase 2 dead code cleanup + frontend XSS fixes: deleted 22 dead functions from slice_agent.js (-1448 lines/-47.2%) + 10 dead endpoints from server.js; fixed 10 XSS issues (ailab.js code block reverse decoding / webui.html filename and filament type not escaped / gcvt.js error message temperature values not escaped)
- **v5.34.0** (2026-06-29) - Phase 1 security hardening + resource leak fixes (11 items): JSONP cb injection / open_external command injection / upload temp file leak / listGcodeFiles full read / add_retract timing / extractGcodeStats G92 E0 miscount / printQAStream leak / loadJS DOM leak / ws.onmessage exception guard / dialog Linux crash / reinstall watchdog file lock
- **v5.33.0** (2026-06-27) - WebUI top bar added a printer settings popup (gear icon) to manually edit IP/Port/API Key
- **v5.32.1** (2026-06-27) - Fixed npm install failure on Node.js v26 (`Get-Command` returning `npm.ps1` caused a syntax error)
- **v5.32.0** (2026-06-27) - AI print assistant streaming output + Thinking mode support (auto-detects reasoning_content, collapses to show the thinking process)
- **v5.31.4** (2026-06-21) - Fixed local model API Key check wrongly blocking
- **v5.31.3** (2026-06-21) - Fixed connection failure after LMStudio model upgrade (auto model discovery)
- **v5.31.2** (2026-06-18) - Fixed start-hidden.vbs parentheses path syntax error (800A03EA)
- **v5.31.1** (2026-06-17) - Code review fixes: version number consistency + skills document naming unification
- **v5.31.0** (2026-06-15) - G-code conversion separated into its own sidebar tab (split from AI Lab)
- **v5.30.0** (2026-06-10) - Bridge watchdog (auto-restart on crash) + uncaughtException guard
- **v5.29.3** (2026-06-10) - G-code conversion EXEC block improvements (temperature/priming process/format detection fixes)
- **v5.29.0** (2026-06-10) - G-code conversion feature (BambuStudio→OrcaSlicer compatible) + upload field name fix
- **v5.28.3** (2026-06-10) - Fixed replace_speed speed unit conversion (mm/s→mm/min)
- **v5.28.2** (2026-06-10) - Fixed printer download + explorer error + log is not defined
- **v5.28.1** (2026-06-10) - Printer gcode download progress bar
- **v5.28.0** (2026-06-10) - G-code comparison preview LCS Diff algorithm + optimization report MD + patchGcode fix
- **v5.27.0** (2026-06-08) - AI Lab split into standalone files (ailab.css+ailab.js) + G-code Word-style comparison preview
- **v5.26.0** (2026-06-08) - Print assistant globalized + G-code comparison preview
- **v5.25.0** (2026-06-08) - AI Lab focused on G-code optimization (removed AI slicing/advanced slicing)
- **v5.24.0** (2026-06-08) - AI Lab feature completion (optimized upload, Q&A rendering enhancements)
- **v5.23.0** (2026-06-08) - AI Lab three feature directions (G-code optimization/print Q&A/advanced slicing)
- **v5.22.0** (2026-06-08) - G-code quality aligned with OrcaSlicer
- **v5.21.0** (2026-06-08) - Workspace Markdown system
- **v5.20.0** (2026-06-08) - AI Lab module
- **v5.19.0** (2026-06-03) - Fixed filament info being overwritten by gcode
- **v5.18.1** (2026-05-30) - Print layer progress + protect user-defined presets
- **v5.18.0** (2026-05-30) - CIEDE2000 color matching + OrcaSlicer reverse analysis
- **v5.16.1** (2026-05-27) - Fixed severe filament mapping not taking effect bug
- **v5.16.0** (2026-05-27) - External link jump fix
- **v5.15.0** (2026-05-27) - Filament color similarity matching + GitHub version update detection
- **v5.14.0** (2026-05-27) - Filament matching core type extraction + custom dropdown + About page
- **v5.13.0** (2026-05-27) - Filament mapping algorithm fix + dropdown selector
- **v5.12.1** (2026-05-27) - Print confirm dialog redesign (3 sections)
- **v5.12.0** (2026-05-27) - WebUI comprehensive optimization + filament matching
- **v5.11.0** (2026-05-27) - Control panel UI optimization + device status display
- **v5.10.1** (2026-05-27) - Fixed fan control parameter range
- **v5.10.0** (2026-05-27) - Aligned with OrcaSlicer native experience
- **v5.9.0** (2026-05-27) - Fixed camera parameters + temperature polling
- **v5.8.3** (2026-05-27) - Fixed bed leveling parameter names
- **v5.8.0** (2026-05-27) - Fixed JSON-RPC method names + camera server-side monitoring
- **v5.7.3** (2026-05-26) - Install script enhancements + WebUI offline detection
- **v5.7.0** (2026-05-25) - Chinese/English switching + flow calibration + Speed 5 levels
- **v5.5.0** (2026-05-25) - WebUI fully switched from fetch to JSONP
- **v5.0** (2026-05-24) - Node.js Bridge rewrite
- **v3.0** (2026-05-14) - Full-brand filament library
- **v1.0** (2026-05-13) - Initial version

---

## License

This project is released under the [GNU Affero General Public License v3.0](LICENSE).

The configuration files in this project originate from the following open-source projects:
- **OrcaSlicer** — AGPL-3.0 — https://github.com/SoftFever/OrcaSlicer
- **BambuStudio** — AGPL-3.0 — https://github.com/bambulab/BambuStudio

The LAN direct-connection feature is based on Moonraker's OctoPrint API compatibility layer:
- **Moonraker** — GPL-3.0 — https://github.com/Arksine/moonraker
- **Klipper** — GPL-3.0 — https://github.com/Klipper3d/klipper
