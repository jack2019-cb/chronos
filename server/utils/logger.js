/**
 * utils/logger.js - Simple console-based logger
 *
 * Provides standard logging functions matching the server's
 * existing console.log usage pattern.
 */

module.exports = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};
