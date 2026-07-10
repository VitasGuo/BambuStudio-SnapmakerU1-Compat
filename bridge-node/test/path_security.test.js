const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  getGcodePath,
  isSafeGcodeName,
  resolveFileWithinRoot,
  setAppDataDir,
} = require("../slice_agent");

describe("AI Lab G-code path containment", () => {
  it("rejects POSIX, Windows, absolute, NUL, and overlong names", () => {
    assert.equal(isSafeGcodeName("model.gcode"), true);
    assert.equal(isSafeGcodeName("MODEL.GCODE"), true);
    assert.equal(isSafeGcodeName("bridge_config.json"), false);
    assert.equal(isSafeGcodeName("model.gcode.txt"), false);
    assert.equal(isSafeGcodeName("../bridge_config.json"), false);
    assert.equal(isSafeGcodeName("../../.ssh/id_rsa"), false);
    assert.equal(isSafeGcodeName("..\\bridge_config.json"), false);
    assert.equal(isSafeGcodeName("/etc/passwd"), false);
    assert.equal(isSafeGcodeName("bad\0name.gcode"), false);
    assert.equal(isSafeGcodeName("a".repeat(256)), false);
  });

  it("makes traversal fail closed before filesystem lookup", () => {
    assert.equal(getGcodePath("../../bridge_config.json"), null);
    assert.equal(getGcodePath("..\\..\\bridge_config.json"), null);
  });

  it("allows regular files inside the root and rejects symlink escapes", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "u1-path-security-"));
    const root = path.join(temp, "data");
    const outside = path.join(temp, "secret.txt");
    try {
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, "inside.gcode"), "G1 X1\n");
      fs.writeFileSync(outside, "secret\n");
      fs.symlinkSync(outside, path.join(root, "escape.gcode"));

      assert.equal(
        resolveFileWithinRoot(root, "inside.gcode"),
        fs.realpathSync(path.join(root, "inside.gcode")),
      );
      assert.equal(resolveFileWithinRoot(root, "escape.gcode"), null);
      assert.equal(resolveFileWithinRoot(root, "..", "secret.txt"), null);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it("resolves a safe AI Lab file after setting an isolated data root", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "u1-gcode-root-"));
    try {
      setAppDataDir(temp);
      const gcodeDir = path.join(temp, "gcode");
      const expected = path.join(gcodeDir, "safe.gcode");
      fs.writeFileSync(expected, "G1 X1\n");
      assert.equal(getGcodePath("safe.gcode"), fs.realpathSync(expected));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
