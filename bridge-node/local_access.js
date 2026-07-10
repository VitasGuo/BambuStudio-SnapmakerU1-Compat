const crypto = require("crypto");
const fs = require("fs");

const DEFAULT_COOKIE_NAME = "u1_bridge_session";

function isValidSessionToken(value) {
  return /^[A-Za-z0-9_-]{43}$/.test(String(value || ""));
}

function loadOrCreateSessionToken(filePath) {
  if (!filePath) throw new Error("session token file is required");
  try {
    const existing = fs.readFileSync(filePath, "utf-8").trim();
    if (isValidSessionToken(existing)) {
      try { fs.chmodSync(filePath, 0o600); } catch (_) {}
      return existing;
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(filePath, `${token}\n`, { encoding: "utf-8", mode: 0o600 });
  // mode only applies when creating a file, so also tighten replacements.
  try { fs.chmodSync(filePath, 0o600); } catch (_) {}
  return token;
}

function normalizedHostname(value) {
  return String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
}

function isLoopbackHostname(value) {
  const hostname = normalizedHostname(value);
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function parseHttpURL(value) {
  try {
    return new URL(value);
  } catch (_) {
    return null;
  }
}

function isAllowedHostHeader(hostHeader, port) {
  if (!hostHeader || /[\r\n]/.test(hostHeader)) return false;
  const parsed = parseHttpURL(`http://${hostHeader}`);
  if (!parsed || !isLoopbackHostname(parsed.hostname)) return false;
  return !parsed.port || Number(parsed.port) === Number(port);
}

function isAllowedLocalURL(value, port) {
  if (!value || value === "null") return false;
  const parsed = parseHttpURL(value);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return false;
  if (!isLoopbackHostname(parsed.hostname)) return false;
  return !parsed.port || Number(parsed.port) === Number(port);
}

function parseCookies(header) {
  const result = {};
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) result[name] = value;
  }
  return result;
}

function safeTokenEquals(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(String(actual));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function looksLikeBrowser(headers = {}) {
  const userAgent = String(headers["user-agent"] || "");
  return (
    /Mozilla|AppleWebKit|Chrome|Chromium|Safari|Firefox|Edg\//i.test(userAgent) ||
    !!headers.origin ||
    !!headers.referer ||
    !!headers["sec-fetch-site"]
  );
}

function createLocalAccessControl({ port, token, cookieName = DEFAULT_COOKIE_NAME } = {}) {
  if (!Number.isInteger(Number(port)) || Number(port) <= 0) throw new Error("valid port is required");
  const sessionToken = token || crypto.randomBytes(32).toString("base64url");

  function hasSessionCookie(req) {
    const cookies = parseCookies(req.headers && req.headers.cookie);
    return safeTokenEquals(cookies[cookieName], sessionToken);
  }

  function requestContext(req) {
    const headers = req.headers || {};
    const site = String(headers["sec-fetch-site"] || "").toLowerCase();
    const origin = headers.origin;
    const referer = headers.referer;
    return {
      hostAllowed: isAllowedHostHeader(headers.host, port),
      crossSite: site === "cross-site" || site === "same-site",
      originAllowed: !origin || isAllowedLocalURL(origin, port),
      refererAllowed: !referer || isAllowedLocalURL(referer, port),
      browser: looksLikeBrowser(headers),
      hasSession: hasSessionCookie(req),
    };
  }

  function deny(res, reason) {
    res.status(403).json({ error: "forbidden", reason });
  }

  function httpMiddleware(req, res, next) {
    const context = requestContext(req);
    if (!context.hostAllowed) return deny(res, "invalid_host");
    if (context.crossSite || !context.originAllowed || !context.refererAllowed) {
      return deny(res, "cross_site_request");
    }

    // Loading the local root is the bootstrap step for browser clients. A
    // Strict SameSite, host-only cookie is then required by browser API calls.
    if (req.method === "GET" && req.path === "/") {
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
      );
      return next();
    }

    if (context.browser && !context.hasSession) return deny(res, "missing_local_session");
    return next();
  }

  function isWebSocketAllowed(req) {
    const context = requestContext(req);
    if (!context.hostAllowed || context.crossSite || !context.originAllowed || !context.refererAllowed) {
      return false;
    }
    // Browser WebSockets always carry Origin and must also prove that the
    // local WebUI bootstrap established the SameSite session.
    if (context.browser) {
      return !!req.headers.origin && context.hasSession;
    }
    // Preserve non-browser localhost clients such as native diagnostics.
    return true;
  }

  function verifyWebSocket(info, done) {
    if (isWebSocketAllowed(info.req)) done(true);
    else done(false, 403, "Forbidden");
  }

  return {
    cookieName,
    httpMiddleware,
    isWebSocketAllowed,
    sessionToken,
    verifyWebSocket,
  };
}

module.exports = {
  createLocalAccessControl,
  isAllowedHostHeader,
  isAllowedLocalURL,
  isLoopbackHostname,
  loadOrCreateSessionToken,
  looksLikeBrowser,
  parseCookies,
};
