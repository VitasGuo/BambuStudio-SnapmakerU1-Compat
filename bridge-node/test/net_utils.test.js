/**
 * Unit tests for netUtils isLocalAddress / isLocalRequest (pure functions).
 * Run with: node --test test/net_utils.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isLocalAddress, isLocalRequest } = require("../netUtils");

function mockReq(addr, headers) {
  return { socket: { remoteAddress: addr }, headers: headers || {} };
}

describe("isLocalAddress — loopback variants", () => {
  it("accepts IPv4 loopback", () => {
    assert.equal(isLocalAddress("127.0.0.1"), true);
  });

  it("accepts IPv6 loopback", () => {
    assert.equal(isLocalAddress("::1"), true);
  });

  it("accepts IPv4-mapped IPv6 loopback", () => {
    assert.equal(isLocalAddress("::ffff:127.0.0.1"), true);
  });

  it("accepts IPv4-mapped IPv6 loopback in hex form", () => {
    assert.equal(isLocalAddress("::ffff:7f00:1"), true);
  });

  it("is case-insensitive for IPv6 addresses", () => {
    assert.equal(isLocalAddress("::FFFF:127.0.0.1"), true);
  });

  it("trims surrounding whitespace", () => {
    assert.equal(isLocalAddress(" 127.0.0.1 "), true);
  });
});

describe("isLocalAddress — remote addresses", () => {
  it("rejects a tailnet address (100.x.x.x)", () => {
    assert.equal(isLocalAddress("100.101.102.103"), false);
  });

  it("rejects a LAN address", () => {
    assert.equal(isLocalAddress("192.168.1.50"), false);
  });

  it("rejects IPv4-mapped IPv6 remote address", () => {
    assert.equal(isLocalAddress("::ffff:192.168.1.50"), false);
  });

  it("rejects a non-loopback 127.x address conservatively", () => {
    // Only 127.0.0.1 is treated as local; other 127.x (rarely seen from a
    // socket) fall through to remote to stay conservative.
    assert.equal(isLocalAddress("127.0.0.2"), false);
  });

  it("rejects another IPv6 address", () => {
    assert.equal(isLocalAddress("fe80::1"), false);
  });
});

describe("isLocalAddress — invalid input", () => {
  it("rejects null", () => {
    assert.equal(isLocalAddress(null), false);
  });

  it("rejects undefined", () => {
    assert.equal(isLocalAddress(undefined), false);
  });

  it("rejects empty string", () => {
    assert.equal(isLocalAddress(""), false);
  });

  it("rejects non-string input", () => {
    assert.equal(isLocalAddress(12345), false);
  });
});

describe("isLocalRequest — reverse-proxy awareness (tailscale serve)", () => {
  it("direct loopback request without proxy header is local", () => {
    assert.equal(isLocalRequest(mockReq("127.0.0.1")), true);
  });

  it("loopback with X-Forwarded-For is remote (tailscale serve proxy)", () => {
    assert.equal(isLocalRequest(mockReq("127.0.0.1", { "x-forwarded-for": "100.101.102.103" })), false);
  });

  it("IPv6 loopback with X-Forwarded-For is remote", () => {
    assert.equal(isLocalRequest(mockReq("::1", { "x-forwarded-for": "100.64.0.1" })), false);
  });

  it("IPv4-mapped loopback with X-Forwarded-For is remote", () => {
    assert.equal(isLocalRequest(mockReq("::ffff:127.0.0.1", { "x-forwarded-for": "100.96.74.91" })), false);
  });

  it("multi-hop X-Forwarded-For chain still counts as remote", () => {
    assert.equal(isLocalRequest(mockReq("127.0.0.1", { "x-forwarded-for": "100.1.1.1, 100.2.2.2" })), false);
  });

  it("tailnet address without headers is remote", () => {
    assert.equal(isLocalRequest(mockReq("100.96.74.91")), false);
  });

  it("LAN address without headers is remote", () => {
    assert.equal(isLocalRequest(mockReq("192.168.1.50")), false);
  });

  it("missing socket or request object is safely non-local", () => {
    assert.equal(isLocalRequest({ headers: {} }), false);
    assert.equal(isLocalRequest(null), false);
    assert.equal(isLocalRequest(undefined), false);
  });
});
