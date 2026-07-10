const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeExtruderMapTable,
  startPrintWithOptions,
} = require("../print_job");

describe("normalizeExtruderMapTable", () => {
  it("converts the native compact mapping form and skips unused slots", () => {
    assert.deepEqual(
      normalizeExtruderMapTable([1, 0, -1, 3]),
      [[0, 1], [1, 0], [3, 3]]
    );
  });

  it("accepts the WebUI pair form", () => {
    assert.deepEqual(
      normalizeExtruderMapTable("[[0,2],[1,2]]"),
      [[0, 2], [1, 2]]
    );
  });

  it("rejects invalid or out-of-range mappings", () => {
    assert.throws(() => normalizeExtruderMapTable([[0, 4]]), /out of range/);
    assert.throws(() => normalizeExtruderMapTable({ logical: 0, physical: 1 }), /must be an array/);
  });
});

describe("startPrintWithOptions", () => {
  it("runs mapping, used-extruder, preferences, and start commands in order", async () => {
    const calls = [];
    const output = await startPrintWithOptions(
      "jobs/test.gcode",
      {
        mappings: [1, 0, -1, -1],
        auto_bed_leveling: true,
        flow_calibrate: false,
        time_lapse_camera: true,
      },
      {
        sendGcode: async (command) => { calls.push(["gcode", command]); },
        callMoonrakerJsonRpc: async (method, params) => {
          calls.push(["rpc", method, params]);
          if (method === "printer.objects.query") {
            return { status: { print_stats: { state: "standby" } } };
          }
          return { started: true };
        },
      }
    );

    assert.deepEqual(calls, [
      ["rpc", "printer.objects.query", { objects: { print_stats: ["state"] } }],
      ["gcode", "SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=0 MAP_EXTRUDER=1"],
      ["gcode", "SET_PRINT_EXTRUDER_MAP CONFIG_EXTRUDER=1 MAP_EXTRUDER=0"],
      ["gcode", "SET_PRINT_USED_EXTRUDERS EXTRUDERS=0,1"],
      ["gcode", "SET_PRINT_PREFERENCES BED_LEVEL=1 FLOW_CALIBRATE=0 TIME_LAPSE_CAMERA=1"],
      ["rpc", "printer.print.start", { filename: "jobs/test.gcode" }],
    ]);
    assert.deepEqual(output.result, { started: true });
    assert.equal(output.initialPrintState, "standby");
  });

  it("starts without mapping commands when no map is supplied", async () => {
    const commands = [];
    await startPrintWithOptions(
      "single.gcode",
      { autoBedLeveling: false, flowCalibration: true, timelapse: false },
      {
        sendGcode: async (command) => { commands.push(command); },
        callMoonrakerJsonRpc: async (method) => {
          if (method === "printer.objects.query") {
            return { status: { print_stats: { state: "complete" } } };
          }
          return "ok";
        },
      }
    );
    assert.deepEqual(commands, [
      "SET_PRINT_PREFERENCES BED_LEVEL=0 FLOW_CALIBRATE=1 TIME_LAPSE_CAMERA=0",
    ]);
  });

  it("blocks a busy printer before any mapping, preference, or print-start side effect", async () => {
    const gcodeCommands = [];
    const rpcCalls = [];

    await assert.rejects(
      startPrintWithOptions(
        "busy.gcode",
        { mappings: [1, 0], autoBedLeveling: true },
        {
          sendGcode: async (command) => { gcodeCommands.push(command); },
          callMoonrakerJsonRpc: async (method, params) => {
            rpcCalls.push([method, params]);
            return { status: { print_stats: { state: "printing" } } };
          },
        }
      ),
      (error) => error.code === "printer_busy" && error.printState === "printing"
    );

    assert.deepEqual(gcodeCommands, []);
    assert.deepEqual(rpcCalls, [
      ["printer.objects.query", { objects: { print_stats: ["state"] } }],
    ]);
  });

  it("fails closed with zero command side effects when the state query fails", async () => {
    const gcodeCommands = [];
    const rpcCalls = [];

    await assert.rejects(
      startPrintWithOptions(
        "unknown.gcode",
        { mappings: [1], flowCalibration: true },
        {
          sendGcode: async (command) => { gcodeCommands.push(command); },
          callMoonrakerJsonRpc: async (method, params) => {
            rpcCalls.push([method, params]);
            throw new Error("Moonraker timeout");
          },
        }
      ),
      (error) => error.code === "printer_state_unavailable" && /Moonraker timeout/.test(error.message)
    );

    assert.deepEqual(gcodeCommands, []);
    assert.deepEqual(rpcCalls, [
      ["printer.objects.query", { objects: { print_stats: ["state"] } }],
    ]);
  });

  it("fails closed when print_stats.state is missing", async () => {
    let sideEffects = 0;
    await assert.rejects(
      startPrintWithOptions(
        "missing-state.gcode",
        {},
        {
          sendGcode: async () => { sideEffects += 1; },
          callMoonrakerJsonRpc: async () => ({ status: { print_stats: {} } }),
        }
      ),
      (error) => error.code === "printer_state_unavailable"
    );
    assert.equal(sideEffects, 0);
  });
});
