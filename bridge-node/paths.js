const os = require("os");
const path = require("path");

/**
 * Resolve the Bridge's writable data directory without tying callers to a
 * specific desktop platform.  Arguments are injectable so path selection can
 * be tested without changing the host process.
 */
function getBridgeDataDir({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  const override = env.U1_BRIDGE_DATA_DIR || env.SNAPMAKER_U1_BRIDGE_HOME;
  if (override && override.trim()) {
    return path.resolve(expandHome(override.trim(), homeDir));
  }

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "SnapmakerU1Bridge");
  }

  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "BambuStudio-Bridge");
  }

  // Keep the existing Linux location so upgrades do not orphan config/logs.
  return path.join(homeDir, "BambuStudio-Bridge");
}

/** Return Bambu Studio's per-user data directory for the active platform. */
function getBambuStudioDataDir({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "BambuStudio");
  }

  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "BambuStudio");
  }

  return path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), "BambuStudio");
}

function expandHome(value, homeDir) {
  if (value === "~") return homeDir;
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(homeDir, value.slice(2));
  }
  return value;
}

module.exports = { getBridgeDataDir, getBambuStudioDataDir };
