const ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-encoding",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "range",
]);

const BLOCKED_RESPONSE_HEADERS = new Set([
  "authentication-info",
  "clear-site-data",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authentication-info",
  "proxy-authorization",
  "set-cookie",
  "set-cookie2",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "www-authenticate",
]);

function createMoonrakerProxyHeaders(requestHeaders = {}, configuredHeaders = {}) {
  const headers = {};
  for (const [name, value] of Object.entries(requestHeaders)) {
    const normalized = name.toLowerCase();
    if (ALLOWED_REQUEST_HEADERS.has(normalized) && value !== undefined) {
      headers[normalized] = value;
    }
  }

  // Authentication belongs to the Bridge configuration. It is applied last
  // and can never be supplied or overridden by a browser/native caller.
  return { ...headers, ...configuredHeaders };
}

function shouldForwardMoonrakerResponseHeader(name) {
  const normalized = String(name || "").toLowerCase();
  return !!normalized && !BLOCKED_RESPONSE_HEADERS.has(normalized);
}

module.exports = { createMoonrakerProxyHeaders, shouldForwardMoonrakerResponseHeader };
