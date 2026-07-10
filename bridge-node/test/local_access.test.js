const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createLocalAccessControl,
  isAllowedHostHeader,
  isAllowedLocalURL,
  loadOrCreateSessionToken,
} = require("../local_access");

function mockRequest({ path = "/api/bridge/start_print.js", method = "GET", headers = {} } = {}) {
  return { path, method, headers };
}

function runMiddleware(control, request) {
  const result = { next: false, status: 200, headers: {}, body: null };
  const response = {
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; },
  };
  control.httpMiddleware(request, response, () => { result.next = true; });
  return result;
}

describe("local Bridge HTTP access control", () => {
  const port = 13628;

  it("accepts only loopback Host and local Origin values", () => {
    assert.equal(isAllowedHostHeader("127.0.0.1:13628", port), true);
    assert.equal(isAllowedHostHeader("localhost:13628", port), true);
    assert.equal(isAllowedHostHeader("evil.example:13628", port), false);
    assert.equal(isAllowedHostHeader("127.0.0.1.evil.example:13628", port), false);
    assert.equal(isAllowedLocalURL("http://127.0.0.1:13628/page", port), true);
    assert.equal(isAllowedLocalURL("https://evil.example/", port), false);
  });

  it("rejects a cross-site JSONP request before the route runs", () => {
    const control = createLocalAccessControl({ port, token: "test-token" });
    const result = runMiddleware(control, mockRequest({
      headers: {
        host: "127.0.0.1:13628",
        "user-agent": "Mozilla/5.0",
        "sec-fetch-site": "cross-site",
        referer: "https://evil.example/",
      },
    }));
    assert.equal(result.next, false);
    assert.equal(result.status, 403);
    assert.equal(result.body.reason, "cross_site_request");
  });

  it("bootstraps a Strict SameSite session on the local root", () => {
    const control = createLocalAccessControl({ port, token: "test-token" });
    const result = runMiddleware(control, mockRequest({
      path: "/",
      headers: {
        host: "127.0.0.1:13628",
        "user-agent": "Mozilla/5.0",
        "sec-fetch-site": "none",
      },
    }));
    assert.equal(result.next, true);
    assert.match(result.headers["set-cookie"], /u1_bridge_session=test-token/);
    assert.match(result.headers["set-cookie"], /HttpOnly/);
    assert.match(result.headers["set-cookie"], /SameSite=Strict/);
  });

  it("requires the session cookie for same-origin browser API calls", () => {
    const control = createLocalAccessControl({ port, token: "test-token" });
    const headers = {
      host: "127.0.0.1:13628",
      origin: "http://127.0.0.1:13628",
      referer: "http://127.0.0.1:13628/",
      "user-agent": "Mozilla/5.0",
      "sec-fetch-site": "same-origin",
    };
    const denied = runMiddleware(control, mockRequest({ headers }));
    assert.equal(denied.status, 403);
    assert.equal(denied.body.reason, "missing_local_session");

    const allowed = runMiddleware(control, mockRequest({
      headers: { ...headers, cookie: "u1_bridge_session=test-token" },
    }));
    assert.equal(allowed.next, true);
  });

  it("preserves native localhost clients that do not send browser headers", () => {
    const control = createLocalAccessControl({ port, token: "test-token" });
    const result = runMiddleware(control, mockRequest({
      headers: { host: "127.0.0.1:13628", "user-agent": "SnapmakerU1Bridge/5.38.0" },
    }));
    assert.equal(result.next, true);
  });

  it("rejects DNS-rebinding Host headers", () => {
    const control = createLocalAccessControl({ port, token: "test-token" });
    const result = runMiddleware(control, mockRequest({
      headers: { host: "attacker.example:13628", "user-agent": "Mozilla/5.0" },
    }));
    assert.equal(result.status, 403);
    assert.equal(result.body.reason, "invalid_host");
  });
});

describe("local Bridge session persistence", () => {
  it("reuses a strong token across restarts and stores it owner-only", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "u1-local-session-"));
    const tokenFile = path.join(temp, ".session_token");
    try {
      const first = loadOrCreateSessionToken(tokenFile);
      const second = loadOrCreateSessionToken(tokenFile);
      assert.match(first, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(second, first);
      assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o600);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe("local Bridge WebSocket access control", () => {
  const port = 13628;
  const control = createLocalAccessControl({ port, token: "test-token" });

  it("accepts the bootstrapped local WebUI WebSocket", () => {
    const allowed = control.isWebSocketAllowed(mockRequest({
      headers: {
        host: "127.0.0.1:13628",
        origin: "http://127.0.0.1:13628",
        "user-agent": "Mozilla/5.0",
        cookie: "u1_bridge_session=test-token",
      },
    }));
    assert.equal(allowed, true);
  });

  it("rejects an attacker Origin even if a cookie is supplied", () => {
    const allowed = control.isWebSocketAllowed(mockRequest({
      headers: {
        host: "127.0.0.1:13628",
        origin: "https://evil.example",
        "user-agent": "Mozilla/5.0",
        cookie: "u1_bridge_session=test-token",
      },
    }));
    assert.equal(allowed, false);
  });

  it("preserves non-browser localhost WebSocket clients", () => {
    assert.equal(control.isWebSocketAllowed(mockRequest({
      headers: { host: "127.0.0.1:13628" },
    })), true);
  });
});
