const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createMoonrakerProxyHeaders,
  shouldForwardMoonrakerResponseHeader,
} = require("../proxy_headers");

describe("Moonraker proxy request headers", () => {
  it("forwards only content negotiation/range headers and strips browser credentials", () => {
    const headers = createMoonrakerProxyHeaders({
      accept: "application/json",
      range: "bytes=0-99",
      cookie: "u1_bridge_session=local-secret",
      origin: "http://127.0.0.1:13628",
      referer: "http://127.0.0.1:13628/",
      "sec-fetch-site": "same-origin",
      authorization: "Bearer attacker",
      "x-api-key": "attacker-key",
      host: "127.0.0.1:13628",
    }, { "X-API-Key": "configured-key" });

    assert.deepEqual(headers, {
      accept: "application/json",
      range: "bytes=0-99",
      "X-API-Key": "configured-key",
    });
  });

  it("never forwards a caller API key when no key is configured", () => {
    assert.deepEqual(createMoonrakerProxyHeaders({ "x-api-key": "attacker-key" }), {});
  });

  it("strips printer cookies, authentication challenges, and hop-by-hop responses", () => {
    for (const name of [
      "Set-Cookie",
      "Clear-Site-Data",
      "WWW-Authenticate",
      "Proxy-Authenticate",
      "Connection",
      "Keep-Alive",
      "Transfer-Encoding",
      "Upgrade",
    ]) {
      assert.equal(shouldForwardMoonrakerResponseHeader(name), false, name);
    }
    assert.equal(shouldForwardMoonrakerResponseHeader("Content-Type"), true);
    assert.equal(shouldForwardMoonrakerResponseHeader("Content-Disposition"), true);
  });
});
