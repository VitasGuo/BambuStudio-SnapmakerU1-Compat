const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { probeMoonrakerStatus } = require("../bridge_status");

describe("probeMoonrakerStatus", () => {
  it("reports an unconfigured printer without performing a request", async () => {
    let called = false;
    const result = await probeMoonrakerStatus("", {}, async () => { called = true; });
    assert.equal(called, false);
    assert.equal(result.printer_reachable, false);
    assert.equal(result.klippy_connected, false);
    assert.match(result.error, /No printer configured/);
  });

  it("reports live Moonraker and Klippy state", async () => {
    const result = await probeMoonrakerStatus(
      "http://10.0.0.125:80",
      { "X-API-Key": "secret" },
      async (url, options, timeout) => {
        assert.equal(url, "http://10.0.0.125:80/server/info");
        assert.equal(options.headers["X-API-Key"], "secret");
        assert.equal(timeout, 2500);
        return {
          ok: true,
          json: async () => ({
            result: {
              klippy_connected: true,
              klippy_state: "ready",
              moonraker_version: "1.4.1",
            },
          }),
        };
      }
    );
    assert.deepEqual(result, {
      printer_reachable: true,
      klippy_connected: true,
      klippy_state: "ready",
      moonraker_version: "1.4.1",
      error: null,
    });
  });

  it("distinguishes reachable Moonraker from disconnected Klippy", async () => {
    const result = await probeMoonrakerStatus("http://printer", {}, async () => ({
      ok: true,
      json: async () => ({
        result: { klippy_connected: false, klippy_state: "shutdown", moonraker_version: "1.4.1" },
      }),
    }));
    assert.equal(result.printer_reachable, true);
    assert.equal(result.klippy_connected, false);
    assert.equal(result.klippy_state, "shutdown");
    assert.match(result.error, /shutdown/);
  });

  it("returns a stable timeout error", async () => {
    const timeoutError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const result = await probeMoonrakerStatus("http://printer", {}, async () => { throw timeoutError; });
    assert.equal(result.printer_reachable, false);
    assert.equal(result.error, "Moonraker status request timed out");
  });
});
