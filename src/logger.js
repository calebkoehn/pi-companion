const fs = require("fs");
const path = require("path");
const { LOG_DIR } = require("./config");

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // Fall back to console-only if directory creation fails
}

function getLogFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `companion-${date}.log`);
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${metaStr}
`;
}

function writeToFile(formatted) {
  try {
    fs.appendFileSync(getLogFilePath(), formatted);
  } catch {
    // Silently fail file writes
  }
}

function info(message, meta) {
  const formatted = formatMessage("INFO", message, meta);
  writeToFile(formatted);
  if (process.env.NODE_ENV !== "production") {
    process.stdout.write(formatted);
  }
}

function warn(message, meta) {
  const formatted = formatMessage("WARN", message, meta);
  writeToFile(formatted);
  if (process.env.NODE_ENV !== "production") {
    process.stderr.write(formatted);
  }
}

function error(message, err) {
  const meta = err instanceof Error
    ? { message: err.message, stack: err.stack }
    : err;
  const formatted = formatMessage("ERROR", message, meta);
  writeToFile(formatted);
  if (process.env.NODE_ENV !== "production") {
    process.stderr.write(formatted);
  }
}

module.exports = { info, warn, error };