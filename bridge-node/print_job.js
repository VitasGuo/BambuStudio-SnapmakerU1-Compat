function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return !!fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

const SAFE_PRINT_STATES = new Set(["standby", "complete", "cancelled", "error"]);

function printerStateError(message, code, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

/**
 * Query print_stats before changing any printer-side mapping or preference.
 * Unknown/missing states and transport errors fail closed so a stale UI cannot
 * mutate the active job before Moonraker rejects printer.print.start.
 */
async function assertPrinterCanStart(callMoonrakerJsonRpc) {
  let response;
  try {
    response = await callMoonrakerJsonRpc("printer.objects.query", {
      objects: { print_stats: ["state"] },
    });
  } catch (cause) {
    throw printerStateError(
      `Unable to verify printer state: ${cause && cause.message ? cause.message : String(cause)}`,
      "printer_state_unavailable",
      cause
    );
  }

  const rawState = response && response.status && response.status.print_stats
    ? response.status.print_stats.state
    : undefined;
  const state = typeof rawState === "string" ? rawState.trim().toLowerCase() : "";
  if (!state) {
    throw printerStateError(
      "Unable to verify printer state: print_stats.state is missing",
      "printer_state_unavailable"
    );
  }
  if (!SAFE_PRINT_STATES.has(state)) {
    const error = printerStateError(
      `Printer is busy (print_stats.state=${state})`,
      "printer_busy"
    );
    error.printState = state;
    throw error;
  }
  return state;
}

/**
 * Accept either WebUI pairs ([[logical, physical], ...]) or the compact
 * native-helper form ([physicalForLogical0, ...], where -1 means unused).
 */
function normalizeExtruderMapTable(value) {
  if (value === undefined || value === null || value === "") return [];

  let input = value;
  if (typeof input === "string") {
    if (input.length > 4096) throw new Error("extruder_map_table too large");
    input = JSON.parse(input);
  }
  if (!Array.isArray(input)) throw new Error("extruder_map_table must be an array");

  const pairs = input.every((entry) => !Array.isArray(entry))
    ? input.map((physical, logical) => [logical, physical]).filter(([, physical]) => Number(physical) !== -1)
    : input;

  return pairs.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error("each extruder mapping must be a [logical, physical] pair");
    }
    const logical = Number(entry[0]);
    const physical = Number(entry[1]);
    if (!Number.isInteger(logical) || logical < 0 || logical > 3) {
      throw new Error(`logical extruder out of range: ${entry[0]}`);
    }
    if (!Number.isInteger(physical) || physical < 0 || physical > 3) {
      throw new Error(`physical extruder out of range: ${entry[1]}`);
    }
    return [logical, physical];
  });
}

/**
 * Apply mappings and print preferences in the same order for every caller,
 * then start the uploaded file through Moonraker's JSON-RPC API.
 */
async function startPrintWithOptions(filename, options = {}, dependencies = {}) {
  if (!filename || typeof filename !== "string") throw new Error("filename is required");
  if (typeof dependencies.sendGcode !== "function") throw new Error("sendGcode dependency is required");
  if (typeof dependencies.callMoonrakerJsonRpc !== "function") {
    throw new Error("callMoonrakerJsonRpc dependency is required");
  }

  const mapTable = normalizeExtruderMapTable(
    options.extruderMapTable ?? options.extruder_map_table ?? options.mappings
  );
  const bedLevel = normalizeBoolean(options.autoBedLeveling ?? options.auto_bed_leveling);
  const flowCalibrate = normalizeBoolean(options.flowCalibration ?? options.flow_calibrate);
  const timelapse = normalizeBoolean(options.timelapse ?? options.time_lapse_camera);

  // This read-only guard must remain before the first sendGcode call. Mapping
  // and preference commands affect global printer state, even if print.start
  // later refuses to replace an active print.
  const initialPrintState = await assertPrinterCanStart(dependencies.callMoonrakerJsonRpc);

  for (const [logical, physical] of mapTable) {
    await dependencies.sendGcode(
      `SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=${logical} MAP_EXTRUDER=${physical}`
    );
  }
  if (mapTable.length > 0) {
    const usedExtruders = [...new Set(mapTable.map(([, physical]) => physical))].sort((a, b) => a - b);
    await dependencies.sendGcode(`SET_PRINT_USED_EXTRUDERS EXTRUDERS=${usedExtruders.join(",")}`);
  }
  await dependencies.sendGcode(
    `SET_PRINT_PREFERENCES BED_LEVEL=${bedLevel ? 1 : 0} ` +
    `FLOW_CALIBRATE=${flowCalibrate ? 1 : 0} TIME_LAPSE_CAMERA=${timelapse ? 1 : 0}`
  );

  const result = await dependencies.callMoonrakerJsonRpc("printer.print.start", { filename });
  return { result, mapTable, bedLevel, flowCalibrate, timelapse, initialPrintState };
}

module.exports = {
  SAFE_PRINT_STATES,
  assertPrinterCanStart,
  normalizeBoolean,
  normalizeExtruderMapTable,
  startPrintWithOptions,
};
