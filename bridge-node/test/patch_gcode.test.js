/**
 * Unit tests for patchGcodeContent (pure function, no file I/O).
 * Run with: node --test test/patch_gcode.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { patchGcodeContent } = require("../slice_agent");

describe("patchGcodeContent — empty/edge cases", () => {
  it("returns content unchanged when patchPlan is empty", () => {
    const content = "G1 X10 Y10 F1800\n";
    const result = patchGcodeContent(content, []);
    assert.equal(result.content, content);
    assert.equal(result.patchesApplied, 0);
  });

  it("returns content unchanged when patchPlan is null", () => {
    const content = "G1 X10 Y10 F1800\n";
    const result = patchGcodeContent(content, null);
    assert.equal(result.content, content);
    assert.equal(result.patchesApplied, 0);
  });
});

describe("patchGcodeContent — replace_speed", () => {
  it("replaces all F1800 with F1200 globally", () => {
    const content = "G1 X10 Y10 E1 F1800\nG1 X20 Y20 E2 F1800\n";
    const result = patchGcodeContent(content, [
      { operation: "replace_speed", original_speed: "F1800", new_speed: "F1200" },
    ]);
    assert.ok(!result.content.includes("F1800"), "F1800 should be replaced");
    assert.equal(result.content.match(/F1200/g).length, 2);
    assert.equal(result.patchesApplied, 1);
  });

  it("auto-converts mm/s to mm/min (F500 → F30000)", () => {
    const content = "G1 X10 Y10 E1 F30000\n"; // F30000 = F500 mm/s * 60
    const result = patchGcodeContent(content, [
      { operation: "replace_speed", original_speed: "500", new_speed: "400" },
    ]);
    // origF "500" < 1000 → convert to F30000, newF "400" → F24000
    assert.ok(result.content.includes("F24000"), "newF should be F24000 (400*60)");
    assert.equal(result.patchesApplied, 1);
  });

  it("replaces speed only in overhang regions when target=overhang_regions", () => {
    const content = [
      "G1 X10 Y10 E1 F1800",
      "; overhang region",
      "G1 X20 Y20 E2 F1800",
      "; FEATURE: Inner Wall",
      "G1 X30 Y30 E3 F1800",
    ].join("\n");
    // Use F1500 (>1000) to avoid mm/s auto-conversion
    const result = patchGcodeContent(content, [
      { operation: "replace_speed", original_speed: "F1800", new_speed: "F1500", target: "overhang_regions" },
    ]);
    // Only the line after "overhang" should be replaced
    const lines = result.content.split("\n");
    assert.equal(lines[0], "G1 X10 Y10 E1 F1800", "line before overhang unchanged");
    assert.equal(lines[2], "G1 X20 Y20 E2 F1500", "line after overhang replaced");
    assert.equal(lines[4], "G1 X30 Y30 E3 F1800", "line after overhang cleared unchanged");
  });

  it("skips when missing original_speed or new_speed", () => {
    const content = "G1 X10 Y10 F1800\n";
    const result = patchGcodeContent(content, [
      { operation: "replace_speed", new_speed: "F1200" },
    ]);
    assert.equal(result.patchesApplied, 0);
    assert.equal(result.content, content);
  });
});

describe("patchGcodeContent — add_retract", () => {
  it("inserts retract before long travel moves", () => {
    // Travel from (10,10) to (100,100) = ~127mm > 5mm default threshold
    const content = [
      "G1 X10 Y10 E1 F1800",
      "G0 X100 Y100 F6000",  // long travel, no E
      "G1 X110 Y110 E2 F1800",
    ].join("\n");
    const result = patchGcodeContent(content, [
      { operation: "add_retract", retract_length: 0.8 },
    ]);
    assert.ok(result.content.includes("G1 E-0.8 F2400"), "retract line should be inserted");
    assert.equal(result.patchesApplied, 1);
  });

  it("does NOT insert retract for short travel moves (<5mm)", () => {
    // Travel from (10,10) to (12,12) = ~2.8mm < 5mm
    const content = [
      "G1 X10 Y10 E1 F1800",
      "G0 X12 Y12 F6000",
      "G1 X14 Y14 E2 F1800",
    ].join("\n");
    const result = patchGcodeContent(content, [
      { operation: "add_retract", retract_length: 0.8 },
    ]);
    assert.ok(!result.content.includes("G1 E-0.8"), "no retract for short travel");
    assert.equal(result.patchesApplied, 0);
  });

  it("respects custom min_travel_length", () => {
    // Travel from (10,10) to (15,15) = ~7mm > 5mm default but < 10mm custom
    const content = [
      "G1 X10 Y10 E1 F1800",
      "G0 X15 Y15 F6000",
      "G1 X16 Y16 E2 F1800",
    ].join("\n");
    const result = patchGcodeContent(content, [
      { operation: "add_retract", retract_length: 0.8, min_travel_length: 10.0 },
    ]);
    assert.ok(!result.content.includes("G1 E-0.8"), "no retract when below custom threshold");
    assert.equal(result.patchesApplied, 0);
  });
});

describe("patchGcodeContent — replace_fan", () => {
  it("replaces all M106 Sxxx globally", () => {
    const content = "M106 S128\nG1 X10 Y10\nM106 S255\n";
    const result = patchGcodeContent(content, [
      { operation: "replace_fan", new_fan_speed: "200" },
    ]);
    assert.equal(result.content.match(/M106 S200/g).length, 2);
    assert.ok(!result.content.includes("S128") && !result.content.includes("S255"));
    assert.equal(result.patchesApplied, 1);
  });

  it("inserts fan boost after overhang layers when target=overhang_layers", () => {
    const content = [
      "; overhang layer",
      "G1 X10 Y10 F1800",
      "; FEATURE: Inner Wall",
      "G1 X20 Y20 F1800",
    ].join("\n");
    const result = patchGcodeContent(content, [
      { operation: "replace_fan", new_fan_speed: "255", target: "overhang_layers" },
    ]);
    assert.ok(result.content.includes("M106 S255 ; agent: overhang fan boost"));
    assert.equal(result.patchesApplied, 1);
  });
});

describe("patchGcodeContent — modify_temperature", () => {
  it("replaces hotend temp globally", () => {
    const content = "M104 S200\nM109 S220\nG1 X10 Y10\n";
    const result = patchGcodeContent(content, [
      { operation: "modify_temperature", new_hotend_temp: "230" },
    ]);
    assert.ok(result.content.includes("M104 S230"));
    assert.ok(result.content.includes("M109 S230"));
    assert.ok(!result.content.includes("S200") && !result.content.includes("S220"));
  });

  it("replaces hotend temp only in first 3 layers when target=first_3_layers", () => {
    const content = [
      "M104 S200",
      ";LAYER:0",
      "M109 S200",
      ";LAYER:1",
      "M104 S200",
      ";LAYER:2",
      "M104 S200",
      ";LAYER:3",
      "M104 S200",  // this should NOT be replaced (layer 4)
    ].join("\n");
    const result = patchGcodeContent(content, [
      { operation: "modify_temperature", new_hotend_temp: "210", target: "first_3_layers" },
    ]);
    const lines = result.content.split("\n");
    // Layer 0-2 (indices 0-6) should be replaced, layer 3 (index 8) should not
    assert.ok(lines[0].includes("S210"), "M104 before LAYER:0 replaced");
    assert.ok(lines[8].includes("S200"), "M104 after LAYER:3 unchanged");
  });

  it("replaces bed temp when new_bed_temp is specified", () => {
    const content = "M140 S60\nM190 S60\nG1 X10 Y10\n";
    const result = patchGcodeContent(content, [
      { operation: "modify_temperature", new_hotend_temp: "220", new_bed_temp: "70" },
    ]);
    assert.ok(result.content.includes("M140 S70"));
    assert.ok(result.content.includes("M190 S70"));
  });
});

describe("patchGcodeContent — insert_line", () => {
  it("inserts a new line after matching pattern", () => {
    const content = "G1 X10 Y10 F1800\nG1 X20 Y20 F1800\n";
    const result = patchGcodeContent(content, [
      { operation: "insert_line", after_pattern: "G1 X10", insert_text: "M106 S255" },
    ]);
    const lines = result.content.split("\n");
    assert.equal(lines[0], "G1 X10 Y10 F1800");
    assert.equal(lines[1], "M106 S255");
    assert.equal(lines[2], "G1 X20 Y20 F1800");
    assert.equal(result.patchesApplied, 1);
  });

  it("inserts after every matching occurrence", () => {
    const content = ";LAYER:0\n;LAYER:1\n;LAYER:2\n";
    const result = patchGcodeContent(content, [
      { operation: "insert_line", after_pattern: ";LAYER:", insert_text: ";TYPE:Outer" },
    ]);
    assert.equal(result.patchesApplied, 3);
    assert.equal(result.content.split(";TYPE:Outer").length - 1, 3);
  });

  it("does nothing when pattern not found", () => {
    const content = "G1 X10 Y10\n";
    const result = patchGcodeContent(content, [
      { operation: "insert_line", after_pattern: "NONEXISTENT", insert_text: "M106 S255" },
    ]);
    assert.equal(result.patchesApplied, 0);
    assert.equal(result.content, content);
  });
});
