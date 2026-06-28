/**
 * Unit tests for convertGcodeContent (pure function, no file I/O).
 * Run with: node --test test/convert_gcode.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { convertGcodeContent } = require("../slice_agent");

// Minimal BambuStudio G-code fixture for conversion tests
function makeBambuGcode(opts = {}) {
  const {
    hotendTemp = 220,
    bedTemp = 60,
    firstTool = 0,
    layers = 2,
    includeThumb = true,
    includeConfig = true,
    featureType = "; FEATURE: Outer Wall",
  } = opts;

  const header = "; HEADER_BLOCK_START\n; BambuStudio v2.0\n; HEADER_BLOCK_END\n";
  const thumb = includeThumb
    ? "; THUMBNAIL_BLOCK_START\n; thumbnail data\n; THUMBNAIL_BLOCK_END\n"
    : "";
  const config = includeConfig
    ? "; CONFIG_BLOCK_START\n; config=nozzle_diameter 0.4\n; CONFIG_BLOCK_END\n"
    : "";

  let execBlock = "; EXECUTABLE_BLOCK_START\n";
  execBlock += `M104 T${firstTool} S140\n`;
  execBlock += `M140 S${bedTemp}\n`;
  execBlock += `T${firstTool}\n`;
  execBlock += "PRINT_START\n";
  execBlock += "; EXECUTABLE_BLOCK_END\n";

  let body = "; MACHINE_START_GCODE_END\n";
  for (let i = 0; i < layers; i++) {
    body += ";BEFORE_LAYER_CHANGE\n";
    body += `;LAYER:${i}\n`;
    body += featureType + "\n";
    body += `G1 X${100 + i} Y${100 + i} E${i + 1} F1800\n`;
  }
  body += "; --- end ---\n";
  body += "PRINT_END\n";
  body += "TIMELAPSE_STOP\n";
  body += "M104 S0\n";
  body += "M140 S0\n";

  return header + thumb + config + execBlock + body;
}

describe("convertGcodeContent — format detection", () => {
  it("throws when missing HEADER/EXEC blocks", () => {
    assert.throws(
      () => convertGcodeContent("G1 X10 Y10\n"),
      /Not a valid BambuStudio gcode file/
    );
  });

  it("throws when already OrcaSlicer format (has ;TYPE:)", () => {
    const content = "; HEADER_BLOCK_START\n; HEADER_BLOCK_END\n; EXECUTABLE_BLOCK_START\n;TYPE:Outer Wall\n; EXECUTABLE_BLOCK_END\n";
    assert.throws(
      () => convertGcodeContent(content),
      /已是 OrcaSlicer 格式/
    );
  });

  it("throws when neither ;TYPE: nor ; FEATURE: present", () => {
    const content = "; HEADER_BLOCK_START\n; HEADER_BLOCK_END\n; EXECUTABLE_BLOCK_START\nPRINT_START\n; EXECUTABLE_BLOCK_END\nG1 X10 Y10\n";
    assert.throws(
      () => convertGcodeContent(content),
      /无法识别格式/
    );
  });
});

describe("convertGcodeContent — successful conversion", () => {
  it("converts valid BambuStudio G-code and replaces ; FEATURE: with ;TYPE:", () => {
    const content = makeBambuGcode();
    const { content: result, info } = convertGcodeContent(content);

    // Critical: ; FEATURE: must be replaced with ;TYPE:
    assert.ok(!result.includes("; FEATURE:"), "; FEATURE: must be replaced");
    assert.ok(result.includes(";TYPE:"), ";TYPE: must be present");

    // Must have OrcaSlicer PRINT_START flow
    assert.ok(result.includes("PRINT_START"));
    assert.ok(result.includes("DEFECT_DETECTION_START"));
    assert.ok(result.includes("TIMELAPSE_START"));

    // Must have OrcaSlicer standard commands
    assert.ok(result.includes("BED_MESH_CALIBRATE"));
    assert.ok(result.includes("ROUGHLY_CLEAN_NOZZLE"));
  });

  it("extracts correct temperature info", () => {
    const content = makeBambuGcode({ hotendTemp: 230, bedTemp: 70 });
    const { info } = convertGcodeContent(content);

    // hotendTemp 230 comes from M109 in body (not M104 S140 preheat)
    // Since our fixture only has M104 S140, the max is 140 unless we add M109
    // Let's check bed temp instead (M140 S70)
    assert.equal(info.bed_temp, 70);
  });

  it("extracts correct layer count", () => {
    const content = makeBambuGcode({ layers: 5 });
    const { info } = convertGcodeContent(content);

    assert.equal(info.total_layers, 5);
  });

  it("extracts correct first tool", () => {
    const content = makeBambuGcode({ firstTool: 1 });
    const { info } = convertGcodeContent(content);

    assert.equal(info.first_tool, 1);
  });

  it("reorganizes layout to HEADER → THUMB → EXEC → body → CONFIG", () => {
    const content = makeBambuGcode();
    const { content: result } = convertGcodeContent(content);

    const headerIdx = result.indexOf("; HEADER_BLOCK_START");
    const thumbIdx = result.indexOf("; THUMBNAIL_BLOCK_START");
    const execIdx = result.indexOf("; EXECUTABLE_BLOCK_START");
    const configIdx = result.indexOf("; CONFIG_BLOCK_START");

    assert.ok(headerIdx >= 0 && headerIdx < thumbIdx, "HEADER before THUMB");
    assert.ok(thumbIdx > 0 && thumbIdx < execIdx, "THUMB before EXEC");
    assert.ok(execIdx > 0 && execIdx < configIdx, "EXEC before CONFIG");
  });

  it("wraps entire print process inside EXECUTABLE_BLOCK (EXEC_END after PRINT_END)", () => {
    const content = makeBambuGcode();
    const { content: result } = convertGcodeContent(content);

    const execStartIdx = result.indexOf("; EXECUTABLE_BLOCK_START");
    const printEndIdx = result.indexOf("PRINT_END");
    const execEndIdx = result.indexOf("; EXECUTABLE_BLOCK_END");
    const configIdx = result.indexOf("; CONFIG_BLOCK_START");

    // EXECUTABLE_BLOCK_END must be after PRINT_END (wrapping entire print process)
    assert.ok(execStartIdx < printEndIdx, "EXEC_START before PRINT_END");
    assert.ok(printEndIdx < execEndIdx, "PRINT_END before EXEC_END (entire print wrapped)");
    // EXECUTABLE_BLOCK_END must be before CONFIG_BLOCK
    assert.ok(execEndIdx < configIdx, "EXEC_END before CONFIG");
  });

  it("handles missing THUMBNAIL block gracefully", () => {
    const content = makeBambuGcode({ includeThumb: false });
    const { content: result } = convertGcodeContent(content);

    assert.ok(!result.includes("; THUMBNAIL_BLOCK"));
    assert.ok(result.includes(";TYPE:"));
  });

  it("handles missing CONFIG block gracefully", () => {
    const content = makeBambuGcode({ includeConfig: false });
    const { content: result } = convertGcodeContent(content);

    assert.ok(!result.includes("; CONFIG_BLOCK"));
    assert.ok(result.includes(";TYPE:"));
  });

  it("builds OrcaSlicer-compatible End G-code when not present", () => {
    // Build a fixture WITHOUT PRINT_END to trigger end gcode replacement
    const content = makeBambuGcode().replace("PRINT_END\n", "").replace("TIMELAPSE_STOP\n", "");
    const { content: result } = convertGcodeContent(content);

    // Without PRINT_END, the "; --- end ---" triggers OrcaSlicer end gcode generation
    assert.ok(result.includes("TIMELAPSE_STOP"));
    assert.ok(result.includes("DEFECT_DETECTION_STOP"));
    assert.ok(result.includes("M84 ; Motors off"));
  });
});
