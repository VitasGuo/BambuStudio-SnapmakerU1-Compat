function offlineStatus(error) {
  return {
    printer_reachable: false,
    klippy_connected: false,
    klippy_state: "",
    moonraker_version: "",
    error,
  };
}

async function probeMoonrakerStatus(baseUrl, headers, fetchWithTimeout, timeoutMs = 2500) {
  if (!baseUrl) return offlineStatus("No printer configured");
  if (typeof fetchWithTimeout !== "function") throw new Error("fetchWithTimeout dependency is required");

  try {
    const response = await fetchWithTimeout(`${baseUrl}/server/info`, { headers }, timeoutMs);
    if (!response.ok) throw new Error(`Moonraker HTTP ${response.status}`);
    const payload = await response.json();
    const info = payload && payload.result;
    if (!info || typeof info !== "object") throw new Error("Invalid Moonraker /server/info response");

    const klippyConnected = info.klippy_connected === true;
    const klippyState = String(info.klippy_state || "");
    return {
      printer_reachable: true,
      klippy_connected: klippyConnected,
      klippy_state: klippyState,
      moonraker_version: String(info.moonraker_version || ""),
      error: klippyConnected ? null : `Klippy is ${klippyState || "disconnected"}`,
    };
  } catch (error) {
    const message = error && error.name === "AbortError"
      ? "Moonraker status request timed out"
      : (error && error.message) || String(error);
    return offlineStatus(message);
  }
}

module.exports = { probeMoonrakerStatus };
