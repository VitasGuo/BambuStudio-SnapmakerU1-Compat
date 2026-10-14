# BambuStudio Third-Party Printer Compatibility Pitfalls Log

> Numbered entries, three-part format: Symptom → Root Cause → Solution. Separated by `---`.
> Status: ✅ Resolved / ⚠️ Partially resolved / ❌ Unresolved

---

## Index (by Category)

> Total: 151 entries — ✅ Resolved 147 | ⚠️ Partially resolved 2 (#16/#25) | ❌ Unresolved 1 (#103 inherent limitation)

### BambuStudio Configuration System
#1 Cross-vendor inheritance unsupported | #2 filament_list load order | #3 PowerShell JSON format errors | #4 AppConfig filaments cache | #5 compatible_printers_condition | #6 Vendor matching check | #7 Removing the models section | #8 Copy-Item nesting | #9 user/default leftovers | #10 conf write timing | #11 Missing filament_vendor | #20 Only looking at @U1 isn't enough | #21 Orca GitHub out of date

### G-code & Printing Flow
#12 Temperature too low at color change stops print | #13 auxiliary_fan=0 | #14 enable_pre_heating=0 | #15 preheat delta sign | #16 ooze_prevention conflicts with wipe tower | #22 retract_length_toolchange | #23 Support PLA-PETG wrong inheritance | #24 required_nozzle_HRC | #55 G-code boolean parameter format | #103 Device panel can't recognize BambuStudio gcode | #105 Layer progress not displayed | #116 Format detection misjudges OrcaSlicer | #141 EXECUTABLE_BLOCK_END in wrong position

### Filament Parameters
#17 Cross-material base parameters missing | #18 Snapmaker base filaments missing overrides | #19 filament_type missing

### Bed Model & 3D Display
#26 bed_model/bed_texture empty | #27 SVG doesn't render | #41 STL not centered | #50 Bed model height

### Bridge Proxy & Communication
#28 WebView doesn't inject API Key | #29 Network plugin signature verification | #30 /moonraker/ prefix doesn't work | #31 /ws path wrong | #62 Express 5 {*path} array | #63 /access/token interception | #64 Bed temperature not displayed | #70 Middleware order | #71 Only content-type forwarded | #72 Fluidd SPA 404 | #73 WS missing error handling | #94 Temperature doesn't auto-update | #122 JSONP cb injection | #123 open_external command injection | #124 Upload temp file leak | #130 ws.onmessage no exception protection | #139 node-fetch timeout non-standard | #142 setup page mDNS XSS | #143 dialog.js fetch timeout missed | #144 Three AI Lab endpoints use bare fetch without timeout

### Print Confirmation Flow
#47 print_stats initial query missing | #48 Slicing doesn't trigger confirmation | #49 confirm_print parameter parsing | #51 start_local_print doesn't support HTTP | #52 WebUI notification lost when not loaded | #53 gcode/script HTTP unavailable | #54 No safety checks | #56 print_host overwritten | #57 gcode() uses non-existent HTTP | #58 User preset overrides print_host | #59 python-multipart missing | #61 Dialog UX | #89 Boolean regression | #91 JSON-RPC method name wrong | #92 Bed leveling parameter name (BED_LEVEL) | #96 Filament matching missing | #97 bridgePOST array parameters | #101 MAP_TABLE doesn't update reprint_info | #102 SET_PRINT_USED_EXTRUDERS parameter format | #106 Filament info overwritten by gcode | #150 Dialog missing format indicator | #164 Filament mapping slots hardcoded to 4

### Camera (Critical)
#37 webcams/list returns empty | #39 MJPEG stream proxy doesn't work | #46 U1 uses snapshot polling | #65 Proxy corrupts binary JPEG | #67 Express ETag caching | #85 camera.start_monitor must go through WS | #90 Camera monitoring needs server-side trigger | #93 Camera parameters missing (domain)

### WebUI Frontend
#34 Flutter Web DOM unreadable | #38 SET_LED missing WHITE | #40 filament_feed has no type | #66 WS race condition | #78 Fluidd SW intercepts fetch | #79 WebView blocks fetch/XHR | #82 event.stopPropagation | #83 gcode() doesn't return value | #84 EXTRUDER vs INDEX | #95 Fan control parameter range | #99 Filament type brand prefix | #100 WebView external link interception | #104 Color matching accuracy insufficient | #129 loadJS script tag leak | #134 webui.html XSS filenames/filament types not escaped | #145 File list double-escaping XSS | #146 Escape function missing single quote

### AI Lab (G-code optimization + print assistant)
#125 listGcodeFiles reads whole files | #126 add_retract timing wrong | #127 extractGcodeStats G92 E0 miscount | #128 printQAStream qaStreams leak | #132 slice_agent.js 1448 lines of dead code | #133 server.js 10 dead endpoints | #135 ailab.js/gcvt.js XSS | #136 Duplicate AI calls + inconsistent error handling | #137 ailab.js apiKey passed via GET leaks | #138 printQAStream getReader incompatibility causes empty responses | #140 Pure function extraction (testability) | #149 ailab/gcvt i18n bilingualization

### Installation & Deployment
#32 System has no Python | #33 Fluidd hosted mode | #35 CWD points to deleted directory | #36 curl download fails | #42 Bridge depends on original directory | #43 Program Files permissions | #44 Manual startup needed | #45 VBS permissions | #60 Python embedded limitations | #68 formidable constructor | #69 bridge/web not copied | #74 undici not declared | #75 node-fetch incompatible with undici | #76 undici doesn't export Blob | #77 Old process not restarted | #80 mDNS port wrong | #81 VBS bare node command | #121 dialog Linux execFileSync not imported | #131 reinstall watchdog file lock conflict

### BambuStudio Inherent Limits
#25 ooze_prevention conflicts with wipe tower (source limitation)

---

#1 ✅
**Symptom**: Snapmaker vendor filament file `inherits: "fdm_filament_pla"` (BBL base), load fails with "Can not find inherits"
**Root Cause**: `load_vendor_configs_from_json` (PresetBundle.cpp:4736-4751) — its `config_maps` only contains the current vendor, so cross-vendor lookup always fails
**Solution**: Create a complete base config file in each vendor directory; filaments only inherit from a base within the same vendor

---

#2 ✅
**Symptom**: `Bambu PLA Basic @U1.json` loads before `fdm_filament_pla.json`, error "Can not find inherits: fdm_filament_pla"
**Root Cause**: BambuStudio loads files one by one in the order of the `filament_list` array; if the inherits target of a child file hasn't been loaded yet, it fails
**Solution**: Sort `filament_list` by dependency topology — base first, derived after

---

#3 ✅
**Symptom**: Batch-generated filament JSONs have trailing commas, newlines breaking the JSON, and missing setting_id
**Root Cause**: PowerShell `ConvertTo-Json` mishandles newlines and can't control trailing commas
**Solution**: Use StringBuilder to build the JSON manually

---

#4 ✅
**Symptom**: All 80 filament files load correctly, but only 2 usable filaments are shown
**Root Cause**: The `filaments` array in `BambuStudio.conf` controls visibility. As long as there is 1 compatible filament in the cache, `add_default_materials = false`, and the rest aren't added
**Solution**: The install script cleans all `@U1` entries from the `filaments` array in a JSON-aware way

---

#5 ✅
**Symptom**: Filaments with `compatible_printers_condition: "printer_model == 'Snapmaker U1'"` all show "not supported"
**Root Cause**: PlaceholderParser may evaluate the condition expression incorrectly
**Solution**: Use the list format `compatible_printers: ["Snapmaker U1 (0.4 nozzle)"]` instead

---

#6 ✅
**Symptom**: BBL vendor filaments show "not supported" even when compatible_printers contains the correct printer name
**Root Cause**: The first line of `is_compatible_with_printer` (Preset.cpp:731-733) checks `preset.vendor != active_printer.vendor` and returns false directly
**Solution**: Put all @U1 filaments under the Snapmaker vendor directory

---

#7 ✅
**Symptom**: The install script removing the models section requires two restarts
**Root Cause**: `load_installed_filaments` only processes printers with is_visible; removing models → printer invisible → default filaments not added
**Solution**: Keep the Snapmaker U1 entry in the models section; only clean the filaments cache

---

#8 ✅
**Symptom**: `Copy-Item -Recurse` creates nested new directories when copying into an existing directory
**Root Cause**: When the destination directory already exists, PowerShell `Copy-Item` copies the source in as a subdirectory
**Solution**: Run `Remove-Item -Recurse -Force` to delete the destination directory before copying

---

#9 ✅
**Symptom**: After uninstall and reinstall, old Snapmaker user preset copies still show up
**Root Cause**: The copies in `%APPDATA%\BambuStudioBeta\user\default` are not cleaned up together with the system directory
**Solution**: install/reinstall/uninstall scripts only clean the system cache (`system\Snapmaker`) and do not delete files in the user directory, protecting user-customized filament presets

---

#10 ✅
**Symptom**: The install script's modifications to BambuStudio.conf get overwritten
**Root Cause**: On exit, BambuStudio writes the current config back to conf, overwriting external modifications
**Solution**: At the start of install/uninstall scripts, check whether the BambuStudio process is running; refuse to run if it is

---

#11 ✅
**Symptom**: Bambu PPA-CF, Generic PLA, etc. get classified under the Snapmaker brand
**Root Cause**: When `filament_vendor` is missing, the vendor directory name (Snapmaker) is used by default
**Solution**: Add `filament_vendor: ["Bambu Lab"]` / `["Generic"]` / `["Snapmaker"]` to all @U1 files

---

#12 ✅
**Symptom**: During multicolor printing, the first tool change reports "temperature too low" and stops immediately
**Root Cause**: `change_filament_gcode` is empty, so BambuStudio only sends `T{n}` without waiting for temperature, while the start gcode sets inactive toolheads to 0°C
**Solution**: Fill in `change_filament_gcode` (M109 heat-and-wait + T switch + SM_PRINT_PREEXTRUDE_FILAMENT), set `standby_temperature_delta: -150`, `filament_preheat_temperature_delta: -50`

---

#13 ✅
**Symptom**: No `M106 P2` (part cooling fan) command in the G-code
**Root Cause**: `auxiliary_fan: "0"` disables the entire part cooling fan system
**Solution**: Change `auxiliary_fan` from `"0"` to `"1"`

---

#14 ✅
**Symptom**: No preheating command before color change
**Root Cause**: `fdm_machine_common.json` is missing `enable_pre_heating: "1"`
**Solution**: Add `enable_pre_heating: "1"` to activate PreCoolingInjector

---

#15 ✅
**Symptom**: Setting `filament_preheat_temperature_delta` to `"-50"` results in preheat temperature = 220-(-50)=270°C
**Root Cause**: PreCoolingInjector computes `nozzle_temp - delta`; a negative value causes overheating
**Solution**: Change from `["-50"]` to `["50"]`

---

#16 ⚠️ BambuStudio Inherent Limit
**Symptom**: With `ooze_prevention` enabled, error "When the wipe tower is enabled, oozing prevention is currently not supported"
**Root Cause**: BambuStudio `Print.cpp:1416-1417` hard-blocks enabling both at the same time (the original PrusaSlicer allows it)
**Solution**: Don't set `ooze_prevention`; accept that idle toolheads stay hot. WipeTower re-heats idle toolheads (`M104 Tn Sxxx N0`), and `standby_temperature_delta` has no effect when `ooze_prevention=0`

---

#17 ✅
**Symptom**: PPA-CF inherits `fdm_filament_abs` (240°C), but actually needs 290°C
**Root Cause**: The project has no `fdm_filament_ppa` base class
**Solution**: Explicitly override all parameters in the concrete @U1 file that differ from the base class

---

#18 ✅
**Symptom**: 4 Snapmaker "plain" filaments are missing PA parameters and bed temperature overrides
**Root Cause**: The v2.0 minimal config only set flow_ratio and max_volumetric_speed
**Solution**: Complete `enable_pressure_advance`, `pressure_advance`, and bed temperature

---

#19 ✅
**Symptom**: Generic PE/PP/PCTG show as PETG type
**Root Cause**: The inherited base class doesn't override `filament_type`
**Solution**: Explicitly set the correct `filament_type`

---

#20 ✅
**Symptom**: Comparing @U1 file parameters looks consistent, but the actual G-code differs greatly
**Root Cause**: @U1 files only contain overrides; many parameters are inherited from the base class
**Solution**: Parse the full inheritance chain before comparing effective parameter values

---

#21 ✅
**Symptom**: Orca GitHub repo parameters differ greatly from the official installed version
**Root Cause**: The GitHub repo may not be the latest version
**Solution**: Use the official installed version's parameters as the source of truth

---

#22 ✅
**Symptom**: Severe oozing during color change
**Root Cause**: `retract_length_toolchange` is set to 2mm, but the U1 official value is 10mm
**Solution**: Change from 2 to 10

---

#23 ✅
**Symptom**: Bambu Support For PLA-PETG @U1 has bed 80°C, PA 0.04
**Root Cause**: It inherits `fdm_filament_pet`; it should inherit `fdm_filament_pla`
**Solution**: Change `inherits` from `fdm_filament_pet` to `fdm_filament_pla`

---

#24 ✅
**Symptom**: CF/GF materials show "requires nozzle HRC 55 or above"
**Root Cause**: `required_nozzle_HRC: ["55"]` is the BBL hardened-steel nozzle standard; the U1 nozzle HRC 40 is sufficient
**Solution**: In the U1 compatibility pack, change CF/GF materials from 55 to 40

---

#25 ⚠️ Same as #16 (ooze_prevention conflicts with wipe tower)

---

#26 ✅
**Symptom**: The bed shows the default rectangular shape
**Root Cause**: In `Snapmaker U1.json`, `bed_model: ""` and `bed_texture: ""` are empty
**Solution**: Fill in `"bed_model": "Snapmaker U1_bed_texture.stl"` and `"bed_texture": "Snapmaker U1_texture.svg"`

---

#27 ✅
**Symptom**: After configuring `bed_texture` pointing to an SVG, the bed still doesn't show the logo
**Root Cause**: In BambuStudio `3DBed.cpp`, `render_texture()` is entirely commented out — the SVG texture loading and rendering code is all disabled
**Solution**: Embed the logo as a 3D relief geometry in `Snapmaker U1_bed_texture.stl`. For color, the source code must be modified to restore `render_texture`

---

#28 ✅
**Symptom**: Fluidd shows "unauthorized"
**Root Cause**: BambuStudio `PrinterWebView` doesn't auto-inject the API Key
**Solution**: The bridge server HTTP proxy auto-injects the `X-API-Key` request header

---

#29 ✅
**Symptom**: Can't inject a custom DLL plugin
**Root Cause**: `NetworkAgent.cpp:212-213` uses `IsSamePublisher()` to verify digital signatures
**Solution**: Don't use DLL plugins; use the `print_host_webui` config field instead

---

#30 ✅
**Symptom**: Fluidd doesn't work
**Root Cause**: The `/moonraker/{path}` prefixed proxy; Fluidd request paths don't include the prefix
**Solution**: v0.2.0 refactored to proxy Moonraker API paths directly

---

#31 ✅
**Symptom**: Fluidd WebSocket connection fails
**Root Cause**: The Moonraker WS path is `/websocket`, not `/ws`
**Solution**: Change the WS proxy path to `/websocket`

---

#32 ✅
**Symptom**: The system has no Python
**Root Cause**: The user's system doesn't have Python installed
**Solution**: Use the Python embedded distribution (later switched to a Node.js Bridge)

---

#33 ✅
**Symptom**: Fluidd shows the connection settings page
**Root Cause**: `hosted: false` in `config.json`
**Solution**: Bridge patches `config.json` at startup, setting `hosted: true`

---

#34 ✅
**Symptom**: Can't parse the DOM of the Flutter Web UI samples
**Root Cause**: Flutter Web release mode doesn't enable the semantics tree
**Solution**: Reverse-engineer `main.dart.js` + user descriptions to confirm the 4-module 2x2 grid layout

---

#35 ✅
**Symptom**: The embedded Python command returns exit code 1 with no output
**Root Cause**: The terminal CWD points to a deleted old directory
**Solution**: Run the command in a new terminal

---

#36 ✅
**Symptom**: `curl` / `Invoke-WebRequest` fails to download `get-pip.py`
**Root Cause**: Error messages are swallowed on Windows
**Solution**: Download with Python `urllib.request.urlretrieve()`

---

#37 ✅
**Symptom**: `/server/webcams/list` returns an empty array
**Root Cause**: The U1 `moonraker.conf` has no `[webcam]` config section
**Solution**: Fall back to `/webcam/?action=stream` (later changed to snapshot polling, see #46)

---

#38 ✅
**Symptom**: Turning the light on doesn't work (turning off works)
**Root Cause**: The U1 `cavity_led` has 4 channels [R,G,B,WHITE]; `SET_LED` is missing `WHITE=1`
**Solution**: `SET_LED LED=cavity_led RED=1 GREEN=1 BLUE=1 WHITE=1`

---

#39 ✅
**Symptom**: Clicking start on the Camera doesn't show the video stream
**Root Cause**: The MJPEG stream is a long-lived connection; `httpx.AsyncClient.get()` can't forward it as a stream
**Solution**: v4.1 changed to snapshot polling (see #46)

---

#40 ✅
**Symptom**: The Filament module can't sync filament type/color
**Root Cause**: `filament_feed` only has physical state; the type info is in `snapmaker/print_task.json`
**Solution**: Get it via `/server/files/config/snapmaker/print_task.json`

---

#41 ✅
**Symptom**: The bed 3D model is offset to the top-right
**Root Cause**: `update_model_offset()` moves the STL (0,0,0) to the printable_area center (135,135)
**Solution**: Model the STL with the center as the origin

---

#42 ✅
**Symptom**: After installing the Bridge, it depends on the compatibility pack's original directory
**Root Cause**: The Bridge runs from the compatibility pack directory
**Solution**: install.ps1 copies bridge/ to the BambuStudio installation directory

---

#43 ✅
**Symptom**: After installing the Bridge to Program Files, config can't be written
**Root Cause**: `bridge_config.json` under Program Files requires administrator privileges
**Solution**: Change the config path to `%APPDATA%\BambuStudio-Bridge\bridge_config.json`

---

#44 ✅
**Symptom**: The Bridge needs to be started manually
**Root Cause**: No auto-start mechanism
**Solution**: VBS hidden launcher + Windows Startup shortcut

---

#45 ✅
**Symptom**: Creating `start-hidden.vbs` reports "Access to the path is denied"
**Root Cause**: The VBS is placed under Program Files without write permission
**Solution**: Put the VBS at `%APPDATA%\BambuStudio-Bridge\start-hidden.vbs`

---

#46 ✅ Camera Core Discovery
**Symptom**: `/webcam/?action=stream` returns 502 Bad Gateway
**Root Cause**: The U1 doesn't use the MJPEG stream approach. The camera works by polling a single JPEG at `/server/files/camera/monitor.jpg`; both the Snapmaker App and OrcaSlicer use this method. The mjpegstreamer service isn't running
**Solution**: `pollCam()` requests `/server/files/camera/monitor.jpg?_t=TIMESTAMP` every 1s. At startup, an IIFE probes URL availability to set `camAvail`

---

#47 ✅
**Symptom**: The Print Job button always shows Start, never Pause/Stop
**Root Cause**: The initial query is missing `print_stats`/`display_status`; WS subscription responses `{result:{status:...}}` are ignored
**Solution**: Add print_stats/display_status to the query URL; handle `m.result.status` in `onmessage`

---

#48 ✅
**Symptom**: Clicking print after slicing starts immediately without a confirmation dialog
**Root Cause**: The Bridge forwards the multipart body containing `print=true` directly, and Moonraker starts the print immediately
**Solution**: Parse the multipart to extract the file and print fields; use the Moonraker native upload API to upload only, without starting

---

#49 ✅
**Symptom**: Print options never take effect
**Root Cause**: FastAPI treats `options: dict = None` as a query parameter and doesn't read it from the request body
**Solution**: Change to `request: Request` + `await request.json()`

---

#50 ✅
**Symptom**: Thin models overlap the bed model
**Root Cause**: `Snapmaker U1_bed_texture.stl` has a Z range of 0~0.510; after the offset, the top is still above the print plane
**Solution**: Shift all STL Z coordinates down so the top aligns with Z=0

---

#51 ✅
**Symptom**: The printer doesn't react after clicking Start Print
**Root Cause**: `/server/files/start_local_print` is registered with `transports=(...&~HTTP)` excluding HTTP
**Solution**: Use `/printer/gcode/script` to send `SDCARD_PRINT_FILE_WITH_PARAMETERS`

---

#52 ✅
**Symptom**: Print after slicing doesn't trigger the confirmation dialog
**Root Cause**: When the WebUI isn't loaded, nobody receives the WS notification
**Solution**: After WS `onopen`, check `/api/bridge/pending_print`

---

#53 ✅
**Symptom**: Clicking Start Print reports "gcode failed"
**Root Cause**: `/printer/gcode/script` isn't registered as an HTTP endpoint; it only supports WS JSON-RPC
**Solution**: WebUI and Bridge use WebSocket JSON-RPC to send G-code

---

#54 ✅
**Symptom**: Print can be started while filament is loading / the hotend is moving
**Root Cause**: `doPrint()` has no state check
**Solution**: Add a `print_stats.state` check

---

#55 ✅
**Symptom**: `SDCARD_PRINT_FILE_WITH_PARAMETERS` reports "unable to parse True/False"
**Root Cause**: The Klipper macro parser only accepts numeric 1/0, not the strings "True"/"False"
**Solution**: `AUTO_BED_LEVELING=1` (numeric, no quotes)

---

#56 ✅
**Symptom**: Print after slicing doesn't trigger the confirmation dialog (even with print_host set to the Bridge)
**Root Cause**: The user's custom machine config `print_host: "192.168.1.12"` overrides the system config
**Solution**: The reinstall script auto-patches print_host in the user config

---

#57 ✅
**Symptom**: All G-code control commands have no effect
**Root Cause**: `gcode()` calls a non-existent endpoint via HTTP POST
**Solution**: Prefer WebSocket JSON-RPC

---

#58 ✅ (merged with #56)

---

#59 ✅
**Symptom**: Upload reports `The 'python-multipart' library must be installed`
**Root Cause**: The Python Bridge `requirements.txt` is missing `python-multipart`
**Solution**: Add the dependency (later fully resolved by migrating to the Node.js Bridge)

---

#60 ✅
**Symptom**: The Python embedded package lacks tkinter, has pip permission issues, and installs dependencies into the user directory
**Root Cause**: The Python embedded package is designed as a minimal runtime
**Solution**: Refactor the Bridge from Python to Node.js

---

#61 ✅
**Symptom**: After slicing, you must manually switch to the Device tab to see the confirmation dialog
**Root Cause**: BambuStudio has no filament selection dialog
**Solution**: The Bridge pops up a native Windows dialog (PowerShell + WinForms)

---

#62 ✅
**Symptom**: All proxy requests return 500
**Root Cause**: Express 5 `{*path}` returns an array instead of a string; `.startsWith()` throws TypeError
**Solution**: Add the `wcPath(req)` helper function to handle both arrays and strings

---

#63 ✅
**Symptom**: Fluidd stays "Connecting"
**Root Cause**: `/access/token` returns 404; `config.json` endpoints is empty
**Solution**: The Bridge intercepts `/access/token` and returns an empty token; add `endpoints: [{url: "/"}]` to config.json

---

#64 ✅
**Symptom**: Bed temperature is not displayed
**Root Cause**: The initial query URL is missing `heater_bed`
**Solution**: Add `&heater_bed`

---

#65 ✅ Camera Critical Fix
**Symptom**: Camera image fails to load, `camAvail=false`
**Root Cause**: `proxyToMoonraker` reads the response with `r.text()`, and UTF-8 decoding corrupts the JPEG binary data
**Solution**: Read the binary response body with `Buffer.from(await r.arrayBuffer())`

---

#66 ✅
**Symptom**: Fluidd stays "Connecting" (even with token interception configured)
**Root Cause**: WS proxy race condition — client messages are dropped before the Moonraker WS connection is established
**Solution**: Register `ws.on("message")` immediately; add a `pendingMsgs` queue to buffer

---

#67 ✅ Camera Cache Fix
**Symptom**: The camera image proxy returns a valid JPEG but it doesn't refresh
**Root Cause**: Express auto-generates an ETag header, and the WebView uses ETag for cache decisions. `res.removeHeader("ETag")` runs before `res.send()`, but `send()` adds the ETag again internally
**Solution**: Disable ETag at the app level with `app.set("etag", false)` + `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache`

---

#68 ✅
**Symptom**: Upload reports `formidable.IncomingForm is not a constructor`
**Root Cause**: `const { formidable } = require("formidable")` destructured import; v3 exports `IncomingForm` directly
**Solution**: Import directly with `const formidable = require("formidable")`

---

#69 ✅
**Symptom**: After reinstall, both WebUI and Fluidd don't work
**Root Cause**: install.ps1 only copies `bridge-node`, not `bridge/web`
**Solution**: Add a step to copy `bridge/web` to `$bridgeDst\web`

---

#70 ✅
**Symptom**: The uploaded G-code `req.body` is empty
**Root Cause**: `express.json()` is registered before `express.raw()` and consumes the request body
**Solution**: Move `express.raw()` before `express.json()`

---

#71 ✅
**Symptom**: Fluidd connecting through the proxy hangs at "Connecting"
**Root Cause**: `proxyToMoonraker` only forwards the `content-type` response header, losing key headers
**Solution**: Forward all response headers (only excluding `transfer-encoding`, `connection`)

---

#72 ✅
**Symptom**: Fluidd subpaths return 404
**Root Cause**: Vue SPA history mode; the server must return `index.html` for all subpaths
**Solution**: Add the `app.get("/fluidd/{*path}", ...)` SPA fallback route

---

#73 ✅
**Symptom**: After Moonraker restarts, the Bridge WS client connection isn't released
**Root Cause**: Missing `moonrakerWs.on("error")` handling
**Solution**: Add an error handler to close the client WS

---

#74 ✅
**Symptom**: Upload reports `Cannot find package 'undici'`
**Root Cause**: `package.json` doesn't declare the `undici` dependency
**Solution**: Switch to the `form-data` package instead of undici (see #76)

---

#75 ✅
**Symptom**: Upload reports `Content-Type is not multipart/form-data`
**Root Cause**: `node-fetch` v2 is incompatible with `undici.FormData`
**Solution**: Switch to the `form-data` package

---

#76 ✅
**Symptom**: `undici.Blob is not a constructor`
**Root Cause**: undici v6 doesn't export Blob
**Solution**: Abandon undici entirely and use the `form-data` package

---

#77 ✅
**Symptom**: After reinstall, the old code is still running
**Root Cause**: The node process started by VBS has an empty CommandLine; the reinstall process lookup can't match it
**Solution**: Look up the process by port with `Get-NetTCPConnection -LocalPort 13628`

---

#78 ✅
**Symptom**: WebUI data isn't displayed; Camera works
**Root Cause**: The Fluidd Service Worker intercepts fetch requests (SW can intercept fetch but can't intercept Image loading)
**Solution**: The Bridge intercepts `/fluidd/sw.js` and returns an auto-unregister script, and intercepts the manifest returning 404

---

#79 ✅ WebView Core Discovery
**Symptom**: The WebUI works in a browser, but all fetch/XHR fail inside the BambuStudio WebView
**Root Cause**: BambuStudio `PrinterWebView` (wxWebView/WebKit) blocks `fetch()` and `XMLHttpRequest`, but allows native `<script>` and `<img>` loading
**Solution**: JSONP-style bridging — `bridgeGET()`/`bridgePOST()` load via `<script>` tags; Camera uses `new Image()`

---

#80 ✅
**Symptom**: After reinstall, the WebUI shows reconnecting and WS keeps ECONNRESET
**Root Cause**: The mDNS `_snapmaker._tcp.local.` `service.port` is 1884 (MQTT), not 80 (HTTP)
**Solution**: `autoDetectPrinter()` hardcodes `printerConfig.port = 80`

---

#81 ✅
**Symptom**: The Bridge doesn't run after rebooting the computer
**Root Cause**: The VBS uses a bare `node` command; at login time PATH isn't loaded yet
**Solution**: Use the full `node.exe` path in the VBS

---

#82 ✅
**Symptom**: Clicking the Flow Cal button has no response
**Root Cause**: `event.stopPropagation()` in the wxWebView inline onclick — `event` is undefined
**Solution**: Change to `calibrateFlow(0);return false;`

---

#83 ✅
**Symptom**: Flow Cal button still has no response (after fixing #82)
**Root Cause**: The deployed directory runs an old version where `gcode()` doesn't return a value + `calibrateFlow()` has no visual feedback
**Solution**: `gcode()` returns a boolean + disconnected alert; `calibrateFlow()` button text changes to "Calibrating..."

---

#84 ✅
**Symptom**: Flow Cal G-code is sent successfully but the printer doesn't execute it
**Root Cause**: `SM_PRINT_FLOW_CALIBRATE INDEX=0` has a wrong parameter name; it should be `EXTRUDER=0`. Klipper silently ignores unknown parameters
**Solution**: `INDEX=` → `EXTRUDER=`

---

#85 ✅ Camera RPC Mechanism
**Symptom**: The camera photo doesn't update, always showing the same old photo
**Root Cause**: The U1's `camera.start_monitor` / `camera.stop_monitor` endpoints (repeater.py:75-84) are registered with `transports=(TransportType.all() & ~TransportType.HTTP)` — **only WebSocket/MQTT supported**. These endpoints forward via MQTT to the device-side camera service, triggering the `monitor.jpg` file update. Without calling `start_monitor`, the device doesn't update the snapshot file. The WebUI's `camRpc()` already sends via WS JSON-RPC, but it needs to be confirmed that the WS connection is healthy and the RPC method name is correct (`camera.start_monitor`, not `camera.start_monitor` with a `/` prefix)
**Solution**:
1. `camRpc()` sends `camera.start_monitor` / `camera.stop_monitor` via WS JSON-RPC (already implemented ✅)
2. Bridge proxy correctly handles binary JPEG (fixed in #65 ✅)
3. Bridge disables ETag + no-cache headers (fixed in #67 ✅)
4. `pollCam()` cache-busts with `_t=Date.now()` (already implemented ✅)
5. Getting `monitor.jpg` through the Bridge proxy works completely; no need to connect directly to the printer IP

---

## Camera Problem History Summary

The camera went through many rounds of iterative fixes; the core chain: `camera.start_monitor` (WS RPC) → device updates `monitor.jpg` → Bridge proxy (binary + no-cache) → WebUI `new Image()` polling

| Version | Problem | Fix |
|------|------|------|
| v3.19 | MJPEG stream proxy doesn't work (#39) | switch to direct printer IP |
| v4.1 | U1 doesn't support MJPEG (#46) | change to snapshot polling |
| v5.2.1 | Proxy corrupts binary JPEG (#65) | `arrayBuffer()` replaces `text()` |
| v5.2.2 | Express ETag caching (#67) | `app.set("etag",false)` + no-cache |
| v5.7.x | Photo still doesn't update (#85) | confirmed `camera.start_monitor` must go through WS; going through the Bridge proxy works |

**Current status**: getting the camera through the Bridge proxy is fully viable. If the photo doesn't update, troubleshooting order:
1. Is the WS connection healthy (`camRpc` depends on WS)
2. Is the `camera.start_monitor` RPC received by the device (check Moonraker logs)
3. Is the device updating `monitor.jpg` (directly access `http://<printer-IP>/server/files/camera/monitor.jpg` and compare)
4. Does the Bridge proxy return new data (check the proxy logs in Debug Logs)

---

#86 ✅
**Symptom**: The top bar doesn't show the printer IP
**Root Cause**: `bridgeGET('/api/bridge/config')` loads `/api/bridge/config.js` via JSONP, but the server only has `/api/bridge/config` (non-JSONP); the `.js` endpoint is missing
**Solution**: Add the `/api/bridge/config.js` JSONP endpoint

---

#87 ✅
**Symptom**: Print confirmation options (Auto Bed Leveling / Flow Calibration / Timelapse) have no effect
**Root Cause**: Previously the `SDCARD_PRINT_FILE_WITH_PARAMETERS` G-code was built manually; the parameter names may be incorrect (whether `auto_bed_leveling`/`flow_calibrate`/`time_lapse_camera` match the U1 Klipper macro definitions is unknown), and the `_fill_metadata` metadata is missing (klippy_apis.py:285-310 automatically appends line_width, layer_height and other parameters)
**Solution**: Use Moonraker's `start_local_print` JSON-RPC endpoint so Moonraker generates the complete G-code itself. `start_local_print` → `process_local_file` → `start_print_advanced` → automatic `_fill_metadata` + correct parameter format

---

#88 ✅
**Symptom**: After reinstall, the Bridge doesn't restart and the WebUI shows old code
**Root Cause**: In reinstall.ps1, `Get-Process -Name "node"` kills ALL node processes (including other applications'), possibly killing the wrong process or missing the Bridge process
**Solution**: Only look up the process by port with `Get-NetTCPConnection -LocalPort 13628`; no longer kill all node processes

---

#89 ✅ (#55 regression)
**Symptom**: After checking options in the print confirmation dialog, the Fluidd console reports `unable to parse True`, and the device reports error 0003-0529-0000-0001
**Root Cause**: In `confirm_print.js` and `start_print.js`, `req.query.auto_bed_leveling === "1"` returns the JavaScript boolean `true`; after JSON serialization, Moonraker's `start_print_advanced` converts it to `AUTO_BED_LEVELING="True"` in the G-code, which Klipper can't parse. Same root cause as #55; the switch to `server.files.start_local_print` changed the parameter passing and caused the regression
**Solution**: `=== "1"` (boolean) → `=== "1" ? 1 : 0` (integer), ensuring the JSON contains the numbers `1`/`0`

---

#90 ✅
**Symptom**: The camera photo doesn't update, always showing a photo that isn't the current state
**Root Cause**: `camera.start_monitor` must be sent to the device via WS/MQTT to trigger the `monitor.jpg` update (repeater.py L133-153). Previously the WebUI sent `camRpc('camera.start_monitor')` through the browser WS proxy, but forwarding that call through the Bridge WS proxy may be unstable. The `cam_snapshot` endpoint only fetches the image; it doesn't trigger the device-side update
**Solution**:
1. The `cam_snapshot` endpoint auto-calls `ensureCamMonitor()`, establishing an independent WS connection server-side via `callMoonrakerJsonRpc` to send `camera.start_monitor` (30-second throttle)
2. Add the `/api/bridge/cam_start_monitor.js` and `/api/bridge/cam_stop_monitor.js` JSONP endpoints
3. WebUI `toggleCam()` uses the server-side JSONP endpoints instead of the browser WS proxy `camRpc()`

---

#91 ✅
**Symptom**: After checking options in the print confirmation dialog, the dialog shows "Print failed: Method not found"
**Root Cause**: `callMoonrakerJsonRpc("start_local_print", ...)` has a wrong method name. The Moonraker endpoint registration path is `/server/files/start_local_print` (snapmakercloud.py L138-141); the JSON-RPC method name rule is the path without the leading `/` with `/` replaced by `.`, i.e. `server.files.start_local_print`
**Solution**: `"start_local_print"` → `"server.files.start_local_print"`

---

#92 ✅
**Symptom**: After checking Auto Bed Leveling in the print confirmation dialog, the Fluidd log shows the parameter is passed correctly as `AUTO_BED_LEVELING="1"`, but the device outputs `print_task_config configuration does not do auto-leveling` and bed leveling isn't executed. Flow Calibration and Timelapse work normally
**Root Cause**: The G-code parameter name is incorrect. In `klippy_apis.py` L333-335, `start_print_advanced` uppercases the options dict keys and concatenates them into G-code parameters. Confirmed from the Snapmaker u1-klipper open-source repo `print_task_config.py` L965: the G-code parameter name is `BED_LEVEL` (not `AUTO_BED_LEVELING`, and not `TASK_BED_LEVELING`). At L42 the internal field name `'auto_bed_leveling'` differs from the G-code parameter name `BED_LEVEL` — this is Snapmaker's naming inconsistency
**Solution**: Change the options key from `auto_bed_leveling`/`task_bed_leveling` → `bed_level` (v5.8.3); after `.upper()` in `klippy_apis.py` it generates `BED_LEVEL="1"`, matching `gcmd.get_int('BED_LEVEL')` in `print_task_config.py` L965. Verified ✅

---

#93 ✅
**Symptom**: The WebUI camera photo doesn't update; after clicking the camera button, monitor.jpg is always the same image
**Root Cause**: Missing parameters in `camera.start_monitor`. By reverse-engineering the OrcaSlicer Flutter Web (`main.dart.js` L131485-131487), OrcaSlicer passes `{ domain: "lan", interval: 0, expect_pw: true }`, while the Bridge only passes `{ req_id: reqId }`. `repeater.py`'s `_handle_camera_timelapse_request` forwards via MQTT to the device-side closed-source lmd process; without the `domain` parameter, lmd doesn't respond
**Solution**: Change `camera.start_monitor` parameters to `{ domain: "lan", interval: 0, expect_pw: true }` (v5.9.0), and `camera.stop_monitor` parameters to `{ domain: "lan" }`. Verified ✅

---

#94 ✅
**Symptom**: WebUI Control module temperature/fan/speed info doesn't auto-update; clicking the module refresh button does nothing; only the top-bar refresh (location.reload) updates
**Root Cause**: 1. `refreshCtrl()` is an empty function with no proactive query implemented; 2. the BambuStudio WebView environment may restrict WS `notify_status_update` pushes, so `upd()` isn't triggered
**Solution**: 1. Implement `refreshCtrl()` → call `queryStatus()` for proactive queries via `printer.objects.query`; 2. add a 2-second polling `setInterval(queryStatus, 2000)` as a fallback for WS pushes (v5.9.0). Verified ✅

---

#95 ✅
**Symptom**: Model Fan at 50% and 100% both give 100% fan speed; Cavity Fan at 100% only shows 1%. Speed multiplier works normally
**Root Cause**: After v5.10.0 switched to custom endpoints, the fan parameter ranges are wrong. 1. `main_fan`: passes `{speed: Math.round(pct*2.55)}` (0-255), but Klipper `_handle_control_main_fan` (fan.py L148-153) expects `S` in the range 0-100; values above 100 are clamped. 50%→128→clamped to 100%, 100%→255→clamped to 100%. 2. `generic_fan`: passes `{speed: pct/100}` (0-1 float), but Moonraker `klippy_apis.py` L233 uses `get_int('speed', 0)` to round, 1.0→1. Klipper `_handle_control_generic_fan` (fan_generic.py L25-30) does `1/100=0.01`, so 100% only shows 1%
**Solution**: In `setFan()`, both branches pass `pct` directly (0-100 integer percent), matching the 0-100 range of the `S` parameter on the Klipper side (v5.10.1)

---

#96 ✅
**Symptom**: The print confirmation dialog only shows the filament info on the device; it can't know what filament the gcode needs, nor auto-match physical slots
**Root Cause**: `showPrintDialog` only receives `print_task.json` data (device-side filaments); it doesn't fetch `filament_type`/`filament_used_mm`/`filament_colour` from the gcode metadata, so it can't build a gcode-slot → physical-slot mapping
**Solution**: 1. `onPendingPrint`/`printFile` first fetch gcode metadata via `bridgeGET('/server/files/metadata?filename=xxx')`; 2. `showPrintDialog(name, task, meta)` adds a meta parameter, parsing `filament_type` (may be a semicolon-separated string requiring split), `filament_used_mm`, `filament_colour`; 3. auto-match physical slots case-insensitively by `filament_type`; 4. `doPrint()` builds `extruder_map_table: [[logical,physical],...]` containing only used slots; 5. server.js two endpoints parse JSON string parameters into options (v5.12.0)

---

#97 ✅
**Symptom**: When `bridgePOST` passes array parameters, `String([[0,1],[1,0]])` becomes `"0,1,1,0"` and the structure can't be restored
**Root Cause**: `bridgePOST` converts the body to a query string, using only `String(v)` for complex types, losing the array structure
**Solution**: `JSON.stringify(mapTable)` first, then pass it; server.js restores with `JSON.parse(req.query.extruder_map_table)` (v5.12.0)

---

#98 ✅
**Symptom**: The `extruder_map_table` parameter isn't recognized after being passed to Klipper; `SET_PRINT_TASK_PARAMETERS` doesn't receive the mapping table
**Root Cause**: `klippy_apis.py` L333-335 uppercases options keys into G-code parameters, `extruder_map_table` → `EXTRUDER_MAP_TABLE`, but `print_task_config.py` L963 expects the parameter name `MAP_TABLE`, not `EXTRUDER_MAP_TABLE`
**Solution**: In server.js, change `options.extruder_map_table` to `options.map_table`; after `.upper()` it becomes `MAP_TABLE`, matching the parameter name Klipper expects (v5.12.1)

---

#99 ✅
**Symptom**: Filament type "Snapmaker PETG" and "Generic PETG" fail to match; the strict `===` comparison doesn't pass
**Root Cause**: Filament type strings contain brand prefixes (e.g. "Snapmaker PETG", "Generic PETG HF"); a direct `===` comparison can't match same-type filaments from different brands
**Solution**: The `extractFilType()` function extracts the core keyword from the type string (iterating the `FILAMENT_TYPES` array with `indexOf` matching); "Snapmaker PETG" → "PETG", "Generic PETG HF" → "PETG" (v5.14.0)

---

#100 ✅
**Symptom**: In the BambuStudio WebView, clicking the About page link can't jump to an external browser; both `window.open()` and `<a target="_blank">` are blocked
**Root Cause**: 1. BambuStudio `PrinterWebView` (wxWebView/WebKit) blocks `window.open` and `<a target="_blank">`; 2. `bridgeGET` appends `.js` directly to paths containing a query string, producing `/api/bridge/open_external?url=xxx.js` instead of `/api/bridge/open_external.js?url=xxx`, so the Express route match fails
**Solution**: 1. Add the `/api/bridge/open_external.js` JSONP endpoint server-side, using `child_process.exec` to open the system default browser; 2. fix `bridgeGET`: when the path contains `?`, use `path.replace('?', '.js?')` to insert `.js` before `?` rather than appending at the end. Security restriction: only URLs starting with `http://` or `https://` are allowed (v5.16.0)

---

#101 ✅
**Symptom**: The user selects the second extruder (black PETG) in the print confirmation dialog, but the actual print uses the first extruder (orange PETG). The Fluidd console shows `extruder -> extruder`, and the T0 command isn't remapped
**Root Cause**: `SDCARD_PRINT_FILE_WITH_PARAMETERS` calls `cmd_SET_PRINT_TASK_PARAMETERS` (print_task_config.py L1038); this function only updates `extruder_map_table` and **doesn't synchronously update `reprint_info["extruder_map_table"]`**. Meanwhile `virtual_sdcard.py` L2107 reads `reprint_info["extruder_map_table"]` when handling the T0 command; with the default mapping `[0,1,2,3]`, T0 maps to physical extruder 0. By contrast, `cmd_SET_PRINT_EXTRUDER_MAP` (L494-495) updates both
**Solution**: Drop `server.files.start_local_print` (which generates `SDCARD_PRINT_FILE_WITH_PARAMETERS`) and use the OrcaSlicer stepwise approach: first `SET_PRINT_EXTRUDER_MAP` (updates both) → `SET_PRINT_USED_EXTRUDERS` → `SET_PRINT_PREFERENCES` → `printer.print.start` (generates `SDCARD_PRINT_FILE` without options). Reverse analysis of `main.dart.js` L36935/L131518 confirms this flow (v5.16.1)

---

#102 ✅
**Symptom**: `SET_PRINT_USED_EXTRUDERS EXTRUDERS=1` marks the wrong extruder in some scenarios. For example, with mapTable=`[[0,0]]`, it sends `EXTRUDERS=1` (a count), which Klipper parses as `used_extruders=[1]` (an index), marking physical extruder 1 instead of 0
**Root Cause**: `cmd_SET_PRINT_USED_EXTRUDERS` (print_task_config.py L738-741) parses the parameter with `extruders_str.split(',')` into a list of indices `[int(value) for value in extruders_str.split(',')]`, expecting a comma-separated list of extruder indices (e.g. `"0,1"`), not a count (e.g. `"1"` or `"2"`). With a single index, `"1"` happens to parse as `[1]`, correct in the mapTable=`[[0,1]]` scenario; but with mapTable=`[[0,0]]`, `usedExtruders.length=1` sends `EXTRUDERS=1`, which Klipper parses as index 1 rather than 0
**Solution**: `usedExtruders.length` (count) → `usedExtruders.join(',')` (comma-separated index list), e.g. `EXTRUDERS=0,1` or `EXTRUDERS=0` (v5.16.1)

---

#103 ❌ BambuStudio Inherent Limit
**Symptom**: G-code files generated by BambuStudio, when printed directly from the Snapmaker U1 device touch panel, show "unrecognized gcode type"; but they print normally through the WebUI print confirmation dialog
**Root Cause**: The closed-source touchscreen firmware on the device panel checks the EXECUTABLE_BLOCK content when printing gcode directly. The EXECUTABLE_BLOCK generated by BambuStudio contains certain characteristics (e.g. EXCLUDE_OBJECT definitions, FEATURE→TYPE keyword differences) that prevent recognition. Confirmed through multiple rounds of comparison testing:
1. The HEADER identifier is irrelevant (OrcaSlicer files relabeled with BambuStudio markers are still recognized)
2. The CONFIG_BLOCK position is key (OrcaSlicer puts it at the end, BambuStudio at the beginning) — Moonraker `parse_filament_type` only searches `footer_data` (the last 1 MiB of the file); BambuStudio's CONFIG_BLOCK at the beginning can't be parsed
3. Even with CONFIG moved to the end, BambuStudio's EXECUTABLE_BLOCK content is still rejected by the device panel
4. OrcaSlicer HEADER+THUMB+CONFIG + BambuStudio EXEC → not recognized; confirms the problem is in EXECUTABLE_BLOCK
**Solution**:
1. `patchGcodeLayout()` automatically restructures the file when the Bridge uploads gcode (CONFIG_BLOCK moved to the end) → fixes WebUI filament info parsing ✅
2. Use the OrcaSlicer stepwise approach through the WebUI print confirmation dialog (SET_PRINT_EXTRUDER_MAP → SET_PRINT_USED_EXTRUDERS → SET_PRINT_PREFERENCES → printer.print.start) → filament mapping correct ✅
3. Direct panel printing of BambuStudio gcode is still not recognized — the closed-source touchscreen firmware checks EXECUTABLE_BLOCK and can't be fixed externally ❌
4. **Conclusion**: BambuStudio gcode can only be printed through the WebUI; device-panel direct printing is not supported. This is a device firmware limitation, not a compatibility pack bug

---

#104 ✅
**Symptom**: Filament color matching is inaccurate; with multiple physical slots of the same type, close colors match poorly. For example, orange and red are close in RGB space but visually quite different
**Root Cause**: `colorDist()` uses RGB Euclidean distance for color difference; RGB space isn't perceptually uniform — the human eye is more sensitive to green changes and less sensitive to blue changes. OrcaSlicer uses the CIEDE2000 algorithm (Lab color space), the industry-standard perceptually uniform color difference method (confirmed by reverse analysis of `main.dart.js` L144042-L144098)
**Solution**: Upgrade `colorDist()` from RGB Euclidean distance to the CIEDE2000 algorithm (v5.18.0):
1. `rgbToLab(r,g,b)`: sRGB → linear RGB → XYZ → CIELAB conversion
2. `ciede2000(lab1,lab2)`: CIEDE2000 ΔE computation (including C', h', SL, SC, SH, RT rotation terms)
3. `colorDist(a,b)` changed to call `ciede2000(rgbToLab(...), rgbToLab(...))`

---

#105 ✅
**Symptom**: WebUI print progress only shows a percentage (e.g. "45%"), not the current layer (e.g. "56/125 layers"). `jobLayer` always shows "0/0"
**Root Cause**: In the BambuStudio compatibility pack's machine config `fdm_machine_common.json`, `layer_change_gcode` is the empty string `""`, so the generated gcode lacks the per-layer `SET_PRINT_STATS_INFO` command. Klipper `print_stats.info.current_layer` is always 0. Comparing OrcaSlicer gcode: it inserts `SET_PRINT_STATS_INFO TOTAL_LAYER=125 CURRENT_LAYER=N` on every layer change. The WebUI code (L1209) correctly reads `ps.info.current_layer` and `ps.info.total_layer`; the Klipper side just has no data
**Solution**: Change `layer_change_gcode` from `""` to `"SET_PRINT_STATS_INFO TOTAL_LAYER={total_layer_count} CURRENT_LAYER={layer_num}"` (v5.18.1). Note: this modification only affects newly generated gcode; already-uploaded old gcode needs to be re-sliced

---

#106 ✅
**Symptom**: After mapping filaments through the WebUI print confirmation dialog, the filament color/type info on the device panel gets overwritten with the values declared in the gcode (e.g. blue PLA on the device becomes the gcode preset's red PLA)
**Root Cause**: The print flow sends `SET_PRINT_FILAMENT_CONFIG CONFIG_EXTRUDER='i' FILAMENT_TYPE='PLA' ... SAVE='1' VENDOR='Generic'`, overwriting the actual physical filament info on the device with the filament info from the gcode metadata (from BambuStudio presets). `SAVE='1'` makes the override persistent. OrcaSlicer's print confirmation flow doesn't use `SET_PRINT_FILAMENT_CONFIG` (only called separately on the filament edit page), nor `SET_PRINT_TASK_PARAMETERS FILAMENT_TYPE=[...]`
**Solution**: Remove `SET_PRINT_FILAMENT_CONFIG` and `SET_PRINT_TASK_PARAMETERS FILAMENT_TYPE=[...]` from the print confirmation flow (v5.19.0). The device already knows its own physical filament info via `print_task.json`, and `SET_PRINT_EXTRUDER_MAP` already establishes the mapping; there's no need to overwrite device config with the gcode's filament info

---

#107 ✅
**Symptom**: The AI Lab page is completely blank, and the Q&A assistant floating button doesn't show either
**Root Cause**: When webui.html cleaned up the old AI Lab HTML (Node.js script deleting L230-288, L538-706, L1543-1967), it accidentally deleted the empty `<div id="ailab-content">` container (originally within L538-706). In ailab.js's `initAILab()` IIFE, `document.getElementById('ailab-content')` returns null → returns immediately, skipping all HTML injection and QA Fab/Popup creation
**Solution**: Restore `<div id="ailab-content" style="display:none;width:100%;height:100%;overflow:hidden;"></div>` between `about-content` and `<script>` (v5.27.0)

---

#108 ✅
**Symptom**: After reinstall, AI Lab is still completely blank and the Q&A assistant floating button doesn't show. The browser console shows ailab.js and ailab.css loading with 404
**Root Cause**: server.js has no `express.static(WEB_DIR)`; it only has explicit routes for `/`, `/snapmaker.png`, `/fluidd/*`. Requests for `/ailab.css` and `/ailab.js` fall into the `app.all("/{*path}")` catch-all proxy and get forwarded to the Moonraker printer, which returns useless responses
**Solution**: After the `/snapmaker.png` route, add explicit routes for `ailab.css` and `ailab.js` (following the voxelflow pattern with `app.get("/ailab.css", ...)`; don't use `express.static(WEB_DIR)` to avoid interfering with API routes) (v5.27.0)

---

#109 ✅
**Symptom**: Three major G-code optimization issues — ①the local file dropdown is empty; ②after uploading a file nothing happens, clicking optimize prompts "please select a gcode file"; ③after selecting a file from the printer, clicking optimize also prompts "please select a gcode file"
**Root Cause**:
1. `aiOptSwitchTab('local')` only switches panel visibility; it doesn't call `aiListGcodeFiles()` to load the file list
2. The upload FormData field name doesn't match: frontend `formData.append('gcode', file)` vs server `files.file?.[0]`; the server doesn't receive the file and returns `{error: "no_file"}`
3. `optimize_gcode` response nesting: server `{ok: true, result}` → frontend reads `r.optimized_gcode_name` as undefined (should be `r.result.optimized_gcode_name`); the field name `applied_ops` should be `applied_operations`
4. The user clicks the optimize button too early while the printer fetch async download hasn't completed
**Solution**:
1. Call `aiListGcodeFiles()` in `aiOptSwitchTab` when `source==='local'`
2. Server `files.file?.[0]` → `files.gcode?.[0]`; frontend adds a loading state and file input reset
3. Server `{ok: true, result}` → `{ok: true, ...result}` flatten; frontend `applied_ops` → `applied_operations`
4. During the `aiOptFetchAndPreview` download, disable the optimize button showing "Downloading...", restore after completion (v5.27.0)

---

#110 ✅
**Symptom**: G-code optimization is severely destructive to real U1 multicolor print files — U1-specific commands like `PRINT_START`, `SM_PRINT_AUTO_FEED`, `SM_PRINT_FLOW_CALIBRATE`, `DEFECT_DETECTION_START` get brutally replaced by `replace_start_gcode` with generic `G28/M82/M109`, losing auto filament feed, flow calibration, and defect detection functionality
**Root Cause**: In `optimizeGcode`, the `replace_start_gcode` operation finds `;LAYER:0` or the first G1 line containing an E value, then replaces everything before it with a hardcoded U1_START_GCODE template. But the start gcode generated by the U1 slicer (VoxelFlow) contains many proprietary commands (PRINT_START/SM_PRINT_*/DEFECT_*), which are required for the U1 print flow
**Solution**: In `optimizeGcode`, detect whether the gcode contains U1-specific commands (`PRINT_START`/`SM_PRINT_AUTO_FEED`/`SM_PRINT_FLOW_CALIBRATE`/`DEFECT_DETECTION`); if so, skip `replace_start_gcode` and `replace_end_gcode` and keep only safe optimization operations (temperature/speed/fan/retraction/chamber fan, etc.) (v5.27.0)

---

#111 ✅
**Symptom**: In the G-code optimization comparison preview, as long as one line is inserted, all lines after the insertion are marked as "different" (red/green), even if the content is completely identical. For example, if optimization only inserts one line at line 100, lines 100-2000 all show as differences
**Root Cause**: `aiOptLoadOptimized` uses a naive line-by-line comparison (`origLines[i] !== optLines[i]`), comparing by index. When one line is inserted, all subsequent lines in the optimized file are offset by 1, so every line from the insertion point on is judged "different"
**Solution**: Replace with an LCS (longest common subsequence) diff algorithm (v5.28.0):
1. `aiOptComputeDiff`: standard DP builds the LCS table + backtracking generates diff entries (equal/delete/insert/change)
2. Consecutive delete+insert merged into change (semantically more accurate)
3. >3000 lines degrade to `aiOptHashDiff` (lookahead-matching block-level diff to avoid O(n²) memory)
4. The diff info bar changes from "differences: N" to "differences: N (X added, Y deleted, Z modified)"

---

#112 ✅
**Symptom**: G-code optimization claims to have executed `replace_speed` (F30000→F25000) and `modify_temperature` (unified to 210°C/60°C), but in the actual gcode the F30000 occurrences are completely unchanged and the temperature values (178°C, 138°C, 228°C, 80°C) are kept as-is. Only 1 of the 5 optimization operations (add_retract) actually took effect
**Root Cause**:
1. `replace_speed`: the AI-returned `original_speed` may lack the `F` prefix (e.g. `"30000"` instead of `"F30000"`); building the regex directly with `new RegExp(original_speed)` can't match `F30000`
2. `modify_temperature`: the regex `/M104 S(\d+)/` only matches the `M104 S228` format, but the parameter order in Orca gcode isn't fixed (e.g. `M104 T0 S140`, `M109 T0 S138`), so the regex can't match; layer counting uses `lines[i].includes('Layer')` to match the `Layer` keyword, but Orca layer markers use the `;LAYER:N` format, with mismatched case
3. `add_layer_markers`/`add_e_reset`: Orca gcode already includes SET_PRINT_STATS_INFO and G92 E0 via `before_layer_change_gcode`, but the operations don't check for existing content and insert duplicates
**Solution** (v5.28.0):
1. `replace_speed`: auto-complete the F prefix (`original_speed.startsWith('F') ? original_speed : 'F' + original_speed`); add a negative lookahead `(?!\\d)` to avoid partial matches; empty-value check
2. `modify_temperature`: use `\bS\d+\b` to match the S parameter in any position (compatible with both `M104 T0 S140` and `M104 S228`); layer counting uses the `/^;LAYER:\d+/` regex; add `new_bed_temp` support for bed temperature replacement
3. `add_layer_markers`: check whether the next line already contains `SET_PRINT_STATS_INFO` before inserting; skip if present
4. `add_e_reset`: count the proportion of layers that already have G92 E0; skip the entire operation if ≥80%

---

#113 ✅
**Symptom**: G-code optimization fails with `log is not defined`. The AI Lab frontend shows "Optimization failed: log is not defined"
**Root Cause**: In slice_agent.js, the `add_layer_markers`/`add_e_reset` operations of the `optimizeGcode` function call `log("INFO", ...)` and `log("WARN", ...)`, but slice_agent.js doesn't define a `log` function. `log` is only defined in server.js; slice_agent.js, as a standalone module, can't access it
**Solution**: Add a `log()` function and a `setLogFn(fn)` injection mechanism in slice_agent.js (v5.28.1):
1. Default to `console.log/warn/error` for logging output
2. server.js calls `sliceAgent.setLogFn(log)` at startup to inject the unified logging function
3. Export `setLogFn` for server.js to call

---

#114 ✅
**Symptom**: Printer gcode download fails; the API returns `{"ok":false,"error":"resp.body.getReader is not a function"}`
**Root Cause**: In v5.28.1, `fetch_printer_gcode` used `resp.body.getReader()` for streamed download progress, but Node.js's built-in `fetch` `resp.body` is a Node.js Web Stream that doesn't support the browser-style `getReader()` method. `getReader()` isn't available in Node.js 18/20
**Solution** (v5.28.2): Use `resp.arrayBuffer()` to download the entire file at once, updating the `fetchProgress` state after the download completes. Although the download progress can't be tracked in real time (the progress bar only jumps from 0% to 100% when the download finishes), it's compatible with all Node.js versions. The progress bar remains to show the "Downloading..." state

---

#115 ✅
**Symptom**: The G-code optimization `replace_speed` operation never takes effect. In the Dragon_Textured_PLA optimization, the AI planned to replace F30000 with F27000, but all 12258 occurrences of F30000 in the gcode are unchanged. Only 1 of 6 operations (add_retract) actually took effect
**Root Cause**: The AI returns speed values in mm/s units (e.g. `"500"` or `"450"`); after the code auto-completes the F prefix they become `F500`/`F450`, while the actual speed in the gcode is `F30000` (mm/min units, = 500 mm/s × 60). The regex `F500` can't match `F30000`. The F parameter in G-code is always in mm/min, but AI (especially general-purpose LLMs) tends to use the more intuitive mm/s unit
**Solution** (v5.28.3):
1. Add mm/s → mm/min auto-conversion in `replace_speed`: if the F value < 1000 (typical print speeds of 16-500 mm/s correspond to 960-30000 mm/min; < 1000 can hardly be mm/min), treat it as mm/s and multiply by 60
2. Improve the AI prompt: explicitly note in `optimize_gcode.md` and the `taskInstructions` of `optimizeGcode` that "G-code speed unit is mm/min (not mm/s)", with conversion examples (F30000 = 500 mm/s)
3. Add match result logging: log the match count on success, log a WARN on failure

---

#116 ✅
**Symptom**: G-code conversion format detection is wrong — OrcaSlicer-generated gcode is marked as `[Bambu]` format, and conversion reports "Already OrcaSlicer format (contains PRINT_START)"
**Root Cause**: Format detection uses BambuStudio-proprietary command markers (`MOVE_TO_DISCARD_FILAMENT_POSITION`, `ROUGHLY_CLEAN_NOZZLE`, `SM_PRINT_EXTRUDER_PREHEAT`, etc.), but OrcaSlicer U1 gcode also contains these commands (because they're defined in the U1 Start G-code template). Comparing the two gcodes reveals the true distinguishing marker is the layer marker format: BambuStudio uses `; FEATURE:` (13193 occurrences), OrcaSlicer uses `;TYPE:` (9958 occurrences); the two are mutually exclusive
**Solution** (v5.29.1): Format detection uses `; FEATURE:` vs `;TYPE:` — BambuStudio gcode only contains `; FEATURE:` and no `;TYPE:`; OrcaSlicer gcode only contains `;TYPE:` and no `; FEATURE:`. This is the most reliable distinguishing method

---

#118 ✅
**Symptom**: After upgrading the LMStudio model from `google/gemma-4-e2b` to `google/gemma-4-e4b`, AI Lab reports it can't connect
**Root Cause**: `slice_agent.js:34` hardcodes `defaultModel: "google/gemma-4-e2b"`; when `aiConfig.model` is empty it falls back to this default. After the user upgrades the model, LMStudio no longer loads the old model, and the requested model name doesn't match, causing a 404. `testAiConnection` does auto-discover the available model list (lines 1325-1336), but only updates `provider.availableModels` and `provider.defaultModel`, not `aiConfig.model`
**Solution** (v5.31.3): After `testAiConnection` discovers models, if the current `aiConfig.model` isn't in the available list, auto-switch to the first available model and return a `currentModel` field; after the frontend test connection succeeds, if the backend returned a `currentModel` different from the input box, auto-update the input box and show "Model auto-updated"

---

#119 ✅
**Symptom**: When using a local model (LMStudio) with saved config and a successful test connection, clicking G-code optimization or print Q&A still prompts "Please configure the LLM connection first: click the AI Lab settings icon, fill in the API Key and save."
**Root Cause**: The LLM config checks at ailab.js lines 436 and 744, `!aiCfg._hasKey && !aiCfg.apiKey`, apply to all providers. But local models don't need an API Key; `hasKey` (from `!!aiConfig.apiKey`) is always `false`, and the frontend `aiCfg.apiKey` has no value either, so a configured local model gets wrongly blocked
**Solution** (v5.31.4): In the check, first determine whether the current provider is a local model (`aiProviders[aiCfg.provider].isLocal`); local providers skip the API Key check

---

#117 ✅
**Symptom**: After installation, the Bridge can't auto-start; `start-hidden.vbs` errors with `800A03EA` (VBScript syntax error)
**Root Cause**: When install.ps1/reinstall.ps1 generates the VBS, the PowerShell here-string expands the `$nodePath` variable into the `WshShell.Run` arguments. When Node.js is installed at `C:\Program Files (x86)\nodejs\`, the expanded VBS code is `WshShell.Run """C:\Program Files (x86)\nodejs\node.exe"" ..."`; VBScript parses the parentheses in `(x86)` as function-call syntax, causing the 800A03EA syntax error
**Solution** (v5.31.2): In the VBS, assign the path to a variable first, then concatenate, avoiding parentheses appearing directly in the `Run` arguments: `nodePath = "C:\Program Files (x86)\nodejs\node.exe"` → `WshShell.Run """" & nodePath & """ ..."`

---

#120
**Symptom**: After installing Node.js v26.4.0, npm install fails in `install.bat`/`reinstall.bat`; the log shows `SyntaxError: 意外的字符串`, and the Bridge can't start
**Root Cause**: install.ps1 lines 352-354 uses `Get-Command npm` to get the npm command. Node.js v26's installer added `npm.ps1`; PowerShell's `Get-Command` returns `npm.ps1` by priority instead of `npm.cmd`. The actual execution becomes `node.exe "C:\Program Files\nodejs\npm.ps1" install --production`; Node.js parses the PowerShell script as JavaScript, and the first line `Set-StrictMode -Version 'Latest'` fails immediately
**Solution** (v5.32.1): Remove the `Get-Command` indirection; derive the `npm.cmd` path directly from the known `$nodePath`: `$npmCmd = Join-Path (Split-Path $nodePath) 'npm.cmd'`. `node.exe` and `npm.cmd` are always in the same directory, reliably compatible with all Node.js versions

---

#121 ✅
**Symptom**: On Linux, clicking the BambuStudio print button crashes when the Bridge pops the native dialog; the log shows `ReferenceError: execFileSync is not defined`
**Root Cause**: dialog.js:1 only imports `execFile`: `const { execFile } = require("child_process")`, but showLinuxDialog (L275) uses `execFileSync("which", ["zenity"], ...)` to detect whether zenity is installed. The synchronous function was never imported, throwing ReferenceError at runtime
**Solution** (v5.34.0): Change dialog.js:1 to `const { execFile, execFileSync } = require("child_process")`

---

#122 ✅
**Symptom**: All JSONP endpoints (35 places of `req.query.cb || "callback"`) allow arbitrary strings as callback function names; an attacker can craft `?cb=alert(document.cookie)//` to inject JS and execute arbitrary code via `<script>` tags (XSS)
**Root Cause**: 35 JSONP endpoints in server.js concatenate `req.query.cb` directly into the response `${cb}(...)` with no validation. Although the BambuStudio WebView is a local tool, cb injection can be exploited by malicious web pages (e.g. phishing links pointing to the bridge)
**Solution** (v5.34.0): Add a global middleware `sanitizeCb` at server.js:187-194, validating `req.query.cb` with the regex `/^[A-Za-z_$][\w$]*$/`; reset to `callback` if not a valid JS identifier. One middleware covers all 35 endpoints

---

#123 ✅
**Symptom**: The `/api/bridge/open_external.js?url=...` endpoint uses `exec(\`start "" "${url}"\`)` to concatenate the command; if the URL contains shell metacharacters like `&` `|` `;`, arbitrary commands can be executed (RCE). For example `url=https://evil.com&calc.exe` launches the calculator
**Root Cause**: Three server.js endpoints (open_external L550, open_folder L574, open_gcode_folder L1481) all use `exec(cmd)` to concatenate shell commands, inserting url/dir directly into the command string. open_external has an `^https?://` check but still allows query characters like `&`
**Solution** (v5.34.0): Add the `openPathExternally(target)` helper (server.js:544-577), calling `explorer`/`open`/`xdg-open` via `spawn` + an argument array so arguments don't pass through shell parsing. The three endpoints use this helper; delete all inline `require("child_process").exec`

---

#124 ✅
**Symptom**: After every gcode upload-and-print through BambuStudio, `%TEMP%` retains `formidable_xxxxx` temp files; long-term use accumulates hundreds of files
**Root Cause**: The finally block of server.js handleUploadWithConfirm references `req.files?.file`, but the files parsed by formidable are local variables `const [fields, files] = ...` and are never written to `req.files`. `req.files` is always undefined, so the cleanup code never runs
**Solution** (v5.34.0): Declare `let uploadedFiles = null` before try; after formidable parses, set `uploadedFiles = files`. The finally block iterates all fields of `uploadedFiles` (file/gcode/etc.) to clean up temp files

---

#125 ✅
**Symptom**: The AI Lab G-code file list loads slowly; loading large files (>50MB) causes memory usage to spike
**Root Cause**: slice_agent.js listGcodeFiles L1466 uses `fs.readFileSync(filePath, "utf-8", { start: 0, end: 32768 })` intending to read only the first 32KB for format detection, but `readFileSync` doesn't support the `start/end` options (those are `createReadStream` options); the entire file gets read into memory
**Solution** (v5.34.0): Use `fs.openSync` + `fs.readSync(fd, buf, 0, 32768, 0)` to read only the first 32KB; close with `fs.closeSync(fd)` in the finally block

---

#126 ✅
**Symptom**: After the AI optimization returns an `add_retract` patch, retraction doesn't take effect; even with `min_travel_length: 5.0` specified, retraction is added to all travel moves; OrcaSlicer gcode (which uses G1 travel) doesn't match at all
**Root Cause**: Three bugs in slice_agent.js add_retract L1568-1586: 1) the retraction line `G1 E-...` is inserted **after** the travel line (should be before, otherwise stringing has already happened); 2) `min_travel_length` is destructured but never used — retraction is added to all travel moves; 3) the regex `/G0\s+X.../` only matches G0, but OrcaSlicer uses G1 travel which doesn't match
**Solution** (v5.34.0): Rewrite add_retract: 1) insert retraction before the travel; 2) track curX/curY to compute actual travel distance, using `min_travel_length` (default 5.0) to filter short travel moves; 3) change the regex to `/G[01]\s+X.../` to match both G0 and G1

---

#127 ✅
**Symptom**: When the AI diagnoses G-code, `stats.retracts` is inflated; even simple models report "too many retractions"
**Root Cause**: slice_agent.js extractGcodeStats L1122-1130 detects retraction with `if (e < lastE) stats.retracts++`. But the per-layer `G92 E0` (resetting the E origin) makes e=0 < lastE (e.g. 100), miscounted as a retraction. One G92 E0 per layer miscounts one retraction; an N-layer model is inflated by N retractions
**Solution** (v5.34.0): Add a `G92 E<value>` detection branch before the E check; when G92 E is matched, only update `lastE` without counting retract/extrusion. The regex `/^G92\s+.*?\bE(-?[\d.]+)/i` is compatible with both `G92 E0` and `G92 X0 Y0 E0`

---

#128 ✅
**Symptom**: After using the AI print assistant's streaming Q&A, the `qaStreams` Map keeps growing; long-running Bridge memory usage increases
**Root Cause**: The background IIFE of slice_agent.js printQAStream sets `streamState.done=true` on completion, but only relies on active `cleanupQAStream(streamId)` calls for cleanup. When the client closes the browser or the network disconnects, polling stops and streamState stays in the Map forever
**Solution** (v5.34.0): Add a finally block to the IIFE with `setTimeout(() => qaStreams.delete(streamId), 30000)` as a fallback cleanup, giving the client a 30-second window to pull the final state before auto-eviction

---

#129 ✅
**Symptom**: After the WebUI runs for a long time, `<head>` accumulates many `<script>` tags and the DOM node count keeps growing
**Root Cause**: webui.html loadJS L585 appends a new script tag with `document.head.appendChild(s)` on every JSONP call, but never removes it. Every status poll and every bridgeGET adds a dead script tag
**Solution** (v5.34.0): loadJS extracts a `cleanup` function that deletes `window[cbName]` and calls `s.parentNode.removeChild(s)` in both the JSONP callback (`window[cbName]`) and `s.onerror`

---

#130 ✅
**Symptom**: When the Bridge WebSocket intermittently errors, the WebUI state machine freezes; temperature/progress stop updating and the page needs a refresh
**Root Cause**: webui.html ws.onmessage L1177 directly does `var m=JSON.parse(e.data)` without try/catch. If the server pushes non-JSON data or structurally abnormal data (e.g. Klipper's notify_status_update missing params), JSON.parse throws and the code after onmessage doesn't execute, desynchronizing the state machine
**Solution** (v5.34.0): Wrap all of ws.onmessage in try/catch; on error, `console.error('[Bridge] WS message parse error:', err)` without rethrowing, so the state machine keeps running

---

#131 ✅
**Symptom**: When running `reinstall.bat` to reinstall the Bridge, step [4/10] copying the bridge directory errors with `拒绝访问` (Access denied); the file is locked by node.exe
**Root Cause**: reinstall.ps1 [2/10] only stops the bridge process, not the watchdog scheduled task. The watchdog checks every 2 minutes whether the bridge is alive; mid-reinstall (bridge stopped but copy not finished) the watchdog triggers, starting a new bridge process that locks the files, causing subsequent copies to fail
**Solution** (v5.34.0): At the start of reinstall.ps1 [2/10], first `Stop-ScheduledTask` + `Unregister-ScheduledTask` to stop the watchdog; after [10/10] starts the bridge, re-`Register-ScheduledTask` to restore the watchdog

---

#132 ✅
**Symptom**: slice_agent.js is 3066 lines, of which about 1448 lines (47.2%) are dead code — high maintenance cost and hurts code readability
**Root Cause**: After v5.25.0 removed the AI slicing mode, the entire AI slicing pipeline function chain (analyzeModel→sliceModel→suggestParameters→generateGcodeFromAnalysis→advancedSlice, etc.) became dead code, but the functions themselves weren't cleaned up. Non-streaming printQA, replaced by the streaming version, also became dead code. saveStlFile/listStlFiles are aliases never called
**Solution** (v5.35.0): Delete 22 dead functions/constants (updateMemory/analyzeModel/sliceModel/parseSliceOutput/computeSliceAnalysis/suggestParameters/generateGcodeFromAnalysis/aiComputeOverrides/validateGcode/reviewGcode/generateRecommendationReason/saveModelFile/saveStlFile/getStlInfo/listModelFiles/listStlFiles/regenerateFromRawPath/advancedSlice/printQA/SLICE_FILAMENT_RULES/sliceJobs/createJobId). Also clean up the dead task type branches in buildSystemPrompt and module.exports. Final result: 1618 lines

---

#133 ✅
**Symptom**: server.js has 10 dead endpoints that the frontend ailab.js/gcvt.js/webui.html never call — taking up code space and increasing the attack surface
**Root Cause**: After v5.25.0 removed the AI slicing mode, 8 AI pipeline endpoints (upload_model/analyze/suggest_params/ai_slice/review_gcode/patch_gcode/print_qa/advanced_slice) have no frontend entry. bridge/status and bridge/disconnect have no .js versions, so the bridgeGET/bridgePOST mechanism can't reach them
**Solution** (v5.35.0): Delete all 10 dead endpoints. Keep the patchGcode function (called by optimizeGcode) and the extractGcodeStats function (called by optimizeGcode)

---

#134 ✅
**Symptom**: In webui.html's file list and print modal, filenames and filament types are concatenated into innerHTML without escaping. Malicious filenames (e.g. `<script>alert(1)</script>.gcode`) or tampered filament types can inject HTML/JS
**Root Cause**: webui.html L861-865 file list name/f.path, L945 print modal name, L977 gType, L985 mFilTypes/mFilSub, L998 mT/mS are all directly string-concatenated into innerHTML without HTML escaping
**Solution** (v5.35.0): Add the `escHtml(s)` helper function (escaping &<>"'); wrap data with escHtml at all 6 innerHTML concatenation points

---

#135 ✅
**Symptom**: ailab.js and gcvt.js have multiple unescaped innerHTML concatenations that can be injected with malicious content
**Root Cause**: 1) ailab.js aiRenderInline/aiRenderChatMessage code blocks (```code```) reverse-decode `&lt;/&gt;` back to `</>` after the first HTML escaping, so `<script>` tags returned by the AI can execute directly; 2) ailab.js L397 download failure errMsg isn't escaped; 3) gcvt.js L147 load failure error info, L199 temperature/tool values aren't escaped
**Solution** (v5.35.0): 1) Remove the reverse-decode of code blocks in aiRenderInline/aiRenderChatMessage (keep them escaped); 2) add the aiEscapeHtml/gcvtEsc helper functions; 3) wrap all error messages and dynamic values with the escape functions

---

#136 ✅
**Symptom**: In slice_agent.js, the three functions testAiConnection / optimizeGcode / printQAStream have about 50 lines of duplicated AI-call boilerplate (provider resolution, headers construction, /chat/completions POST, error handling), and the error handling styles are inconsistent — testAiConnection uses `return {ok:false, error:e.message}`, printQAStream uses a simplified `e.message||String(e)` that loses the cause chain (the real cause of node-fetch network errors is in `e.cause`), so local LLM connection failures only show "request to ... failed, reason:" without the specific cause
**Root Cause**: When v5.20.0 introduced AI Lab, the three functions were implemented separately without abstracting a common call layer; extractErrorMessage is only defined in testAiConnection, and the other functions each simplify handling
**Solution** (v5.36.0): Extract the `bridge-node/aiClient.js` common module (150 lines), exporting the `AiClient` class + `AI_PROVIDERS` + `extractErrorMessage`. AiClient encapsulates provider resolution/credential validation/headers construction/chat & models requests; extractErrorMessage unifies to `e.message || e.cause?.message || e.cause?.code || String(e)`. Refactored three functions: testAiConnection 45→15 lines, optimizeGcode AI-call section 40→6 lines, printQAStream AI-call section 25→3 lines

---

#137 ✅
**Symptom**: In ailab.js, the optimize_gcode call appends 4 redundant query parameters (provider/customBaseUrl/model/api_key); the backend server.js optimize_gcode endpoint doesn't read these at all (it uses the global aiConfig directly). Among them, api_key is passed in plaintext via the GET URL, creating a leak risk (browser history, server access logs, and Referer headers can all record it)
**Root Cause**: The v5.20.0 first version of AI Lab implemented the frontend with a "pass through all config" approach without confirming that the backend only actually reads the one gcode_name parameter; after v5.27.0 switched to server-side storage of aiConfig, the redundant frontend parameters weren't cleaned up
**Solution** (v5.36.0): Delete the 4 lines of parameter concatenation at ailab.js L456-460; the optimize_gcode call only passes `?gcode_name=`. aiConfig is held globally server-side; no frontend passthrough needed

---

#138 ✅
**Symptom**: The AI print assistant Q&A always shows "AI returned an empty response, please retry"; LMStudio receives the request and returns a streaming response, but the frontend has no content. The log shows only 1 poll after each qa_stream_start (normally it should keep polling every 200ms until done)
**Root Cause**:
1. **Backend streaming read failure**: `slice_agent.js printQAStream` uses `resp.body.getReader()` to read node-fetch v2's streaming response, but node-fetch v2's `resp.body` is a Node.js Readable stream (inheriting `stream.Readable`), not a Web ReadableStream; the `getReader()` method doesn't exist, and calling it throws `TypeError: resp.body.getReader is not a function` (same class of problem as traps.md #114; v5.28.1 fixed the gcode download scenario but printQAStream was missed). The IIFE catch catches the exception, sets `streamState.error` + `streamState.done=true`, so the first poll (after 300ms) already receives `done=true`
2. **Frontend swallows the error**: the ailab.js done branch only checks whether `answerText` is empty, not `pd.error`; even if the backend returned error info, it shows "AI returned an empty response" instead of the actual error
**Solution** (v5.36.1):
1. **Backend**: streaming read changed from `resp.body.getReader()` + `while(true) reader.read()` to the `for await (const chunk of resp.body)` async iterator. Node.js Readable streams support `Symbol.asyncIterator` since v10, Web ReadableStream since ES2018 — compatible with both. Add `log("ERROR", ...)` in the IIFE catch for easier troubleshooting
2. **Frontend**: the done branch checks `pd.error`; when an error exists, show `[Error: ...]` instead of "empty response"; remove the redundant provider/customBaseUrl/model query parameters from the `qa_stream_start` call (same as optimize_gcode; the backend doesn't read them)

---

#148 ✅
**Symptom**: A user reports G-code upload failure; BambuStudio reports `HTTP 500: {"error":"Upload failed: The user aborted a request."}`
**Root Cause**: When v5.37.2 code review fix M2 (traps.md #144) added `fetchWithTimeout(..., 120000)` (fixed 120-second timeout) to the upload operation. Large G-code files (50-100MB) on slow WiFi can take more than 120 seconds to upload; the timeout triggers `controller.abort()`, node-fetch throws AbortError (message: "The user aborted a request"), and after catch it returns HTTP 500. The same problem affects the AI Lab upload endpoint (L1151) and the G-code download endpoint (L1337, 60s timeout)
**Solution** (v5.37.3): Upload and download operations revert to bare `fetch` (no timeout). File size × network speed is uncontrollable, so a fixed timeout is unreasonable; when Moonraker is offline, TCP fails fast (RST/FIN), so no timeout protection is needed. List operations (list_printer_gcode) keep the 10s timeout (lightweight operations)

---

#149 ✅
**Symptom**: All user-visible text in AI Lab (G-code optimization + print assistant) and the G-code conversion panel is hardcoded Chinese; switching the WebUI language to English doesn't switch these two panels
**Root Cause**: `ailab.js` / `gcvt.js` use the IIFE `(function initAILab(){...})()` to inject innerHTML once at load time, with hardcoded Chinese text; `webui.html`'s `setLang()` only updates `[data-i18n]` elements and doesn't re-render these two panels; the IIFE can't be invoked again
**Solution** (v5.38.0):
1. **Translation functions**: add `aiT(zh, en)` / `gcvtT(zh, en)`, reading `window.curLang` ('zh'/'en') and returning the text for the corresponding language
2. **IIFE → re-callable function**: `(function initAILab(){...})()` → `function initAILab(){...}` + `initAILab();`; same for gcvt. Before re-rendering, remove old modals (`['aiConfigModal','aiErrorModal','qaFab','qaPopup'].forEach` remove) to avoid duplicate injection
3. **Language application functions**: add `aiApplyLang()` / `gcvtApplyLang()`, re-invoking the init functions to render the panels; state variables (`aiOptState` / `gcvtState`, etc.) are declared at the outer scope and preserved on re-render
4. **setLang integration**: at the end of `webui.html setLang()` call `if(typeof aiApplyLang==='function')aiApplyLang(); if(typeof gcvtApplyLang==='function')gcvtApplyLang();`
5. **Text replacement**: ~60 text points in ailab.js, ~30 in gcvt.js; use `'+aiT('中文','English')+'` concatenation in innerHTML and direct `aiT('中文','English')` calls in dynamic JS

---

#150 ✅
**Symptom**: In the print confirmation dialog, users can't tell whether the G-code is BambuStudio or OrcaSlicer format, and may mistakenly send BambuStudio-format files to the device touch panel, causing the "unrecognized gcode type" error (see traps.md #103)
**Root Cause**: `webui.html showPrintDialog` only shows filename/filament mapping; it doesn't detect the G-code format. Although there's a G-code conversion feature (gcvt panel), users don't know when they need to use it
**Solution** (v5.38.0):
1. **Backend endpoint**: `server.js` adds the `/api/ai/check_gcode_format.js` JSONP endpoint, downloading the first 32KB of the G-code from Moonraker via an HTTP Range request (`Range: bytes=0-32767`), reusing the detection logic verified in #116 (`; FEATURE:` = bambu, `;TYPE:` = orca), returning `{ok:true, format:"bambu"|"orca"|"unknown"}`
2. **Dialog format indicator**: `showPrintDialog` adds a `#gcodeFormatInfo` placeholder in the gcode_info area ("检测格式中.../Detecting format..."); asynchronously calls the endpoint at the end: OrcaSlicer format shows a green ✓ compatible; BambuStudio format shows an orange ⚠ warning + "前往转换 →" link (`onclick="closePrintModal(true);switchTab('gcvt')"`); unknown format shows a gray hint
3. **Range request advantage**: only downloads the first 32KB instead of the whole file (possibly 50-100MB); the format markers are at the file head, so detection is fast and bandwidth-friendly

---

#151 ✅
**Symptom**: The BambuStudio compatibility pack can't be installed/used properly on Linux: no Linux install script; the Bridge config path hardcodes Windows' `%APPDATA%` (on Linux it creates `~/AppData/Roaming/` instead of `~/.config/`); no auto-start or watchdog mechanism
**Root Cause**:
1. `server.js` L16-L20 `APPDATA_DIR` hardcodes `process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")`; on Linux APPDATA doesn't exist, falling back to `~/AppData/Roaming/` (not the XDG standard)
2. `slice_agent.js` L68/L312/L328 likewise hardcodes the APPDATA path
3. Only `install.ps1`/`install.bat` (PowerShell/CMD) exist, no `install.sh`
4. Auto-start uses a Windows Startup shortcut + VBS hidden launcher, with no Linux equivalent
**Solution** (v5.39.0):
1. **Cross-platform path**: `server.js` L16-L22 and 3 places in `slice_agent.js` change to `process.platform === "win32" ? APPDATA : XDG_CONFIG_HOME`; Windows behavior unchanged, Linux uses `~/.config/`
2. **install.sh**: 9-step install flow (mirroring install.ps1), detects the BambuStudio install method (AppImage/.deb/directory/squashfs-root), uses `node -e` to handle JSON config files (avoiding a jq dependency), systemd user service preferred + .desktop autostart + cron watchdog fallback
3. **uninstall.sh**: 7-step cleanup, restores user machine config
4. **reinstall.sh**: 3-step quick reinstall
5. **start-bridge.sh**: universal launcher, shared by systemd and autostart
6. **systemd user service**: `Restart=always` built-in watchdog, `systemctl --user enable/start bambustudio-bridge.service`
7. **AppImage profiles**: AppImage's squashfs is read-only; profiles are copied to `~/.config/BambuStudio/system/` (may be overwritten by BambuStudio; users are told they can extract the AppImage for a permanent install)

---

#142 ✅
**Symptom**: In the mDNS scan results page of server.js `renderSetupPage()`, `p.name` and `p.ip` are concatenated into `innerHTML` without escaping (L1430). An attacker on the same LAN only needs to broadcast a malicious mDNS service name (e.g. `<img src=x onerror="...">`); when the user clicks "Scan Network" on the setup page, the malicious JS executes under the bridge's origin (localhost), potentially stealing config or redirecting the printer connection
**Root Cause**: The setup page's inline `<script>` concatenates HTML with `+p.name+` and `+p.ip+` directly, without calling any escape function. mDNS `service.name` is broadcast by devices on the LAN and is fully controllable
**Solution** (v5.37.2): Add an `escHtml(s)` function at the start of the setup page `<script>` (escaping `& < > " '`); replace `p.name`/`p.ip` in all innerHTML with `escHtml(p.name)`/`escHtml(p.ip)` (including `p.ip` in the `data-ip` attribute)

---

#143 ✅
**Symptom**: dialog.js `fetchPrintTask` still uses the node-fetch v2 non-standard `timeout: 5000` option (L18); v5.37.0 standardized 8 places in server.js but missed this one. node-fetch v3 and the Node.js built-in fetch silently ignore this option, so when Moonraker is unreachable `fetchPrintTask` hangs forever, blocking the print confirmation dialog
**Root Cause**: When v5.37.0 standardized fetchWithTimeout, only server.js was checked; dialog.js wasn't
**Solution** (v5.37.2): In `fetchPrintTask`, use `AbortController` + `signal` instead (same pattern as `fetchWithTimeout`), 5-second timeout

---

#144 ✅
**Symptom**: Three AI Lab endpoints in server.js use bare `fetch` with no timeout protection: 1) `upload_to_printer` (L1139); 2) `list_printer_gcode` (L1288); 3) `fetch_printer_gcode` (L1324). When Moonraker responds slowly or the network is interrupted, the request hangs forever, the JSONP response never returns, and the frontend `<script>` tag stays pending permanently
**Root Cause**: v5.37.0 standardized Moonraker-related fetch calls, but these three AI Lab endpoint fetches were missed
**Solution** (v5.37.2): Replace the three `fetch` calls with `fetchWithTimeout`: upload 120s (large files), list default timeout (10s), download 60s

---

#145 ✅
**Symptom**: webui.html file list L866 `escHtml(f.path).replace(/'/g,"\\'")` double-escaping fails, causing XSS. `escHtml` first converts `'` to `&#39;`; the subsequent `.replace(/'/g,"\\'")` can't find a literal `'` and is a no-op. But when the browser parses the HTML attribute `onclick="printFile('...')"`, it decodes `&#39;` back to `'`, which can close the JS string. Attack vector: a G-code file on the printer whose filename contains `'` (e.g. `test');alert(1);//.gcode`); arbitrary JS executes when the user opens the file list
**Root Cause**: Wrong escaping order — JS escaping should come first, then HTML escaping, or inline JS string concatenation should be avoided entirely
**Solution** (v5.37.2): Use the `data-path="'+escHtml(f.path)+'"` attribute + `onclick="printFile(this.dataset.path)"`. The browser auto-decodes HTML entities and the original value is obtained via `dataset.path`, with no injection risk

---

#146 ✅
**Symptom**: ailab.js `aiEscapeHtml` (L879) and gcvt.js `gcvtEsc` (L11) only escape 4 characters (`& < > "`), missing `'` → `&#39;`, inconsistent with webui.html `escHtml`'s 5 characters. Under current usage (content enters innerHTML text nodes) the risk is low, but it's an inconsistent "landmine" — if a developer later puts output into a single-quoted attribute context, it would trigger XSS
**Root Cause**: The v5.35.0 XSS fix didn't unify all escape functions
**Solution** (v5.37.2): Add `.replace(/'/g,'&#39;')` to both functions, consistent with `escHtml`

---

#147 ✅
**Symptom**: server.js `confirm_print.js` and `start_print.js` endpoints `JSON.parse` the GET URL query parameter `extruder_map_table` directly, with no length limit or type validation (L447-448, L485-486). Attackers can send oversized query parameters causing `JSON.parse` to consume lots of CPU/memory (DoS), or pass non-array types causing subsequent `.map()` to crash
**Root Cause**: Express sets no length limit on query strings by default, and no type validation is done after parsing
**Solution** (v5.37.2): Add a `length > 4096` check (throwing "too large") + `Array.isArray` validation (throwing "not an array"); the catch branch resets mapTable to `[]`

---

#141 ✅
**Symptom**: After conversion by the G-code conversion tool, the file's `EXECUTABLE_BLOCK` only contains the start code (~80 lines); `PRINT_END` and the entire print process are outside the `EXECUTABLE_BLOCK`. Compared with native OrcaSlicer files, their `EXECUTABLE_BLOCK` contains the entire print process from `PRINT_START` to `PRINT_END`. This may prevent the U1 device panel from correctly recognizing the print range
**Root Cause**: In slice_agent.js, the `convertGcodeContent` function added `EXECUTABLE_BLOCK_END` at the end of `newExecBlock` (L1356), then deleted the original `EXECUTABLE_BLOCK_END` in printBody (L1417), causing the EXEC block to contain only the OrcaSlicer start code, with the body outside the EXEC
**Solution** (v5.37.1): 1) `newExecBlock` no longer adds `EXECUTABLE_BLOCK_END`; 2) add `EXECUTABLE_BLOCK_END` at the end of `convertedBody` (after PRINT_END), wrapping the entire print process (EXEC_START → start code → body → PRINT_END → EXEC_END), consistent with the native OrcaSlicer format. Added unit tests verifying EXEC_END comes after PRINT_END

---

#139 ✅
**Symptom**: 8 fetch calls in server.js use the node-fetch v2 non-standard `timeout` option (`fetch(url, { timeout: 10000 })`), a v2-only API that neither node-fetch v3 nor the Node.js built-in fetch supports. If node-fetch is upgraded or the built-in fetch is adopted in the future, all timeouts would silently stop working
**Root Cause**: node-fetch v2 provides the non-standard `timeout` field in options, but it isn't part of the Fetch spec. The standard approach is `AbortController` + `signal`
**Solution** (v5.37.0): Add the `fetchWithTimeout(url, options, timeoutMs)` helper function, implementing the timeout internally with `AbortController` + `setTimeout`, returning a standard fetch Promise. Replace all 8 fetch calls: moonrakerFetch / proxy.js / init-data.js / check_update / cam_snapshot / upload / proxyToMoonraker / webcam proxy. node-fetch wasn't upgraded (v3 is pure ESM, incompatible with the CommonJS project), but the dependency on the proprietary API is gone

---

#140 ✅
**Symptom**: The patchGcode and convertGcode functions mix file I/O (read file + write file) with core logic, making direct unit testing impossible. Tests need to create temp files and set directory paths — fragile and slow
**Root Cause**: The v5.20.0 first implementation had the functions operate on the filesystem directly, without separating I/O and logic
**Solution** (v5.37.0): Extract the pure functions `patchGcodeContent(content, patchPlan)` and `convertGcodeContent(content)`, which only accept string content and return result strings with no file I/O side effects. The original patchGcode/convertGcode become thin wrappers of read file + call pure function + write file. The pure functions are exported to module.exports for direct test calls; 28 unit tests cover 5 patch operations + format detection + conversion logic

---

#152 ✅
**Symptom**: The Bridge startup log reports `Failed to load config: Unexpected token '﻿', "﻿{"host":""... is not valid JSON`; config loading fails and falls back to defaults (printer_host empty, bind back to 127.0.0.1), even though the bridge_config.json content looks completely valid
**Root Cause**: Windows PowerShell 5.1's `Set-Content -Encoding UTF8` and old Notepad "UTF-8" saves write a BOM (`\uFEFF`, bytes EF BB BF) at the file head. `fs.readFileSync(path, "utf-8")` doesn't auto-strip the BOM; `JSON.parse` throws SyntaxError immediately on the leading `\uFEFF` character. server.js loadConfig (v5.39.0 and earlier, L44-53) has no BOM defense
**Solution** (v5.44.0): loadConfig strips the BOM after reading: `fs.readFileSync(CONFIG_FILE, "utf-8").replace(/^\uFEFF/, "")` before JSON.parse. When hand-writing config files, use `[System.IO.File]::WriteAllText()` (no BOM) or PowerShell 7's `Set-Content -Encoding utf8NoBOM`

---

#153 ✅
**Symptom**: When running `node --test test/net_utils.test.js test/patch_gcode.test.js test/convert_gcode.test.js` (three files together), convert_gcode.test.js intermittently fails (reports `test failed` with no specific assertion info); running each file alone passes 12/12, and pairwise combinations all pass; re-running the three-file combination passes 44/44
**Root Cause**: node --test by default runs test files in parallel subprocesses according to CPU core count; there's intermittent resource contention between tests (convert/patch tests share the slice_agent module and temp file operations), causing non-deterministic failures
**Solution** (v5.44.0): Recorded as a test-running note — when combined runs intermittently fail, re-run first to confirm whether it's intermittent; in CI, `--test-concurrency=1` can be added for serial execution. The test code itself needs no changes

---

#154 ✅
**Symptom**: An external device via Tailscale connecting directly to the home Bridge (bind=tailnet, `http://100.x.x.x:13628`) times out, but locally on the home machine `curl` to the same address works and the Bridge log shows no request records; simulating remote from the local machine (curl of your own tailnet IP) goes through the internal loopback path and can't detect the problem
**Root Cause**: When Windows first popped the "Allow node.js to communicate" window, "Cancel" was clicked; the firewall auto-generated two inbound Block rules (`TCP/UDP Query User{...}C:\program files\nodejs\node.exe`, Private+Public, all ports all addresses). And Windows firewall Block rules take priority over Allow — even creating new allow rules is ineffective; the Block rules must be deleted (requires admin). Local self-connection doesn't pass through firewall inbound filtering, so local testing never reveals it
**Solution** (v5.44.1): Preferred: `tailscale serve --bg http://127.0.0.1:13628` — the tailscaled service proxies traffic on the local loopback, completely bypassing the firewall, no elevation needed; for direct-connect mode, run in an admin PowerShell: `Get-NetFirewallRule -Direction Inbound | Where-Object { $_.DisplayName -like "*node*" -and $_.Action -eq "Block" } | Remove-NetFirewallRule; New-NetFirewallRule -DisplayName "BambuStudio Bridge (Tailscale)" -Direction Inbound -Protocol TCP -LocalPort 13628 -RemoteAddress 100.64.0.0/10 -Action Allow`

---

#155 ✅
**Symptom**: With v5.44.0 serving via `tailscale serve` (`https://<machine>.ts.net` → `127.0.0.1:13628`) for remote printing, when an external user clicks Print, the home desktop pops up the native confirmation dialog again and the remote request hangs — the remote request is misjudged as local
**Root Cause**: serve makes tailscaled initiate the proxy connection on the local loopback; the `req.socket.remoteAddress` the Bridge sees is `127.0.0.1`; v5.44.0's isLocalAddress only looks at the socket address → misjudges as local. The tailscaled proxy carries `X-Forwarded-For` (the real client tailnet IP), but v5.44.0 doesn't recognize that header
**Solution** (v5.44.1): netUtils.js adds `isLocalRequest(req)` — loopback and no X-Forwarded-For means local; loopback + XFF = remote request through a local reverse proxy, goes through the remote confirmation flow (WebUI confirmation, zero desktop dialogs). Trust boundary security: non-loopback sources are unaffected by XFF (already judged remote), and external parties can't obtain local treatment by forging XFF

---

#156 ✅
**Symptom**: `tailscale serve --bg --set-path=/download <local directory>` errors with `401 Unauthorized: must be a Windows local admin to serve a path or Unix socket`; serving a static directory fails (the same account's proxy mode `--set-path=/ http://127.0.0.1:13628` works fine)
**Root Cause**: Tailscale Windows client security model — serving static filesystem targets (file/directory target) requires local admin privileges (tailscaled runs as SYSTEM and must verify the user can access arbitrary paths), while proxying to a TCP port doesn't involve filesystem access control and needs no elevation. The user isn't home and can't do UAC
**Solution** (v5.44.1 deployment): The download service is instead served by the Bridge's own static routing — reusing the existing `/fluidd` express.static route (pointing to web/dist); place the zip in the deployment directory `web\dist\` and it can be downloaded via `https://<machine>.ts.net/fluidd/<name>.zip`, zero code changes

---

#157 ✅
**Symptom**: In a non-admin session, all scheduled task registration/modification fails — `Register-ScheduledTask` (S4U or default principal) reports `Access is denied (0x80070005)`; `schtasks /create` and `/change` are also rejected (/change additionally requires interactive user password entry)
**Root Cause**: This Windows environment's normal account has no write permission to the Task Scheduler, and the user isn't home so UAC elevation confirmation isn't possible
**Solution** (v5.44.1 deployment): Don't re-register. The leftover old watchdog task (pointing to `C:\Program Files\Bambu Studio\bridge\watchdog.ps1`) still works — watchdog.ps1 logic prefers launching the Bridge via VBS, and the VBS now points to `%LOCALAPPDATA%\BambuStudio-Bridge\app\server.js`, so the self-healing chain is complete (it only falls back to starting the old version if the VBS is deleted). When admin rights are available later, re-register with `Register-BridgeWatchdog -BridgeDir <new path>` from install-common.psm1

---

#158 ✅
**Symptom**: After remote-mode installation, the user machine config's print_host is never rewritten (still points to 127.0.0.1:13628 or is empty); an external BambuStudio still enters the initial "scan LAN to configure device IP" screen after install. Local mode was never noticed because the defaults happen to be the same; the bug has been latent since `Patch-UserMachineConfigs` was introduced in v5.36.0 and was only exposed by v5.45.0's remote mode
**Root Cause**: install-common.psm1 `Patch-UserMachineConfigs` filters files with `$_.DirectoryName -match '\\machine\\'` — the regex requires another path separator after `machine`, but machine profile files are located directly in the `...\user\<profile>\machine\` directory itself (no subdirectories); the DirectoryName ends with `\machine` with no trailing separator, so the regex never matches and the patch loop silently iterates over 0 files
**Solution** (v5.45.0): Change the regex to `'\\machine\\?$'` (machine directory ending, allowing with/without trailing separator, `$` anchors the end). PowerShell `-match` uses .NET regex, where `\\` matches a single backslash

---

#159 ✅
**Symptom**: After installing the compatibility pack on the release version of BambuStudio (config directory `%APPDATA%\BambuStudio`), machine config patching / cache cleanup all have no effect; the Beta version (`%APPDATA%\BambuStudioBeta`) works fine
**Root Cause**: The config operations in install-common.psm1 (Clear-BambuSystemCache / Clean-SnapmakerEntriesFromConf / Patch-UserMachineConfigs) and the user preset detection in install.ps1/reinstall.ps1 hardcode a single directory name — the project was always tested with the Beta version during development, and the release channel was completely missed
**Solution** (v5.45.0): Add a unified `Get-BambuConfigDirs` entry point: iterate both candidate directories `BambuStudio` + `BambuStudioBeta`, returning all that exist; change all the above consumers to foreach dual-channel iteration so both version channels behave identically

---

#160 ✅
**Symptom**: Running `bash install.sh` on Linux reports a string of syntax errors (e.g. `syntax error near unexpected token $'\r'`), and the script can't execute at all
**Root Cause**: The .sh files in the repo are saved with CRLF (Windows newlines); bash treats each line's trailing `\r` as part of the command. v5.39.0's install.sh/reinstall.sh/uninstall.sh were generated in a Windows environment and didn't keep LF
**Solution** (v5.45.0): Convert all three .sh files to LF; add `*.sh text eol=lf` to .gitattributes to prevent regression (be careful not to convert back to CRLF when editing .sh files)

---

#161 ✅
**Symptom**: In cascade mode, Bridge A requesting Bridge B's `/server/info` reports `Invalid response body while trying to fetch http://127.0.0.1:13629/server/info: incorrect header check`; `curl --compressed` direct to B also returns empty
**Root Cause**: proxyToMoonraker requests Moonraker with node-fetch v2 (default compress:true, auto-decompresses gzip); `r.arrayBuffer()` gets the already-decompressed plaintext. But when forwarding the response, it copies all upstream response headers (including `content-encoding: gzip` and `content-length`), emitting an inconsistent response that "claims gzip but is actually plaintext". Any client honoring content-encoding (node-fetch / curl --compressed / browser fetch) tries to gunzip the plaintext → zlib "incorrect header check". In non-cascade mode, BambuStudio's HTTP client happens to not send accept-encoding or ignores that header, so it stays latent; cascade A→B uses node-fetch which automatically sends `accept-encoding: gzip`, always reproducing it
**Solution** (v5.46.0): In server.js, add `"content-encoding"`, `"content-length"` to the skipHeaders arrays of the two proxies (proxyToMoonraker + webcam) — the body is already decompressed, so the original encoding headers must be stripped

---

#162 ✅
**Symptom**: Using BRIDGE_PORT to start a second Bridge instance for cascade testing (A:13630 → B:13629 → printer), A/B overwrite each other's connection targets while running — after A saves its upstream config, B becomes cascade mode too once it restarts
**Root Cause**: APPDATA_DIR is fixed to `%APPDATA%\BambuStudio-Bridge`; BRIDGE_PORT only overrides the port. loadConfig/saveConfig and bridge.log all land in the same directory, so the two instances share state
**Solution** (v5.46.0): server.js supports the `BRIDGE_CONFIG_DIR` environment variable to override the config directory (paired with BRIDGE_PORT). Cascade testing: B uses `$env:BRIDGE_CONFIG_DIR="$env:TEMP\bridge-test-b"`, A uses `...\bridge-test-a`, each isolating bridge_config.json + bridge.log

---

#163 ✅
**Symptom**: v5.45.0 verification records "52 unit tests all pass", but during v5.46.0 development `npm test` only runs 29 — only 2 of the 3 test files under test/ are executed
**Root Cause**: The package.json test script (`node --test test/patch_gcode.test.js test/convert_gcode.test.js`) lost test/net_utils.test.js during past edits (when v5.44.0 added that file it wasn't synced into the script, or a later edit overwrote it); test coverage silently shrank by 23 cases with no error
**Solution** (v5.46.0): Complete the test script as `node --test test/patch_gcode.test.js test/convert_gcode.test.js test/net_utils.test.js`, restoring 52/52; a more robust approach is to change to the `node --test test/` directory form, automatically including newly added test files

---

#164 ✅
**Symptom**: When the BambuStudio project configures 8-color filament but the print actually uses colors 2/4/6/8, the filament mapping in the Device tab's print confirmation dialog only shows the first 4 rows (the gcode's first 4 slots); colors 6/8 (indices 5/7) can't be mapped nor manually changed — the colors of slots 4-7 are silently dropped
**Root Cause**: webui.html `showPrintDialog`/`refreshMapStatus`/`doPrint` hardcode the gcode logical slot count to 4 in three places (`for i<4` / `filamentMap=[0,1,2,3]`), while BambuStudio metadata (`filament_type`/`filament_colour`/`filament_used_mm`, semicolon-separated) returns entries per project slot count (an 8-slot project returns 8 entries). Slots with index ≥4 don't get mapping rows rendered, don't participate in auto-matching, and don't enter `extruder_map_table`. The data pipeline itself is fine: `patchGcodeLayout()` fully moves the CONFIG_BLOCK to the end of the file, and Moonraker can parse all 8 metadata entries; server.js command construction (`SET_PRINT_EXTRUDER_MAP` sent item by item) natively supports mapTables of any length. Two additional related bugs: ①auto-matching also assigns physical slots to unused slots, stealing the best color match from used slots; ②mapTable sends all first-4 slots (including unused), and `SET_PRINT_USED_EXTRUDERS` derives from it, marking unused physical heads as used
**Solution** (v5.48.0): webui.html introduces dynamic slot calculation — `gCount = max(three metadata array lengths)`, `mapRowIdx` filters by actual usage (when `filament_used_mm` data exists, only include slots with used>0; when no usage data, fall back to including all slots that have a type); `filamentMap` initializes with `k%4` (the 4 physical slots remain hardcoded; the U1 is a 4-head machine); rendering/auto-matching/`refreshMapStatus`/`doPrint` all iterate `mapRowIdx`. After the fix, the 8-slot-4-color scenario renders exactly 4 mapping rows (only containing actually used slots), and `SET_PRINT_USED_EXTRUDERS` only marks the physical heads truly in use. Note: the desktop native dialog path (dialog.js) doesn't do color mapping (uses Klipper default mapping); for >4-slot gcode, use the Device tab WebUI confirmation dialog
