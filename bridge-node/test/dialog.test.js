const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PassThrough } = require("stream");
const {
  autoMapFilaments,
  buildDialogInitData,
  buildGcodeFilaments,
  buildMacDialogPayload,
  buildMachineFilaments,
  fetchGcodeMetadata,
  findMacDialogHelper,
  showMacDialog,
} = require("../dialog");

function makeInitData() {
  return {
    filename: "folder/test.gcode",
    filaments: [
      { label: "PLA", exist: true, state: "Loaded" },
      { label: "PETG", exist: false, state: "Empty" },
    ],
    auto_bed_leveling: true,
    flow_calibrate: false,
    time_lapse_camera: true,
  };
}

function fakeExecFile({ stdout = "", stderr = "", error = null, onInput }) {
  return (executable, args, options, callback) => {
    const stdin = new PassThrough();
    let input = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => { input += chunk; });
    stdin.on("end", () => {
      if (onInput) onInput({ executable, args, options, input });
      setImmediate(() => callback(error, stdout, stderr));
    });
    return { stdin };
  };
}

describe("macOS dialog helper discovery", () => {
  it("treats U1_DIALOG_HELPER as authoritative", () => {
    assert.equal(
      findMacDialogHelper({ env: { U1_DIALOG_HELPER: "/custom/U1Dialog" } }),
      path.resolve("/custom/U1Dialog")
    );
  });

  it("finds the helper in an app bundle Resources directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "u1-dialog-bundle-"));
    try {
      const contents = path.join(root, "Snapmaker U1 Bridge.app", "Contents");
      const moduleDir = path.join(contents, "Resources", "Payload", "bridge-node");
      const helper = path.join(contents, "Resources", "Helpers", "U1PrintDialog");
      fs.mkdirSync(moduleDir, { recursive: true });
      fs.mkdirSync(path.dirname(helper), { recursive: true });
      fs.writeFileSync(helper, "fixture");

      assert.equal(
        findMacDialogHelper({ env: {}, moduleDir, execPath: "", mainPath: "", dataDir: root }),
        helper
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("macOS dialog JSON protocol", () => {
  it("writes one JSON request to stdin and accepts the Swift response shape", async () => {
    let request;
    const result = await showMacDialog(makeInitData(), {
      helperPath: "/fixture/SnapmakerU1DialogHelper",
      execFileImpl: fakeExecFile({
        stdout: JSON.stringify({
          confirmed: true,
          mappings: [1, 0, -1, -1],
          bedLeveling: false,
          flowCalibration: true,
          timelapse: false,
        }),
        onInput: ({ input, args }) => {
          request = JSON.parse(input);
          assert.deepEqual(args, []);
        },
      }),
    });

    assert.equal(request.protocolVersion, 1);
    assert.equal(request.type, "printConfirmation");
    assert.equal(request.filename, "folder/test.gcode");
    assert.deepEqual(request.filaments, makeInitData().filaments);
    assert.equal(request.bedLeveling, true);
    assert.equal(request.flowCalibration, false);
    assert.equal(request.timelapse, true);

    assert.deepEqual(result, {
      auto_bed_leveling: false,
      flow_calibrate: true,
      time_lapse_camera: false,
      selected_extruders: [1, 0],
      mappings: [1, 0, -1, -1],
      extruder_map_table: [[0, 1], [1, 0]],
    });
  });

  it("maps an explicit native cancellation to null", async () => {
    const result = await showMacDialog(makeInitData(), {
      helperPath: "/fixture/SnapmakerU1DialogHelper",
      execFileImpl: fakeExecFile({ stdout: JSON.stringify({ confirmed: false }) }),
    });
    assert.equal(result, null);
  });

  it("accepts a native mappingTable containing only active logical slots", async () => {
    const result = await showMacDialog(makeInitData(), {
      helperPath: "/fixture/SnapmakerU1DialogHelper",
      execFileImpl: fakeExecFile({
        stdout: JSON.stringify({
          confirmed: true,
          mappings: [2, -1, -1, -1],
          mappingTable: [[0, 2]],
          selected_extruders: [2],
          bedLeveling: true,
          flowCalibration: false,
          timelapse: true,
        }),
      }),
    });
    assert.deepEqual(result.extruder_map_table, [[0, 2]]);
    assert.deepEqual(result.selected_extruders, [2]);
  });

  it("marks malformed helper output so the server keeps the WebUI print pending", async () => {
    await assert.rejects(
      showMacDialog(makeInitData(), {
        helperPath: "/fixture/SnapmakerU1DialogHelper",
        execFileImpl: fakeExecFile({ stdout: "not-json" }),
      }),
      (error) => error.code === "invalid_helper_response" && error.keepPending === true
    );
  });

  it("marks helper launch failures so the server keeps the WebUI print pending", async () => {
    const launchError = Object.assign(new Error("not found"), { code: "ENOENT" });
    await assert.rejects(
      showMacDialog(makeInitData(), {
        helperPath: "/missing/SnapmakerU1DialogHelper",
        execFileImpl: fakeExecFile({ error: launchError }),
      }),
      (error) => error.code === "helper_failed" && error.keepPending === true
    );
  });

  it("builds both portable and Swift-friendly input field names", () => {
    const payload = buildMacDialogPayload(makeInitData());
    assert.equal(payload.auto_bed_leveling, payload.bedLeveling);
    assert.equal(payload.flow_calibrate, payload.flowCalibration);
    assert.equal(payload.time_lapse_camera, payload.timelapse);
    assert.deepEqual(payload.gcodeFilaments, makeInitData().filaments);
    assert.deepEqual(payload.mappings, [0, 1, 2, 3]);
  });

  it("builds a Swift payload with explicit usage and material metadata", () => {
    const initData = buildDialogInitData(
      "safe.gcode",
      {
        filament_type: ["PLA", "PETG", "", ""],
        filament_sub_type: ["Basic", "HF", "", ""],
        filament_exist: [true, true, false, false],
      },
      {
        filament_type: "PLA;PETG;;",
        filament_name: "Basic;HF;;",
        filament_colour: "#FFFFFF;#000000;;",
      }
    );
    const payload = buildMacDialogPayload(initData);

    assert.equal(payload.gcodeFilaments.length, 4);
    assert.ok(payload.gcodeFilaments.every((filament) => typeof filament.used === "boolean"));
    assert.ok(payload.gcodeFilaments.some((filament) => filament.used));
    for (const filament of payload.gcodeFilaments.filter((item) => item.used)) {
      assert.ok(filament.type || filament.name || filament.label);
    }
    assert.equal(payload.machineFilaments.length, 4);
    assert.ok(payload.machineFilaments.every((filament) => typeof filament.loaded === "boolean"));
  });
});

describe("G-code metadata and automatic filament mapping", () => {
  it("fetches Moonraker metadata with an encoded filename and API key", async () => {
    let captured;
    const metadata = await fetchGcodeMetadata(
      "http://10.0.0.125:80",
      "gcodes/folder/model name.gcode",
      "secret",
      async (url, options) => {
        captured = { url, options };
        return {
          ok: true,
          json: async () => ({ result: { filament_type: "PLA;PETG" } }),
        };
      }
    );

    const requestUrl = new URL(captured.url);
    assert.equal(requestUrl.pathname, "/server/files/metadata");
    assert.equal(requestUrl.searchParams.get("filename"), "folder/model name.gcode");
    assert.equal(captured.options.headers["X-API-Key"], "secret");
    assert.equal(metadata.filament_type, "PLA;PETG");
  });

  it("prioritizes type+subtype, then loaded slots, and leaves unused logical slots unmapped", () => {
    const initData = buildDialogInitData(
      "multi.gcode",
      {
        filament_type: ["PLA", "PETG", "PLA", "PLA"],
        filament_sub_type: ["Basic", "HF", "Silk", "Basic"],
        filament_color_rgba: ["FFFFFFFF", "000000FF", "FF0000FF", "00FF00FF"],
        filament_exist: [true, true, true, false],
        auto_bed_leveling: true,
        flow_calibrate: false,
        time_lapse_camera: true,
      },
      {
        filament_type: "PLA;PETG;PLA;",
        filament_name: "\"Vendor PLA Silk\";\"Vendor PETG HF\";\"Vendor PLA Basic\";",
        filament_colour: "#FF0000;#000000;#FFFFFF;",
      }
    );

    assert.deepEqual(initData.mappings, [2, 1, 0, -1]);
    assert.equal(initData.gcodeFilaments[0].label, "Vendor PLA Silk");
    assert.equal(initData.machineFilaments[2].subtype, "Silk");
    assert.equal(initData.filaments, initData.gcodeFilaments);
  });

  it("uses a loaded slot before an empty slot for a type-only match", () => {
    const machine = buildMachineFilaments({
      filament_type: ["PLA", "PLA", "PETG", ""],
      filament_sub_type: ["Basic", "Silk", "Basic", ""],
      filament_exist: [false, true, true, false],
    });
    const gcode = buildGcodeFilaments({ filament_type: "PLA;;;" });
    assert.deepEqual(autoMapFilaments(gcode, machine), [1, -1, -1, -1]);
  });

  it("falls back to the first loaded slot when no material type matches", () => {
    const machine = buildMachineFilaments({
      filament_type: ["ABS", "", "PLA", ""],
      filament_exist: [false, false, true, false],
    });
    const gcode = buildGcodeFilaments({ filament_type: "TPU;;;" });
    assert.deepEqual(autoMapFilaments(gcode, machine), [2, -1, -1, -1]);
  });
});
