const { execSync } = require("child_process");
const crypto = require("crypto");

let cachedId = null;

function get() {
  if (cachedId) return cachedId;

  let raw = "";
  try {
    if (process.platform === "darwin") {
      raw = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3 }'",
        { encoding: "utf8" }
      ).trim().replace(/"/g, "");
    } else if (process.platform === "win32") {
      raw = execSync(
        "wmic csproduct get UUID",
        { encoding: "utf8" }
      ).split("\n").map(l => l.trim()).filter(l => l && l !== "UUID")[0] || "";
    } else {
      raw = execSync("cat /etc/machine-id", { encoding: "utf8" }).trim();
    }
  } catch {
    raw = `${require("os").hostname()}-${require("os").userInfo().username}`;
  }

  cachedId = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return cachedId;
}

module.exports = { get };