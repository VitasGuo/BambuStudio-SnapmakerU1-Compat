const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { getBridgeDataDir, getBambuStudioDataDir } = require("../paths");

describe("platform data paths", () => {
  it("uses Application Support/SnapmakerU1Bridge on macOS", () => {
    assert.equal(
      getBridgeDataDir({ platform: "darwin", env: {}, homeDir: "/Users/tester" }),
      path.join("/Users/tester", "Library", "Application Support", "SnapmakerU1Bridge")
    );
  });

  it("uses U1_BRIDGE_DATA_DIR as the highest-priority override", () => {
    assert.equal(
      getBridgeDataDir({
        platform: "darwin",
        env: {
          U1_BRIDGE_DATA_DIR: "/Volumes/Data/u1",
          SNAPMAKER_U1_BRIDGE_HOME: "/ignored",
        },
        homeDir: "/Users/tester",
      }),
      path.resolve("/Volumes/Data/u1")
    );
  });

  it("expands a home-relative override", () => {
    assert.equal(
      getBridgeDataDir({
        platform: "darwin",
        env: { U1_BRIDGE_DATA_DIR: "~/Custom U1" },
        homeDir: "/Users/tester",
      }),
      path.join("/Users/tester", "Custom U1")
    );
  });

  it("preserves the existing Windows data location", () => {
    assert.equal(
      getBridgeDataDir({
        platform: "win32",
        env: { APPDATA: "C:\\Users\\tester\\AppData\\Roaming" },
        homeDir: "C:\\Users\\tester",
      }),
      path.join("C:\\Users\\tester\\AppData\\Roaming", "BambuStudio-Bridge")
    );
  });

  it("preserves the existing Linux data location", () => {
    assert.equal(
      getBridgeDataDir({ platform: "linux", env: {}, homeDir: "/home/tester" }),
      path.join("/home/tester", "BambuStudio-Bridge")
    );
  });

  it("uses the native BambuStudio user directory on macOS and Windows", () => {
    assert.equal(
      getBambuStudioDataDir({ platform: "darwin", env: {}, homeDir: "/Users/tester" }),
      path.join("/Users/tester", "Library", "Application Support", "BambuStudio")
    );
    assert.equal(
      getBambuStudioDataDir({
        platform: "win32",
        env: { APPDATA: "C:\\Users\\tester\\AppData\\Roaming" },
        homeDir: "C:\\Users\\tester",
      }),
      path.join("C:\\Users\\tester\\AppData\\Roaming", "BambuStudio")
    );
  });
});
