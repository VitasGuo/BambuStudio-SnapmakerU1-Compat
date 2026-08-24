/**
 * Network utilities for request-origin classification (v5.44.0).
 *
 * Used by handleUploadWithConfirm to decide where the print-confirmation
 * interaction happens: local requests pop the native desktop dialog, remote
 * requests (tailnet / LAN) defer confirmation to the remote-side WebUI so the
 * home machine stays a pure data bridge (no desktop popups).
 */

const LOCAL_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]);

/**
 * Check whether a socket remote address is a loopback address.
 * Pure function — accepts the address string from req.socket.remoteAddress.
 *
 * @param {string|null|undefined} addr - remote address as reported by the socket
 * @returns {boolean} true if the request originated from this machine
 */
function isLocalAddress(addr) {
  if (!addr || typeof addr !== "string") return false;
  return LOCAL_ADDRESSES.has(addr.trim().toLowerCase());
}

module.exports = { isLocalAddress };
