const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createMoonrakerHeaders,
  createMoonrakerWebSocketOptions,
} = require("../moonraker_auth");

describe("Moonraker authentication options", () => {
  it("adds the configured API key to HTTP and WebSocket headers", () => {
    assert.deepEqual(createMoonrakerHeaders("secret-key"), {
      "X-API-Key": "secret-key",
    });
    assert.deepEqual(createMoonrakerWebSocketOptions("secret-key"), {
      headers: { "X-API-Key": "secret-key" },
    });
  });

  it("does not send an empty authentication header", () => {
    assert.deepEqual(createMoonrakerHeaders(""), {});
    assert.deepEqual(createMoonrakerWebSocketOptions(""), { headers: {} });
  });
});
