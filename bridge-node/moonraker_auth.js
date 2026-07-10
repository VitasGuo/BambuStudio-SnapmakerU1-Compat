function createMoonrakerHeaders(apiKey) {
  const headers = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

function createMoonrakerWebSocketOptions(apiKey) {
  return { headers: createMoonrakerHeaders(apiKey) };
}

module.exports = { createMoonrakerHeaders, createMoonrakerWebSocketOptions };
